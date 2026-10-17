// Stage display: draws the Planning Center countdown, the current item and the
// next item on a Spresenter output (typically the stage screen).
//
// Same pattern as the Raffle example: apply a presentation with ONE full-screen
// element once per output/layer, then push self-contained HTML into it. The
// countdown is re-rendered locally (no Planning Center call); a patch is only
// sent when the rendered HTML actually changes, i.e. about once a second.

import { formatCountdown, formatLength } from './format';
import type { LiveStatus } from './live-state';
import type { PublicState } from './messages';
import type { StoragePort } from './controller';

export type StageLayout = 'full' | 'bar';

export interface StageConfig {
  /** Spresenter output id (its index as a string), null until chosen. */
  output: string | null;
  layer: number;
  layout: StageLayout;
  /** The operator asked for the stage display to be on screen. */
  enabled: boolean;
}

export interface StageOutput {
  id: string;
  name: string;
}

export interface StageLayer {
  index: number;
  name: string;
}

export interface StageState {
  config: StageConfig;
  outputs: StageOutput[];
  layers: StageLayer[];
  /** The presentation is currently applied on config.output/config.layer. */
  active: boolean;
  error: string | null;
}

/** What the stage shows, derived from the controller state. */
export interface StageView {
  status: LiveStatus | 'idle';
  planTitle: string | null;
  current: string | null;
  position: string | null;
  next: { title: string; lengthSec: number } | null;
  /** Local epoch ms when the current item's planned time runs out. */
  endTime: number | null;
}

export interface LivePort {
  listOutputs(): Promise<StageOutput[]>;
  listLayers(): Promise<StageLayer[]>;
  apply(output: string, layer: number, presentation: StagePresentation): Promise<void>;
  show(output: string, layer: number): Promise<void>;
  setHtml(output: string, layer: number, elementId: string, html: string): Promise<void>;
  clear(output: string, layer: number): Promise<void>;
}

export interface StageDeps {
  live: LivePort;
  storage: StoragePort;
  now(): number;
  log?(message: string): void;
}

export const STAGE_ELEMENT_ID = 'pco-stage';
export const STAGE_STORAGE_KEY = 'stage.config';
/** Below this many seconds the countdown turns amber. */
export const WARN_SECONDS = 60;

const DEFAULT_CONFIG: StageConfig = { output: null, layer: 0, layout: 'full', enabled: false };

const IDLE_VIEW: StageView = {
  status: 'idle',
  planTitle: null,
  current: null,
  position: null,
  next: null,
  endTime: null,
};

export type StagePresentation = ReturnType<typeof buildStagePresentation>;

export function buildStagePresentation() {
  return {
    title: 'Planning Center Timer',
    asset: {
      type: 'presentation',
      guid: 'plugin-pco-timers-stage',
      title: 'Planning Center Timer',
    },
    theme: {
      title: 'Planning Center Timer',
      css: {},
      elements: [
        {
          id: STAGE_ELEMENT_ID,
          type: 'RECTANGLE',
          x: 0,
          y: 0,
          visible: true,
          css: { position: 'absolute', width: '100%', height: '100%' },
        },
      ],
    },
    props: {},
  };
}

export function stageViewFromState(state: PublicState): StageView {
  const live = state.live;
  if (!live) return IDLE_VIEW;
  return {
    status: live.status,
    planTitle: live.planTitle,
    current: live.current?.title ?? null,
    position: live.current ? `${live.current.position} / ${live.itemCount}` : null,
    next: live.next ? { title: live.next.title, lengthSec: live.next.lengthSec } : null,
    endTime: state.timer?.endTime ?? null,
  };
}

export function countdownTone(remainingMs: number | null): 'idle' | 'ok' | 'warn' | 'over' {
  if (remainingMs === null) return 'idle';
  if (remainingMs <= -1000) return 'over';
  if (remainingMs <= WARN_SECONDS * 1000) return 'warn';
  return 'ok';
}

