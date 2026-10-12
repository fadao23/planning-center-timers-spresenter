import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  TimerSyncController,
  type PcoApi,
  type StoragePort,
} from '../src/core/controller';
import { PcoError, type PcoCredentials } from '../src/core/pco-client';
import type { LiveDocument } from '../src/core/pco-types';
import type { TimerPatch } from '../src/core/timer-sync';
import { ME, PLAN_ITEMS, SOMEONE_ELSE, liveDoc } from './fixtures/live';

const T0 = Date.parse('2026-10-12T10:00:00.000Z');

/** A tiny in-memory Planning Center: LIVE pointer, controller, server clock. */
class FakePco implements PcoApi {
  index = -1; // -1 = not started; PLAN_ITEMS.length = end of service
  controller: string | null = null;
  startedAt: string | null = null;
  calls: string[] = [];
  failNext: PcoError | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly serverSkewMs = 0,
  ) {}

  private guard(name: string) {
    this.calls.push(name);
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
  }

  private doc(): LiveDocument {
    if (this.index >= PLAN_ITEMS.length)
      return liveDoc({ endOfService: true, controller: this.controller });
    return liveDoc({
      currentItemId: this.index >= 0 ? PLAN_ITEMS[this.index].id : null,
      liveStartAt: this.startedAt,
      controller: this.controller,
    });
  }

  private move(step: number) {
    let i = this.index;
    do i += step;
    while (i >= 0 && i < PLAN_ITEMS.length && PLAN_ITEMS[i].item_type === 'header');
    this.index = Math.max(-1, Math.min(PLAN_ITEMS.length, i));
    this.startedAt = new Date(this.clock.now + this.serverSkewMs).toISOString();
  }

  async getOrganizationName() {
    this.guard('org');
    return 'Word of Life';
  }
  async listServiceTypes() {
    this.guard('serviceTypes');
    return [{ id: '77', name: 'Sunday' }];
  }
  async listPlans(serviceTypeId: string) {
    this.guard(`plans:${serviceTypeId}`);
    return [{ id: '9001', title: 'Sunday Service', dates: 'Oct 12', sortDate: null }];
  }
  async getLive() {
    this.guard('getLive');
    return this.doc();
  }
  async toggleControl() {
    this.guard('toggle');
    this.controller = this.controller ? null : ME;
    return this.doc();
  }
  async goToNextItem() {
    this.guard('next');
    this.clock.now += 80; // network
    this.move(+1);
    this.clock.now += 80;
    return this.doc();
  }
  async goToPreviousItem() {
    this.guard('previous');
    this.move(-1);
    return this.doc();
  }
}

class Clock {
  now = T0;
}

class MemoryStorage implements StoragePort {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async set(key: string, value: unknown) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
}

class FakeTimer {
  sets: TimerPatch[] = [];
  clears = 0;
  async set(patch: TimerPatch) {
    this.sets.push(patch);
  }
  async clear() {
    this.clears++;
  }
  get last() {
    return this.sets[this.sets.length - 1];
  }
}

let clock: Clock;
let pco: FakePco;
let storage: MemoryStorage;
let timer: FakeTimer;
let created: PcoCredentials[];

function makeController(skewMs = 0) {
  pco = new FakePco(clock, skewMs);
  return new TimerSyncController({
    createClient: (c) => {
      created.push(c);
      return pco;
    },
    timer,
    storage,
    now: () => clock.now,
    resyncIntervalMs: 60_000,
    rateLimitBackoffMs: 30_000,
  });
}

async function readyController(skewMs = 0) {
  const ctl = makeController(skewMs);
  await ctl.saveCredentials(' app ', ' secret ');
  await ctl.selectServiceType('77');
  await ctl.selectPlan('9001');
  return ctl;
}

beforeEach(() => {
  clock = new Clock();
  storage = new MemoryStorage();
  timer = new FakeTimer();
  created = [];
});

