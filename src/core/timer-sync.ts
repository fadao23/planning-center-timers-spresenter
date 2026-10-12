// Pure timing math. The Spresenter timer counts down on its own; this module
// only decides WHERE it should end so it matches the Planning Center LIVE clock:
//
//   endTime (local clock) = live_start_at (PCO clock) + planned length − clock offset
//
// where clock offset = PCO clock − local clock, estimated when we advance LIVE
// ourselves (PCO stamps live_start_at at the moment it handles our request).

import type { LiveState } from './live-state';

export interface TimerTarget {
  itemId: string;
  /** Local epoch milliseconds at which the item's planned length runs out. */
  endTime: number;
}

/** What gets sent to `spresenter.timer.set`. */
export interface TimerPatch {
  mode: 'target';
  endTime: number;
  remainingMs: number;
  running: true;
  allowNegative: true;
}

/** Offsets beyond this are treated as a broken estimate, not a real skew. */
const MAX_PLAUSIBLE_OFFSET_MS = 10 * 60 * 1000;

export function computeTimerTarget(live: LiveState, clockOffsetMs: number): TimerTarget | null {
  const current = live.current;
  if (live.status !== 'running' || !current?.liveStartAt || current.lengthSec <= 0) return null;
  const startedAt = Date.parse(current.liveStartAt);
  if (Number.isNaN(startedAt)) return null;
  return { itemId: current.id, endTime: startedAt + current.lengthSec * 1000 - clockOffsetMs };
}

export function toTimerPatch(target: TimerTarget, now: number): TimerPatch {
  return {
    mode: 'target',
    endTime: Math.round(target.endTime),
    remainingMs: Math.round(target.endTime - now),
    running: true,
    allowNegative: true,
  };
}

/**
 * Estimate PCO clock − local clock from an item WE just started: PCO stamped
 * `liveStartAtIso` while handling the request sent at `sentAt` and answered at
 * `receivedAt` (both local). The midpoint is the best local guess for that
 * instant. Returns null when the round trip is too slow to be trusted.
 */
export function estimateClockOffset(
  liveStartAtIso: string | null | undefined,
  sentAt: number,
  receivedAt: number,
  maxRoundTripMs = 3000,
): number | null {
  if (!liveStartAtIso) return null;
  const serverTime = Date.parse(liveStartAtIso);
  if (Number.isNaN(serverTime)) return null;
  const roundTrip = receivedAt - sentAt;
  if (roundTrip < 0 || roundTrip > maxRoundTripMs) return null;
  const offset = serverTime - (sentAt + roundTrip / 2);
  return Math.abs(offset) > MAX_PLAUSIBLE_OFFSET_MS ? null : Math.round(offset);
}

/** True when re-applying `b` would not visibly change a timer already set to `a`. */
export function sameTarget(
  a: TimerTarget | null,
  b: TimerTarget | null,
  toleranceMs = 750,
): boolean {
  if (!a || !b) return a === b;
  return a.itemId === b.itemId && Math.abs(a.endTime - b.endTime) <= toleranceMs;
}
