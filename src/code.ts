// Logic thread. Wires the controller to Spresenter: PCO over `net.httpRequest`,
// the app timer, per-plugin storage, the panel, and named actions that a Stream
// Deck / automation can call. Registrations stay at the top level (see
// docs: a call that wakes the plugin dispatches right after the file runs).

import { TimerSyncController } from './core/controller';
import { parseUiMessage, type LogicToUi, type PublicState } from './core/messages';
import { PcoClient } from './core/pco-client';

const HEARTBEAT_MS = 5_000;
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

controller.onChange((state) => {
  const msg: LogicToUi = { type: 'state', state };
  spresenter.ui.postMessage(msg);
});

// ---- Panel ------------------------------------------------------------------

spresenter.ui.onmessage = (raw) => {
  const msg = parseUiMessage(raw);
  if (!msg) return;
  switch (msg.type) {
    case 'hello':
      spresenter.ui.postMessage({
        type: 'state',
        state: controller.getState(),
      } satisfies LogicToUi);
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
      if (!hasTimers) void controller.tick();
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

const actions: Array<[string, string, () => Promise<void>]> = [
  ['next', 'Go to the next Planning Center LIVE item', () => controller.next()],
  ['previous', 'Go to the previous Planning Center LIVE item', () => controller.previous()],
  ['resync', 'Re-read Planning Center LIVE and realign the timer', () => controller.resync()],
  ['take-control', 'Take control of Planning Center LIVE', () => controller.takeControl()],
  ['release-control', 'Release control of Planning Center LIVE', () => controller.releaseControl()],
  ['status', 'Current item, next item and timer end', async () => {}],
];

const requests = spresenter.requests;
if (requests) {
  for (const [action, description, run] of actions) {
    requests.on(
      action,
      async () => {
        await run();
        const state = controller.getState();
        if (state.error) throw requests.error(502, state.error, 'planning_center_error');
        return summary(state);
      },
      { name: description, description },
    );
  }
}

// ---- Heartbeat --------------------------------------------------------------
// Only catches changes made outside Spresenter; `tick()` itself throttles the
// actual PCO call to once a minute and backs off after a 429.

if (hasTimers) setInterval(() => void controller.tick(), HEARTBEAT_MS);

void controller.init();
