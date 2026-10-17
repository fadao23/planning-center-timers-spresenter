import { beforeEach, describe, expect, it } from 'vitest';
import type { StoragePort } from '../src/core/controller';
import type { PublicState } from '../src/core/messages';
import { parseLive } from '../src/core/live-state';
import {
  STAGE_ELEMENT_ID,
  STAGE_STORAGE_KEY,
  StageDisplay,
  buildStagePresentation,
  countdownTone,
  renderStageHtml,
  stageViewFromState,
  type LivePort,
  type StageView,
} from '../src/core/stage-display';
import { liveDoc } from './fixtures/live';

const NOW = new Date(2026, 9, 18, 10, 7, 30).getTime(); // local 10:07:30

const RUNNING: StageView = {
  status: 'running',
  planTitle: 'Sunday Service',
  current: 'Welcome',
  position: '2 / 4',
  next: { title: 'Amazing Grace', lengthSec: 240 },
  endTime: NOW + 125_000,
};

describe('stageViewFromState', () => {
  const base = { timer: null } as unknown as PublicState;

  it('is idle without LIVE data', () => {
    expect(stageViewFromState({ ...base, live: null })).toMatchObject({
      status: 'idle',
      endTime: null,
    });
  });

  it('maps the running item, position, next item and timer end', () => {
    const live = parseLive(liveDoc({ currentItemId: '102', liveStartAt: '2026-10-12T10:05:00Z' }));
    const view = stageViewFromState({ ...base, live, timer: { itemId: '102', endTime: 42 } });
    expect(view).toEqual({
      status: 'running',
      planTitle: 'Sunday Service',
      current: 'Welcome',
      position: '2 / 4',
      next: { title: 'Amazing Grace', lengthSec: 240 },
      endTime: 42,
    });
  });

  it('has no position or next before/after the service', () => {
    const ended = stageViewFromState({ ...base, live: parseLive(liveDoc({ endOfService: true })) });
    expect(ended).toMatchObject({ status: 'ended', current: null, position: null, next: null });
  });
});

describe('countdownTone', () => {
  it.each([
    [null, 'idle'],
    [125_000, 'ok'],
    [60_000, 'warn'],
    [0, 'warn'],
    [-999, 'warn'],
    [-1_000, 'over'],
  ] as const)('%s ms → %s', (ms, tone) => {
    expect(countdownTone(ms)).toBe(tone);
  });
});

