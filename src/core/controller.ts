// The plugin's brain, written against small ports so it runs the same in the
// Spresenter logic thread and in unit tests.
//
// Model (the ProPresenter way): Spresenter LEADS. The operator advances, we call
// Planning Center LIVE once, and set Spresenter's timer to end where PCO's item
// ends. Between advances the timer runs locally; an occasional resync only
// catches changes made elsewhere (someone clicking in PCO itself).

import { parseLive, type LiveState } from './live-state';
import type { PublicState } from './messages';
import {
  PcoError,
  type PcoClient,
  type PcoCredentials,
  type PlanSummary,
  type ServiceTypeSummary,
} from './pco-client';
import type { LiveDocument } from './pco-types';
import {
  computeTimerTarget,
  estimateClockOffset,
  sameTarget,
  toTimerPatch,
  type TimerPatch,
  type TimerTarget,
} from './timer-sync';

export type PcoApi = Pick<
  PcoClient,
  | 'getOrganizationName'
  | 'listServiceTypes'
  | 'listPlans'
  | 'getLive'
  | 'toggleControl'
  | 'goToNextItem'
  | 'goToPreviousItem'
>;

export interface TimerPort {
  set(patch: TimerPatch): Promise<unknown>;
  clear(): Promise<unknown>;
}

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ControllerDeps {
  createClient(credentials: PcoCredentials): PcoApi;
  timer: TimerPort;
  storage: StoragePort;
  now(): number;
  log?(message: string): void;
  /** How often `tick()` re-reads LIVE to catch changes made outside Spresenter. */
  resyncIntervalMs?: number;
  /** Pause after a 429 before the next automatic call. */
  rateLimitBackoffMs?: number;
}

export const STORAGE_KEYS = {
  credentials: 'pco.credentials',
  selection: 'pco.selection',
  clockOffset: 'pco.clockOffsetMs',
  controller: 'pco.controller',
} as const;

interface Selection {
  serviceTypeId: string | null;
  planId: string | null;
}

export class TimerSyncController {
  private client: PcoApi | null = null;
  private organization: string | null = null;
  private serviceTypes: ServiceTypeSummary[] = [];
  private plans: PlanSummary[] = [];
  private selection: Selection = { serviceTypeId: null, planId: null };
  private live: LiveState | null = null;
  private myController: string | null = null;
  private appliedTarget: TimerTarget | null = null;
  private clockOffsetMs = 0;
  private lastSyncAt: number | null = null;
  private backoffUntil = 0;
  private connecting = false;
  private busy = 0;
  private error: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(state: PublicState) => void>();
  private readonly resyncIntervalMs: number;
  private readonly rateLimitBackoffMs: number;

  constructor(private readonly deps: ControllerDeps) {
    this.resyncIntervalMs = deps.resyncIntervalMs ?? 60_000;
    this.rateLimitBackoffMs = deps.rateLimitBackoffMs ?? 30_000;
  }

