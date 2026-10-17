// Logic thread. Wires the controller to Spresenter: PCO over `net.httpRequest`,
// the app timer, per-plugin storage, the stage display (live outputs), the
// panel, and named actions that a Stream Deck / automation can call. Registrations stay at the top level (see
// docs: a call that wakes the plugin dispatches right after the file runs).

import { TimerSyncController } from './core/controller';
import { parseUiMessage, type LogicToUi, type PublicState } from './core/messages';
import { PcoClient } from './core/pco-client';
import { StageDisplay, stageViewFromState } from './core/stage-display';

const HEARTBEAT_MS = 5_000;
/** Stage countdown refresh; a patch is only sent when the text changes (~1/s). */
const STAGE_TICK_MS = 250;
const hasTimers = typeof setInterval === 'function';

const controller = new TimerSyncController({
  createClient: (credentials) =>
    new PcoClient((req) => spresenter.net.httpRequest(req), credentials),
  timer: {
    set: (patch) => spresenter.timer.set(patch),
    clear: () => spresenter.timer.clear(),
  },
  storage: spresenter.storage,
  now: () => Date.now(),
  log: (message) => console.warn(message),
});

const stage = new StageDisplay({
  live: {
    listOutputs: async () =>
      (await spresenter.outputs.list()).map((o) => ({ id: String(o.index), name: o.name })),
    listLayers: async () =>
      (await spresenter.layers.list()).map((l) => ({
        index: l.index,
        name: l.name ?? `Layer ${l.index}`,
      })),
    apply: (output, layer, presentation) => spresenter.live.apply(output, layer, presentation),
    show: async (output, layer) => {
      await spresenter.live.setState(output, layer, { show: true });
    },
    setHtml: (output, layer, elementId, html) =>
      spresenter.live.setElement(output, layer, elementId, { html }),
    clear: (output, layer) => spresenter.live.clear(output, layer),
  },
  storage: spresenter.storage,
  now: () => Date.now(),
  log: (message) => console.warn(message),
});

function post(msg: LogicToUi) {
  spresenter.ui.postMessage(msg);
}

controller.onChange((state) => {
  post({ type: 'state', state });
  void stage.update(stageViewFromState(state));
});
stage.onChange((stageState) => post({ type: 'stage', stage: stageState }));

// ---- Panel ------------------------------------------------------------------

spresenter.ui.onmessage = (raw) => {
  const msg = parseUiMessage(raw);
  if (!msg) return;
  switch (msg.type) {
    case 'hello':
      post({ type: 'state', state: controller.getState() });
      post({ type: 'stage', stage: stage.getState() });
      return;
    case 'save-credentials':
      void controller.saveCredentials(msg.appId, msg.secret);
      return;
    case 'forget-credentials':
      void controller.forgetCredentials();
      return;
    case 'select-service-type':
      void controller.selectServiceType(msg.id);
      return;
    case 'select-plan':
      void controller.selectPlan(msg.id);
      return;
    case 'refresh-plans':
      void controller.refreshPlans();
      return;
    case 'take-control':
      void controller.takeControl();
      return;
    case 'release-control':
      void controller.releaseControl();
      return;
    case 'next':
      void controller.next();
      return;
    case 'previous':
      void controller.previous();
      return;
    case 'resync':
      void controller.resync();
      return;
    case 'tick':
      // Fallback heartbeat from the panel when the vm has no timers.
      if (!hasTimers) {
        void controller.tick();
        void stage.tick();
      }
      return;
    case 'stage-configure':
      void stage.configure({ output: msg.output, layer: msg.layer, layout: msg.layout });
      return;
    case 'stage-show':
      void stage.show();
      return;
    case 'stage-hide':
      void stage.hide();
      return;
    case 'stage-refresh-targets':
      void stage.refreshTargets();
      return;
  }
};

// ---- Named actions (Stream Deck, automations, REST) -------------------------
// POST /api/v1/plugins/io.github.fadao23.pco-timers/requests/<action>

function summary(state: PublicState) {
  return {
    inControl: state.inControl,
    status: state.live?.status ?? null,
    current: state.live?.current?.title ?? null,
    next: state.live?.next?.title ?? null,
    endTime: state.timer?.endTime ?? null,
  };
}

type ErrorSource = () => string | null;
const pcoError: ErrorSource = () => controller.getState().error;
const stageError: ErrorSource = () => stage.getState().error;

const actions: Array<[string, string, () => Promise<void>, ErrorSource?]> = [
  ['next', 'Go to the next Planning Center LIVE item', () => controller.next()],
  ['previous', 'Go to the previous Planning Center LIVE item', () => controller.previous()],
  ['resync', 'Re-read Planning Center LIVE and realign the timer', () => controller.resync()],
  ['take-control', 'Take control of Planning Center LIVE', () => controller.takeControl()],
  ['release-control', 'Release control of Planning Center LIVE', () => controller.releaseControl()],
  ['stage-show', 'Show the countdown on the stage output', () => stage.show(), stageError],
  ['stage-hide', 'Remove the countdown from the stage output', () => stage.hide(), stageError],
  ['status', 'Current item, next item and timer end', async () => {}],
];

const requests = spresenter.requests;
if (requests) {
  for (const [action, description, run, errorOf = pcoError] of actions) {
    requests.on(
      action,
      async () => {
        await run();
        const error = errorOf();
        if (error) throw requests.error(502, error, 'plugin_error');
        return summary(controller.getState());
      },
      { name: description, description },
    );
  }
}

// ---- Heartbeat --------------------------------------------------------------
// controller.tick() only catches changes made outside Spresenter (it throttles
// the PCO call to once a minute and backs off after a 429). stage.tick() is
// local: it re-renders the countdown text.

if (hasTimers) {
  setInterval(() => void controller.tick(), HEARTBEAT_MS);
  setInterval(() => void stage.tick(), STAGE_TICK_MS);
}

void controller.init();
void stage.init();
