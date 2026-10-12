// The message protocol between the panel (sandboxed iframe) and the logic
// thread. Shared by both sides; the logic thread validates everything it
// receives because the UI is treated as untrusted.

import type { LiveState } from './live-state';
import type { PlanSummary, ServiceTypeSummary } from './pco-client';
import type { TimerTarget } from './timer-sync';

export type Phase = 'needs-credentials' | 'connecting' | 'ready';

/** Everything the panel renders. Never contains the PCO secret. */
export interface PublicState {
  phase: Phase;
  organization: string | null;
  serviceTypes: ServiceTypeSummary[];
  plans: PlanSummary[];
  selection: { serviceTypeId: string | null; planId: string | null };
  live: LiveState | null;
  inControl: boolean;
  timer: TimerTarget | null;
  clockOffsetMs: number;
  lastSyncAt: number | null;
  busy: boolean;
  error: string | null;
}

export type UiToLogic =
  | { type: 'hello' }
  | { type: 'save-credentials'; appId: string; secret: string }
  | { type: 'forget-credentials' }
  | { type: 'select-service-type'; id: string }
  | { type: 'select-plan'; id: string }
  | { type: 'refresh-plans' }
  | { type: 'take-control' }
  | { type: 'release-control' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'resync' }
  | { type: 'tick' };

export type LogicToUi = { type: 'state'; state: PublicState };

const SIMPLE = new Set([
  'hello',
  'forget-credentials',
  'refresh-plans',
  'take-control',
  'release-control',
  'next',
  'previous',
  'resync',
  'tick',
]);

const MAX_FIELD = 200;

/** Returns a well-formed message, or null for anything else. */
export function parseUiMessage(raw: unknown): UiToLogic | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  const type = msg.type;
  if (typeof type !== 'string') return null;
  if (SIMPLE.has(type)) return { type } as UiToLogic;
  switch (type) {
    case 'save-credentials': {
      const appId = field(msg.appId);
      const secret = field(msg.secret);
      return appId && secret ? { type, appId, secret } : null;
    }
    case 'select-service-type':
    case 'select-plan': {
      const id = field(msg.id);
      return id && /^\d+$/.test(id) ? { type, id } : null;
    }
    default:
      return null;
  }
}

function field(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_FIELD ? trimmed : null;
}
