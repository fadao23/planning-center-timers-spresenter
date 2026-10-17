import { useEffect, useState } from 'react';
import { onMessage, postMessage } from '@spresenter/plugin-sdk/ui';
import {
  Actions,
  Alert,
  Button,
  Field,
  Footer,
  Header,
  Hint,
  Panel,
  Root,
  Row,
  Segmented,
  Select,
  StatusIndicator,
  TextInput,
  type StatusState,
} from '@spresenter/plugin-sdk/ui-kit/react';
import { formatCountdown, formatLength } from '../core/format';
import type { LogicToUi, PublicState, UiToLogic } from '../core/messages';
import type { StageLayout, StageState } from '../core/stage-display';

const PLUGIN_ID = 'io.github.fadao23.pco-timers';
/** Fallback heartbeat: only used by the logic thread when its vm has no timers. */
const HEARTBEAT_MS = 1_000;

function send(msg: UiToLogic) {
  postMessage(msg);
}

function useLogicState(): { state: PublicState | null; stage: StageState | null } {
  const [state, setState] = useState<PublicState | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  useEffect(() => {
    const off = onMessage((raw) => {
      const msg = raw as LogicToUi;
      if (msg?.type === 'state') setState(msg.state);
      if (msg?.type === 'stage') setStage(msg.stage);
    });
    send({ type: 'hello' });
    const heartbeat = setInterval(() => send({ type: 'tick' }), HEARTBEAT_MS);
    return () => {
      off();
      clearInterval(heartbeat);
    };
  }, []);
  return { state, stage };
}

function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function App() {
  const { state, stage } = useLogicState();
  if (!state) {
    return (
      <Root>
        <StatusIndicator state="connecting" label="Starting…" />
      </Root>
    );
  }
  return (
    <Root>
      <Header title="Planning Center Timers" subtitle={state.organization ?? 'Not connected'} />
      <Status state={state} />
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.phase === 'ready' ? (
        <>
          <PlanPicker state={state} />
          {state.selection.planId && <LivePanel state={state} />}
          {stage && <StagePanel stage={stage} />}
        </>
      ) : (
        <CredentialsForm connecting={state.phase === 'connecting'} />
      )}
      <Footer>
        {state.lastSyncAt && (
          <>
            Last sync {new Date(state.lastSyncAt).toLocaleTimeString()} · clock offset{' '}
            {state.clockOffsetMs} ms
            <br />
          </>
        )}
        Stream Deck / automation:{' '}
        <span className="pco-code">POST /api/v1/plugins/{PLUGIN_ID}/requests/next</span>
        {state.phase === 'ready' && (
          <>
            <br />
            <Button size="sm" variant="ghost" onClick={() => send({ type: 'forget-credentials' })}>
              Disconnect Planning Center
            </Button>
          </>
        )}
      </Footer>
    </Root>
  );
}

function Status({ state }: { state: PublicState }) {
  let indicator: StatusState = 'idle';
  let label = 'Not connected';
  let detail: string | undefined;
  if (state.phase === 'connecting') {
    indicator = 'connecting';
    label = 'Connecting…';
  } else if (state.phase === 'ready') {
    indicator = state.error ? 'error' : state.inControl ? 'ok' : 'warn';
    label = state.inControl ? 'Controlling LIVE' : 'Connected';
    detail = state.inControl ? undefined : 'Not controlling LIVE yet';
  }
  if (state.busy) detail = 'Talking to Planning Center…';
  return <StatusIndicator state={indicator} label={label} detail={detail} />;
}