describe('connecting', () => {
  it('starts without credentials', async () => {
    const ctl = makeController();
    await ctl.init();
    expect(ctl.getState()).toMatchObject({
      phase: 'needs-credentials',
      organization: null,
      error: null,
    });
  });

  it('validates, trims and stores credentials, then loads service types', async () => {
    const ctl = makeController();
    await ctl.saveCredentials(' app ', ' secret ');
    expect(created).toEqual([{ appId: 'app', secret: 'secret' }]);
    expect(storage.data.get(STORAGE_KEYS.credentials)).toEqual({ appId: 'app', secret: 'secret' });
    expect(ctl.getState()).toMatchObject({
      phase: 'ready',
      organization: 'Word of Life',
      serviceTypes: [{ id: '77', name: 'Sunday' }],
    });
  });

  it('does not store credentials that Planning Center rejects', async () => {
    const ctl = makeController();
    pco.failNext = new PcoError(401, 'Planning Center rejected the credentials (401)');
    await ctl.saveCredentials('app', 'wrong');
    expect(storage.data.has(STORAGE_KEYS.credentials)).toBe(false);
    expect(ctl.getState()).toMatchObject({
      phase: 'needs-credentials',
      error: expect.stringMatching(/401/),
    });
  });

  it('requires both fields', async () => {
    const ctl = makeController();
    await ctl.saveCredentials('app', '   ');
    expect(ctl.getState().error).toMatch(/required/);
    expect(created).toHaveLength(0);
  });

  it('restores credentials, selection and offset on init', async () => {
    storage.data.set(STORAGE_KEYS.credentials, { appId: 'a', secret: 's' });
    storage.data.set(STORAGE_KEYS.selection, { serviceTypeId: '77', planId: '9001' });
    storage.data.set(STORAGE_KEYS.clockOffset, 1500);
    storage.data.set(STORAGE_KEYS.controller, ME);
    const ctl = makeController();
    pco.controller = ME;
    await ctl.init();
    const state = ctl.getState();
    expect(state).toMatchObject({ phase: 'ready', clockOffsetMs: 1500, inControl: true });
    expect(state.plans).toHaveLength(1);
    expect(state.live?.status).toBe('not-started');
  });

  it('forgets everything on disconnect and clears a timer it set', async () => {
    const ctl = await readyController();
    await ctl.next();
    await ctl.forgetCredentials();
    expect(storage.data.has(STORAGE_KEYS.credentials)).toBe(false);
    expect(timer.clears).toBe(1);
    expect(ctl.getState()).toMatchObject({ phase: 'needs-credentials', live: null, timer: null });
  });
});

describe('selection', () => {
  it('needs a service type before a plan', async () => {
    const ctl = makeController();
    await ctl.saveCredentials('a', 's');
    await ctl.selectPlan('9001');
    expect(ctl.getState().error).toMatch(/service type/);
  });

  it('stores the selection and reads LIVE for the chosen plan', async () => {
    const ctl = await readyController();
    expect(storage.data.get(STORAGE_KEYS.selection)).toEqual({
      serviceTypeId: '77',
      planId: '9001',
    });
    expect(ctl.getState().live?.status).toBe('not-started');
    expect(timer.sets).toHaveLength(0);
  });

  it('refreshes plans for the selected service type', async () => {
    const ctl = await readyController();
    pco.calls = [];
    await ctl.refreshPlans();
    expect(pco.calls).toEqual(['plans:77']);
  });

  it('refuses to work before connecting', async () => {
    const ctl = makeController();
    await ctl.selectServiceType('77');
    expect(ctl.getState().error).toMatch(/Connect/);
  });
});

describe('LIVE control', () => {
  it('takes control with one toggle when nobody has it', async () => {
    const ctl = await readyController();
    pco.calls = [];
    await ctl.takeControl();
    expect(pco.calls).toEqual(['toggle']);
    expect(ctl.getState().inControl).toBe(true);
    expect(storage.data.get(STORAGE_KEYS.controller)).toBe(ME);
  });

  it('toggles twice to take control from someone else', async () => {
    const ctl = await readyController();
    pco.controller = SOMEONE_ELSE;
    pco.calls = [];
    await ctl.takeControl();
    expect(pco.calls).toEqual(['toggle', 'toggle']);
    expect(pco.controller).toBe(ME);
  });

  it('releases control', async () => {
    const ctl = await readyController();
    await ctl.takeControl();
    await ctl.releaseControl();
    expect(pco.controller).toBeNull();
    expect(ctl.getState().inControl).toBe(false);
    expect(storage.data.has(STORAGE_KEYS.controller)).toBe(false);
  });

  it('release is a no-op toggle-wise when nobody controls', async () => {
    const ctl = await readyController();
    pco.calls = [];
    await ctl.releaseControl();
    expect(pco.calls).toEqual(['getLive']);
  });

  it('reports a controller that never appears', async () => {
    const ctl = await readyController();
    pco.toggleControl = async () => liveDoc({ controller: null });
    await ctl.takeControl();
    expect(ctl.getState().error).toMatch(/did not hand over/);
  });
});