  onChange(listener: (state: PublicState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): PublicState {
    return {
      phase: this.connecting ? 'connecting' : this.client ? 'ready' : 'needs-credentials',
      organization: this.organization,
      serviceTypes: this.serviceTypes,
      plans: this.plans,
      selection: { ...this.selection },
      live: this.live,
      inControl: this.isInControl(),
      timer: this.appliedTarget,
      clockOffsetMs: this.clockOffsetMs,
      lastSyncAt: this.lastSyncAt,
      busy: this.busy > 0,
      error: this.error,
    };
  }

  /** Restore what was saved: credentials, chosen plan, clock offset. */
  init(): Promise<void> {
    return this.run(async () => {
      const { storage } = this.deps;
      this.clockOffsetMs = (await storage.get<number>(STORAGE_KEYS.clockOffset)) ?? 0;
      this.myController = (await storage.get<string>(STORAGE_KEYS.controller)) ?? null;
      this.selection = {
        serviceTypeId: null,
        planId: null,
        ...(await storage.get<Selection>(STORAGE_KEYS.selection)),
      };
      const credentials = await storage.get<PcoCredentials>(STORAGE_KEYS.credentials);
      if (!credentials) return;
      await this.connect(credentials);
      if (this.selection.serviceTypeId)
        this.plans = await this.api().listPlans(this.selection.serviceTypeId);
      if (this.selection.planId) await this.syncLive();
    });
  }

  saveCredentials(appId: string, secret: string): Promise<void> {
    return this.run(async () => {
      const credentials = { appId: appId.trim(), secret: secret.trim() };
      if (!credentials.appId || !credentials.secret) {
        throw new Error('Both the Application ID and the Secret are required');
      }
      await this.connect(credentials);
      await this.deps.storage.set(STORAGE_KEYS.credentials, credentials);
    });
  }

  forgetCredentials(): Promise<void> {
    return this.run(async () => {
      await this.deps.storage.delete(STORAGE_KEYS.credentials);
      await this.deps.storage.delete(STORAGE_KEYS.controller);
      this.client = null;
      this.organization = null;
      this.serviceTypes = [];
      this.plans = [];
      this.live = null;
      this.myController = null;
      await this.applyTarget(null);
    });
  }

  selectServiceType(serviceTypeId: string): Promise<void> {
    return this.run(async () => {
      this.selection = { serviceTypeId, planId: null };
      this.live = null;
      this.lastSyncAt = null;
      await this.deps.storage.set(STORAGE_KEYS.selection, this.selection);
      await this.applyTarget(null);
      this.plans = await this.api().listPlans(serviceTypeId);
    });
  }

  refreshPlans(): Promise<void> {
    return this.run(async () => {
      if (this.selection.serviceTypeId) {
        this.plans = await this.api().listPlans(this.selection.serviceTypeId);
      }
    });
  }

  selectPlan(planId: string): Promise<void> {
    return this.run(async () => {
      if (!this.selection.serviceTypeId) throw new Error('Choose a service type first');
      this.selection = { ...this.selection, planId };
      this.live = null;
      await this.deps.storage.set(STORAGE_KEYS.selection, this.selection);
      await this.applyTarget(null);
      await this.syncLive();
    });
  }

  /**
   * Become the LIVE controller. `toggle_control` flips between "nobody" and
   * "the caller", so a second toggle is needed when someone (or a stale us)
   * already held control.
   */
  takeControl(): Promise<void> {
    return this.run(() => this.ensureControl(true));
  }

  releaseControl(): Promise<void> {
    return this.run(async () => {
      const { serviceTypeId, planId } = this.requirePlan();
      const live = parseLive(await this.api().getLive(serviceTypeId, planId));
      if (live.controller !== null) {
        await this.applyLive(parseLive(await this.api().toggleControl(serviceTypeId, planId)));
      } else {
        await this.applyLive(live);
      }
      this.myController = null;
      await this.deps.storage.delete(STORAGE_KEYS.controller);
    });
  }

  next(): Promise<void> {
    return this.run(() => this.advance('next'));
  }

  previous(): Promise<void> {
    return this.run(() => this.advance('previous'));
  }

  resync(): Promise<void> {
    return this.run(() => this.syncLive());
  }

  /** Cheap heartbeat: re-reads LIVE at most every `resyncIntervalMs`. */
  tick(): Promise<void> {
    const now = this.deps.now();
    if (!this.client || !this.selection.planId || this.busy > 0 || now < this.backoffUntil) {
      return Promise.resolve();
    }
    if (this.lastSyncAt !== null && now - this.lastSyncAt < this.resyncIntervalMs) {
      return Promise.resolve();
    }
    return this.run(() => this.syncLive());
  }

  // ---- internals -----------------------------------------------------------

  private async connect(credentials: PcoCredentials): Promise<void> {
    this.connecting = true;
    this.emit();
    try {
      const client = this.deps.createClient(credentials);
      this.organization = await client.getOrganizationName();
      this.serviceTypes = await client.listServiceTypes();
      this.client = client;
    } finally {
      this.connecting = false;
    }
  }

  private async ensureControl(force: boolean): Promise<void> {
    const { serviceTypeId, planId } = this.requirePlan();
    if (!force && this.isInControl()) return;
    let doc = await this.api().toggleControl(serviceTypeId, planId);
    if (doc.data.links?.controller == null) {
      doc = await this.api().toggleControl(serviceTypeId, planId);
    }
    const live = parseLive(doc);
    if (!live.controller) throw new Error('Planning Center did not hand over LIVE control');
    this.myController = live.controller;
    await this.deps.storage.set(STORAGE_KEYS.controller, live.controller);
    await this.applyLive(live);
  }

  private async advance(direction: 'next' | 'previous'): Promise<void> {
    const { serviceTypeId, planId } = this.requirePlan();
    await this.ensureControl(false);
    const previousItemId = this.live?.current?.id ?? null;

    const sentAt = this.deps.now();
    const doc: LiveDocument =
      direction === 'next'
        ? await this.api().goToNextItem(serviceTypeId, planId)
        : await this.api().goToPreviousItem(serviceTypeId, planId);
    const receivedAt = this.deps.now();

    const live = parseLive(doc);
    if (live.current && live.current.id !== previousItemId) {
      const offset = estimateClockOffset(live.current.liveStartAt, sentAt, receivedAt);
      if (offset !== null) {
        this.clockOffsetMs = offset;
        await this.deps.storage.set(STORAGE_KEYS.clockOffset, offset);
      }
    }
    await this.applyLive(live);
  }

  private async syncLive(): Promise<void> {
    const { serviceTypeId, planId } = this.requirePlan();
    await this.applyLive(parseLive(await this.api().getLive(serviceTypeId, planId)));
  }

  private async applyLive(live: LiveState): Promise<void> {
    this.live = live;
    this.lastSyncAt = this.deps.now();
    await this.applyTarget(computeTimerTarget(live, this.clockOffsetMs));
  }

  /** Touch the Spresenter timer only when the target really changes. */
  private async applyTarget(target: TimerTarget | null): Promise<void> {
    if (sameTarget(this.appliedTarget, target)) return;
    if (target) {
      await this.deps.timer.set(toTimerPatch(target, this.deps.now()));
    } else {
      await this.deps.timer.clear();
    }
    this.appliedTarget = target;
  }

  private isInControl(): boolean {
    const controller = this.live?.controller ?? null;
    return controller !== null && controller === this.myController;
  }

  private requirePlan(): { serviceTypeId: string; planId: string } {
    const { serviceTypeId, planId } = this.selection;
    if (!serviceTypeId || !planId) throw new Error('Choose a service type and a plan first');
    return { serviceTypeId, planId };
  }

  private api(): PcoApi {
    if (!this.client) throw new Error('Connect to Planning Center first');
    return this.client;
  }

  /** Serialize operations (two quick "next" presses = two advances, in order). */
  private run(task: () => Promise<void>): Promise<void> {
    const result = this.queue.then(async () => {
      this.busy++;
      this.emit();
      try {
        await task();
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        if (err instanceof PcoError && err.isRateLimited) {
          this.backoffUntil = this.deps.now() + this.rateLimitBackoffMs;
        }
        this.deps.log?.(`[pco-timers] ${this.error}`);
      } finally {
        this.busy--;
        this.emit();
      }
    });
    this.queue = result;
    return result;
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}