describe('renderStageHtml', () => {
  it('full layout shows clock, item, position, next and time of day', () => {
    const html = renderStageHtml(RUNNING, NOW, 'full');
    expect(html).toContain('id="pco-stage" class="full-layout"');
    expect(html).toContain('<div class="clock ok">2:05</div>');
    expect(html).toContain('<div class="title">Welcome</div>');
    expect(html).toContain('Item 2 / 4');
    expect(html).toContain('Next: Amazing Grace · 4:00');
    expect(html).toContain('<div class="time">10:07</div>');
    expect(html).toContain('#pco-stage.full-layout{');
    expect(html).toContain('background:#000');
  });

  it('bar layout is transparent and has no time of day', () => {
    const html = renderStageHtml(RUNNING, NOW, 'bar');
    expect(html).toContain('class="bar-layout"');
    expect(html).toContain('background:transparent');
    expect(html).not.toContain('class="time"');
    expect(html).toContain('<div class="clock ok">2:05</div>');
  });

  it('turns amber in the last minute and red, negative, on overrun', () => {
    expect(renderStageHtml({ ...RUNNING, endTime: NOW + 30_000 }, NOW, 'full')).toContain(
      '<div class="clock warn">0:30</div>',
    );
    expect(renderStageHtml({ ...RUNNING, endTime: NOW - 75_000 }, NOW, 'full')).toContain(
      '<div class="clock over">-1:15</div>',
    );
  });

  it('shows placeholders before, after and without a plan', () => {
    const notStarted = renderStageHtml(
      { ...RUNNING, status: 'not-started', current: null, position: null, endTime: null },
      NOW,
      'full',
    );
    expect(notStarted).toContain('Service not started');
    expect(notStarted).toContain('<div class="sub">Sunday Service</div>');
    expect(notStarted).toContain('<div class="clock idle">--:--</div>');

    const ended = renderStageHtml(
      { ...RUNNING, status: 'ended', next: null, endTime: null },
      NOW,
      'full',
    );
    expect(ended).toContain('End of service');
    expect(ended).toContain('<div class="next"></div>');

    const idle = renderStageHtml(
      { status: 'idle', planTitle: null, current: null, position: null, next: null, endTime: null },
      NOW,
      'bar',
    );
    expect(idle).toContain('<div class="title"></div>');
  });

  it('escapes titles coming from Planning Center', () => {
    const html = renderStageHtml(
      { ...RUNNING, current: '<img src=x onerror=alert(1)> & "Q"' },
      NOW,
      'full',
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&#60;img src=x onerror=alert(1)&#62; &#38; &#34;Q&#34;');
  });
});

describe('buildStagePresentation', () => {
  it('has one full-screen element the plugin fills with HTML', () => {
    const p = buildStagePresentation();
    expect(p.theme.elements).toHaveLength(1);
    expect(p.theme.elements[0]).toMatchObject({ id: STAGE_ELEMENT_ID, type: 'RECTANGLE' });
  });
});

// ---- StageDisplay ------------------------------------------------------------

class FakeLive implements LivePort {
  calls: string[] = [];
  html: string[] = [];
  failSetHtml: Error | null = null;
  async listOutputs() {
    this.calls.push('outputs');
    return [
      { id: '0', name: 'Main' },
      { id: '1', name: 'Stage' },
    ];
  }
  async listLayers() {
    this.calls.push('layers');
    return [
      { index: 0, name: 'Background' },
      { index: 3, name: 'Overlay' },
    ];
  }
  async apply(output: string, layer: number) {
    this.calls.push(`apply ${output}:${layer}`);
  }
  async show(output: string, layer: number) {
    this.calls.push(`show ${output}:${layer}`);
  }
  async setHtml(output: string, layer: number, elementId: string, html: string) {
    if (this.failSetHtml) throw this.failSetHtml;
    this.calls.push(`html ${output}:${layer} ${elementId}`);
    this.html.push(html);
  }
  async clear(output: string, layer: number) {
    this.calls.push(`clear ${output}:${layer}`);
  }
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

let live: FakeLive;
let storage: MemoryStorage;
let now: number;
let logs: string[];

function makeStage() {
  return new StageDisplay({ live, storage, now: () => now, log: (m) => logs.push(m) });
}

beforeEach(() => {
  live = new FakeLive();
  storage = new MemoryStorage();
  now = NOW;
  logs = [];
});

describe('StageDisplay', () => {
  it('loads outputs and layers, inactive by default', async () => {
    const stage = makeStage();
    await stage.init();
    expect(stage.getState()).toMatchObject({
      config: { output: null, layer: 0, layout: 'full', enabled: false },
      outputs: [
        { id: '0', name: 'Main' },
        { id: '1', name: 'Stage' },
      ],
      layers: [
        { index: 0, name: 'Background' },
        { index: 3, name: 'Overlay' },
      ],
      active: false,
      error: null,
    });
    expect(live.calls).toEqual(['outputs', 'layers']);
  });

  it('refuses to show before an output is chosen', async () => {
    const stage = makeStage();
    await stage.show();
    expect(stage.getState().error).toMatch(/output/);
    expect(live.calls).not.toContain('apply');
  });

  it('applies once, shows the layer, renders, and saves the config', async () => {
    const stage = makeStage();
    await stage.configure({ output: '1', layer: 3 });
    expect(live.calls).toEqual([]); // not on screen yet
    await stage.show();
    expect(live.calls).toEqual(['apply 1:3', 'show 1:3', `html 1:3 ${STAGE_ELEMENT_ID}`]);
    expect(stage.getState().active).toBe(true);
    expect(storage.data.get(STAGE_STORAGE_KEY)).toEqual({
      output: '1',
      layer: 3,
      layout: 'full',
      enabled: true,
    });
  });

  it('pushes a patch only when the rendered text changes', async () => {
    const stage = makeStage();
    await stage.configure({ output: '1' });
    await stage.show();
    await stage.update(RUNNING);
    const sent = live.html.length;
    await stage.tick(); // same second
    now += 200;
    await stage.tick(); // still 2:05 → 2:04.8 rounds up to 2:05
    expect(live.html).toHaveLength(sent);
    now += 1_000;
    await stage.tick();
    expect(live.html).toHaveLength(sent + 1);
    expect(live.html.at(-1)).toContain('2:04');
  });

  it('does nothing on tick while hidden', async () => {
    const stage = makeStage();
    await stage.update(RUNNING);
    await stage.tick();
    expect(live.calls).toEqual([]);
  });

  it('moves to a new output/layer while on screen', async () => {
    const stage = makeStage();
    await stage.configure({ output: '1', layer: 0 });
    await stage.show();
    live.calls = [];
    await stage.configure({ layer: 3 });
    expect(live.calls).toEqual([
      'clear 1:0',
      'apply 1:3',
      'show 1:3',
      `html 1:3 ${STAGE_ELEMENT_ID}`,
    ]);
  });

  it('re-renders in place when only the layout changes', async () => {
    const stage = makeStage();
    await stage.configure({ output: '1' });
    await stage.show();
    live.calls = [];
    await stage.configure({ layout: 'bar' });
    expect(live.calls).toEqual([`html 1:0 ${STAGE_ELEMENT_ID}`]);
    expect(live.html.at(-1)).toContain('bar-layout');
  });

  it('hides by clearing the layer and remembers it is off', async () => {
    const stage = makeStage();
    await stage.configure({ output: '1' });
    await stage.show();
    await stage.hide();
    expect(live.calls.at(-1)).toBe('clear 1:0');
    expect(stage.getState().active).toBe(false);
    expect(storage.data.get(STAGE_STORAGE_KEY)).toMatchObject({ enabled: false });
    live.calls = [];
    await stage.hide(); // already hidden: no clear
    expect(live.calls).toEqual([]);
  });

  it('puts the display back on screen after a restart', async () => {
    storage.data.set(STAGE_STORAGE_KEY, { output: '1', layer: 3, layout: 'bar', enabled: true });
    const stage = makeStage();
    await stage.init();
    expect(live.calls).toEqual([
      'outputs',
      'layers',
      'apply 1:3',
      'show 1:3',
      `html 1:3 ${STAGE_ELEMENT_ID}`,
    ]);
    expect(stage.getState().config.layout).toBe('bar');
  });

  it('reports a failing patch once, then recovers', async () => {
    const stage = makeStage();
    const states: (string | null)[] = [];
    stage.onChange((s) => states.push(s.error));
    await stage.configure({ output: '1' });
    await stage.show();
    await stage.update(RUNNING); // a ticking countdown, so every second needs a patch
    live.failSetHtml = new Error('element not found');
    for (let i = 1; i <= 3; i++) {
      now += 1_000;
      await stage.tick();
    }
    expect(stage.getState().error).toBe('element not found');
    expect(logs).toEqual(['[pco-timers/stage] element not found']);
    live.failSetHtml = null;
    now += 1_000;
    await stage.tick();
    expect(stage.getState().error).toBeNull();
    expect(states.filter((e) => e === 'element not found')).toHaveLength(1);
  });

  it('refreshes targets and stops notifying after unsubscribe', async () => {
    const stage = makeStage();
    let count = 0;
    const off = stage.onChange(() => count++);
    await stage.refreshTargets();
    expect(count).toBe(1);
    expect(stage.getState().outputs).toHaveLength(2);
    off();
    await stage.refreshTargets();
    expect(count).toBe(1);
  });
});