export function renderStageHtml(view: StageView, now: number, layout: StageLayout): string {
  const remaining = view.endTime === null ? null : view.endTime - now;
  const tone = countdownTone(remaining);
  const clock = remaining === null ? '--:--' : formatCountdown(remaining);

  let headline: string;
  let sub = view.position ? `Item ${view.position}` : '';
  if (view.status === 'running') {
    headline = view.current ?? '';
  } else if (view.status === 'not-started') {
    headline = 'Service not started';
    sub = view.planTitle ?? '';
  } else if (view.status === 'ended') {
    headline = 'End of service';
    sub = '';
  } else {
    headline = '';
    sub = '';
  }
  const next = view.next ? `Next: ${view.next.title} · ${formatLength(view.next.lengthSec)}` : '';

  const body =
    layout === 'bar'
      ? `<div class="bar"><div class="clock ${tone}">${esc(clock)}</div><div class="info"><div class="title">${esc(headline)}</div><div class="next">${esc(next)}</div></div></div>`
      : `<div class="time">${esc(timeOfDay(now))}</div><div class="title">${esc(headline)}</div><div class="sub">${esc(sub)}</div><div class="clock ${tone}">${esc(clock)}</div><div class="next">${esc(next)}</div>`;

  return `<div id="pco-stage" class="${layout}-layout">${body}</div><style>${layout === 'bar' ? BAR_CSS : FULL_CSS}${TONE_CSS}</style>`;
}

const FONT = `font-family:'Inter','Segoe UI',Arial,sans-serif;color:#fff;`;
const ELLIPSIS = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:92cqw;';

const FULL_CSS =
  `#pco-stage.full-layout{position:absolute;inset:0;container-type:size;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;${FONT}}` +
  `#pco-stage.full-layout .time{position:absolute;top:3cqh;right:3cqw;font-size:5cqh;font-weight:600;opacity:.7;font-variant-numeric:tabular-nums;}` +
  `#pco-stage.full-layout .title{font-size:8cqh;font-weight:700;${ELLIPSIS}}` +
  `#pco-stage.full-layout .sub{font-size:4cqh;opacity:.6;min-height:5cqh;}` +
  `#pco-stage.full-layout .clock{font-size:38cqh;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}` +
  `#pco-stage.full-layout .next{font-size:6cqh;opacity:.8;margin-top:2cqh;${ELLIPSIS}}`;

const BAR_CSS =
  `#pco-stage.bar-layout{position:absolute;inset:0;container-type:size;background:transparent;${FONT}}` +
  `#pco-stage.bar-layout .bar{position:absolute;left:0;right:0;bottom:0;height:18cqh;display:flex;align-items:center;gap:4cqw;padding:0 4cqw;background:rgba(0,0,0,.78);}` +
  `#pco-stage.bar-layout .clock{font-size:13cqh;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}` +
  `#pco-stage.bar-layout .info{display:flex;flex-direction:column;min-width:0;}` +
  `#pco-stage.bar-layout .title{font-size:5.5cqh;font-weight:700;${ELLIPSIS}}` +
  `#pco-stage.bar-layout .next{font-size:4cqh;opacity:.8;${ELLIPSIS}}`;

const TONE_CSS =
  `#pco-stage .clock.idle{opacity:.35;}` +
  `#pco-stage .clock.warn{color:#fbbf24;}` +
  `#pco-stage .clock.over{color:#ef4444;}`;