function CredentialsForm({ connecting }: { connecting: boolean }) {
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const submit = () => {
    send({ type: 'save-credentials', appId, secret });
    setSecret('');
  };
  return (
    <Panel label="Planning Center account">
      <Hint>
        Create a Personal Access Token at api.planningcenteronline.com → Personal Access Tokens. The
        secret is stored only on this computer.
      </Hint>
      <Field label="Application ID">
        <TextInput value={appId} onChange={(e) => setAppId(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Secret">
        <TextInput
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Actions>
        <Button variant="primary" disabled={!appId || !secret || connecting} onClick={submit}>
          {connecting ? 'Connecting…' : 'Connect'}
        </Button>
      </Actions>
    </Panel>
  );
}

function PlanPicker({ state }: { state: PublicState }) {
  const { serviceTypeId, planId } = state.selection;
  return (
    <Panel label="Plan">
      <Field label="Service type">
        <Select
          value={serviceTypeId ?? ''}
          onChange={(e) =>
            e.target.value && send({ type: 'select-service-type', id: e.target.value })
          }
        >
          <option value="">Choose a service type…</option>
          {state.serviceTypes.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </Select>
      </Field>
      {serviceTypeId && (
        <Field label="Plan">
          <Select
            value={planId ?? ''}
            onChange={(e) => e.target.value && send({ type: 'select-plan', id: e.target.value })}
          >
            <option value="">Choose a plan…</option>
            {state.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.dates} — {p.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {serviceTypeId && (
        <Actions>
          <Button size="sm" variant="ghost" onClick={() => send({ type: 'refresh-plans' })}>
            Refresh plans
          </Button>
        </Actions>
      )}
    </Panel>
  );
}

function LivePanel({ state }: { state: PublicState }) {
  const now = useNow();
  const live = state.live;
  const remaining = state.timer ? state.timer.endTime - now : null;

  let clockClass = 'pco-clock';
  let clockText = '--:--';
  if (remaining !== null) {
    clockText = formatCountdown(remaining);
    if (remaining < 0) clockClass += ' pco-clock--over';
  } else {
    clockClass += ' pco-clock--idle';
  }

  const statusLine =
    live?.status === 'not-started'
      ? 'Service not started'
      : live?.status === 'ended'
        ? 'End of service'
        : live?.current
          ? `Item ${live.current.position} of ${live.itemCount} · planned ${formatLength(live.current.lengthSec)}`
          : 'Loading LIVE…';

  return (
    <Panel label="LIVE">
      <div className={clockClass}>{clockText}</div>
      <div className="pco-item">{live?.current?.title ?? live?.planTitle ?? '—'}</div>
      <div className="pco-meta">{statusLine}</div>
      {live?.next && (
        <div className="pco-meta">
          Next: {live.next.title} ({formatLength(live.next.lengthSec)})
        </div>
      )}
      <Actions>
        <Button onClick={() => send({ type: 'previous' })} disabled={state.busy}>
          ◀ Previous
        </Button>
        <Button variant="primary" onClick={() => send({ type: 'next' })} disabled={state.busy}>
          Next ▶
        </Button>
        <Actions.Spacer />
        <Button size="sm" variant="ghost" onClick={() => send({ type: 'resync' })}>
          Resync
        </Button>
      </Actions>
      <Actions>
        {state.inControl ? (
          <Button size="sm" variant="ghost" onClick={() => send({ type: 'release-control' })}>
            Release LIVE control
          </Button>
        ) : (
          <Button size="sm" variant="success" onClick={() => send({ type: 'take-control' })}>
            Take LIVE control
          </Button>
        )}
      </Actions>
    </Panel>
  );
}

const LAYOUTS: Array<{ value: StageLayout; label: string }> = [
  { value: 'full', label: 'Full screen' },
  { value: 'bar', label: 'Bottom bar' },
];

function StagePanel({ stage }: { stage: StageState }) {
  const { config, outputs, layers, active } = stage;
  const configure = (patch: { output?: string; layer?: number; layout?: StageLayout }) =>
    send({ type: 'stage-configure', ...patch });
  return (
    <Panel label="Stage display">
      <Row>
        <Field label="Output">
          <Select
            value={config.output ?? ''}
            onChange={(e) => e.target.value && configure({ output: e.target.value })}
          >
            <option value="">Choose the stage screen…</option>
            {outputs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Layer" grow={0} style={{ width: 120 }}>
          {layers.length > 0 ? (
            <Select
              value={String(config.layer)}
              onChange={(e) => configure({ layer: Number(e.target.value) })}
            >
              {layers.map((l) => (
                <option key={l.index} value={l.index}>
                  {l.name}
                </option>
              ))}
            </Select>
          ) : (
            <TextInput
              type="number"
              min={0}
              value={config.layer}
              onChange={(e) =>
                configure({ layer: Math.max(0, Math.floor(Number(e.target.value))) })
              }
            />
          )}
        </Field>
      </Row>
      <Field label="Layout">
        <Segmented
          value={config.layout}
          options={LAYOUTS}
          onChange={(layout) => configure({ layout })}
        />
      </Field>
      <Hint>
        {config.layout === 'bar'
          ? 'Transparent, with a bar at the bottom: whatever is on the layers below stays visible.'
          : 'Black full screen: big countdown, current item, next item and the time of day.'}
      </Hint>
      <Actions>
        {active ? (
          <Button variant="danger" onClick={() => send({ type: 'stage-hide' })}>
            Hide from stage
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={config.output === null}
            onClick={() => send({ type: 'stage-show' })}
          >
            Show on stage
          </Button>
        )}
        <Actions.Spacer />
        <Button size="sm" variant="ghost" onClick={() => send({ type: 'stage-refresh-targets' })}>
          Refresh outputs
        </Button>
      </Actions>
      {active && <Hint>On screen now. It updates every second and follows Next / Previous.</Hint>}
      {stage.error && <Alert variant="error">{stage.error}</Alert>}
    </Panel>
  );
}