describe('advancing and the timer', () => {
  it('takes control on the first advance, then sets the timer to PCO start + length', async () => {
    const ctl = await readyController();
    pco.calls = [];
    await ctl.next();
    expect(pco.calls).toEqual(['toggle', 'next']);
    const live = ctl.getState().live!;
    expect(live.current?.title).toBe('Countdown video');
    // PCO stamped T0+80 ms; the round-trip midpoint is also T0+80 ms → offset 0.
    expect(ctl.getState().clockOffsetMs).toBe(0);
    expect(timer.last).toEqual({
      mode: 'target',
      endTime: T0 + 80 + 300_000,
      remainingMs: 299_920, // applied at T0+160 ms, when the answer arrived
      running: true,
      allowNegative: true,
    });
  });

  it('corrects for a skewed PCO clock', async () => {
    const ctl = await readyController(5_000); // PCO is 5 s ahead
    await ctl.next();
    expect(ctl.getState().clockOffsetMs).toBe(5_000);
    expect(storage.data.get(STORAGE_KEYS.clockOffset)).toBe(5_000);
    expect(timer.last.endTime).toBe(T0 + 80 + 300_000); // local end, same as unskewed
  });

  it('only takes control once, and moves item by item (skipping headers)', async () => {
    const ctl = await readyController();
    await ctl.next();
    pco.calls = [];
    await ctl.next();
    await ctl.next();
    expect(pco.calls).toEqual(['next', 'next']);
    expect(ctl.getState().live?.current?.title).toBe('Amazing Grace');
    expect(timer.sets).toHaveLength(3);
  });

  it('goes back with previous', async () => {
    const ctl = await readyController();
    await ctl.next();
    await ctl.next();
    await ctl.previous();
    expect(ctl.getState().live?.current?.title).toBe('Countdown video');
  });

  it('clears the timer at the end of the service', async () => {
    const ctl = await readyController();
    for (let i = 0; i < 5; i++) await ctl.next();
    expect(ctl.getState().live?.status).toBe('ended');
    expect(timer.clears).toBe(1);
    expect(ctl.getState().timer).toBeNull();
  });

  it('runs quick presses in order', async () => {
    const ctl = await readyController();
    await Promise.all([ctl.next(), ctl.next(), ctl.next()]);
    expect(ctl.getState().live?.current?.title).toBe('Amazing Grace');
  });
});

describe('resync and heartbeat', () => {
  it('does not touch the timer when nothing changed', async () => {
    const ctl = await readyController();
    await ctl.next();
    const before = timer.sets.length;
    clock.now += 61_000;
    await ctl.resync();
    expect(timer.sets).toHaveLength(before);
  });

  it('follows a change made in Planning Center itself', async () => {
    const ctl = await readyController();
    await ctl.next();
    clock.now += 61_000;
    await pco.goToNextItem(); // someone else advanced in PCO
    pco.calls = [];
    await ctl.tick();
    expect(pco.calls).toEqual(['getLive']);
    expect(ctl.getState().live?.current?.title).toBe('Welcome');
    expect(timer.sets).toHaveLength(2);
  });

  it('ticks at most once per interval and only with a plan', async () => {
    const idle = makeController();
    await idle.tick();
    expect(pco.calls).toEqual([]);

    const ctl = await readyController();
    pco.calls = [];
    clock.now += 30_000;
    await ctl.tick();
    expect(pco.calls).toEqual([]);
    clock.now += 31_000;
    await ctl.tick();
    expect(pco.calls).toEqual(['getLive']);
  });

  it('backs off after a 429', async () => {
    const ctl = await readyController();
    clock.now += 61_000;
    pco.failNext = new PcoError(429, 'Planning Center rate limit reached (429), retrying shortly');
    await ctl.tick();
    expect(ctl.getState().error).toMatch(/429/);
    pco.calls = [];
    clock.now += 10_000;
    await ctl.tick();
    expect(pco.calls).toEqual([]);
    clock.now += 25_000;
    await ctl.tick();
    expect(pco.calls).toEqual(['getLive']);
    expect(ctl.getState().error).toBeNull();
  });

  it('notifies listeners and stops after unsubscribe', async () => {
    const ctl = makeController();
    const seen: boolean[] = [];
    const off = ctl.onChange((s) => seen.push(s.busy));
    await ctl.saveCredentials('a', 's');
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(false);
    off();
    const count = seen.length;
    await ctl.refreshPlans();
    expect(seen).toHaveLength(count);
  });
});