function timeOfDay(now: number): string {
  const d = new Date(now);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export class StageDisplay {
  private config: StageConfig = { ...DEFAULT_CONFIG };
  private outputs: StageOutput[] = [];
  private layers: StageLayer[] = [];
  /** "output:layer" where the presentation is applied, or null. */
  private appliedKey: string | null = null;
  private lastHtml: string | null = null;
  private view: StageView = IDLE_VIEW;
  private error: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(state: StageState) => void>();

  constructor(private readonly deps: StageDeps) {}

  onChange(listener: (state: StageState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): StageState {
    return {
      config: { ...this.config },
      outputs: this.outputs,
      layers: this.layers,
      active: this.appliedKey !== null,
      error: this.error,
    };
  }

  /** Restore the saved configuration; put the display back if it was on. */
  init(): Promise<void> {
    return this.run(async () => {
      const saved = await this.deps.storage.get<Partial<StageConfig>>(STAGE_STORAGE_KEY);
      this.config = { ...DEFAULT_CONFIG, ...saved };
      await this.loadTargets();
      if (this.config.enabled && this.config.output !== null) await this.applyTo(this.config);
    });
  }

  refreshTargets(): Promise<void> {
    return this.run(() => this.loadTargets());
  }

  configure(patch: Partial<Pick<StageConfig, 'output' | 'layer' | 'layout'>>): Promise<void> {
    return this.run(async () => {
      const next = { ...this.config, ...patch };
      const moved = next.output !== this.config.output || next.layer !== this.config.layer;
      if (this.appliedKey && moved) {
        await this.clearApplied();
        this.config = next;
        await this.applyTo(next);
      } else {
        this.config = next;
        await this.render(true);
      }
      await this.save();
    });
  }

  show(): Promise<void> {
    return this.run(async () => {
      if (this.config.output === null) throw new Error('Choose the stage output first');
      this.config = { ...this.config, enabled: true };
      await this.save();
      await this.applyTo(this.config);
    });
  }

  hide(): Promise<void> {
    return this.run(async () => {
      this.config = { ...this.config, enabled: false };
      await this.save();
      await this.clearApplied();
    });
  }

  /** New controller state (item changed, timer moved…). */
  update(view: StageView): Promise<void> {
    this.view = view;
    return this.tick();
  }

  /** Re-render the countdown; only sends a patch when the text changed. */
  tick(): Promise<void> {
    if (!this.appliedKey) return Promise.resolve();
    return this.run(() => this.render(false), false);
  }

  // ---- internals -----------------------------------------------------------

  private async loadTargets(): Promise<void> {
    [this.outputs, this.layers] = await Promise.all([
      this.deps.live.listOutputs(),
      this.deps.live.listLayers(),
    ]);
  }

  private async applyTo(config: StageConfig): Promise<void> {
    const output = config.output!;
    await this.deps.live.apply(output, config.layer, buildStagePresentation());
    await this.deps.live.show(output, config.layer);
    this.appliedKey = `${output}:${config.layer}`;
    await this.render(true);
  }

  private async clearApplied(): Promise<void> {
    if (!this.appliedKey) return;
    const [output, layer] = splitKey(this.appliedKey);
    this.appliedKey = null;
    this.lastHtml = null;
    await this.deps.live.clear(output, layer);
  }

  private async render(force: boolean): Promise<void> {
    if (!this.appliedKey) return;
    const html = renderStageHtml(this.view, this.deps.now(), this.config.layout);
    if (!force && html === this.lastHtml) return;
    const [output, layer] = splitKey(this.appliedKey);
    await this.deps.live.setHtml(output, layer, STAGE_ELEMENT_ID, html);
    this.lastHtml = html;
  }

  private save(): Promise<void> {
    return this.deps.storage.set(STAGE_STORAGE_KEY, this.config);
  }

  private run(task: () => Promise<void>, notify = true): Promise<void> {
    const result = this.queue.then(async () => {
      const errorBefore = this.error;
      try {
        await task();
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        // A failing patch would repeat every second: log each distinct error once.
        if (this.error !== errorBefore) this.deps.log?.(`[pco-timers/stage] ${this.error}`);
      }
      if (notify || this.error !== errorBefore) this.emit();
    });
    this.queue = result;
    return result;
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}

function splitKey(key: string): [string, number] {
  const i = key.lastIndexOf(':');
  return [key.slice(0, i), Number(key.slice(i + 1))];
}
