import { describe, expect, it } from 'vitest';
import { parseLive } from '../src/core/live-state';
import {
  computeTimerTarget,
  estimateClockOffset,
  sameTarget,
  toTimerPatch,
} from '../src/core/timer-sync';
import { liveDoc } from './fixtures/live';

const START = '2026-10-12T10:05:00.000Z';
const START_MS = Date.parse(START);

describe('computeTimerTarget', () => {
  it('ends the timer at PCO start + planned length, in local time', () => {
    const live = parseLive(liveDoc({ currentItemId: '102', liveStartAt: START }));
    expect(computeTimerTarget(live, 0)).toEqual({ itemId: '102', endTime: START_MS + 120_000 });
    // PCO clock 2 s ahead of ours → our end is 2 s earlier on our clock.
    expect(computeTimerTarget(live, 2_000)?.endTime).toBe(START_MS + 118_000);
  });

  it('returns null when nothing is timed', () => {
    expect(computeTimerTarget(parseLive(liveDoc({ currentItemId: null })), 0)).toBeNull();
    expect(computeTimerTarget(parseLive(liveDoc({ endOfService: true })), 0)).toBeNull();
    const noStart = parseLive(liveDoc({ currentItemId: '102', liveStartAt: null }));
    expect(computeTimerTarget(noStart, 0)).toBeNull();
    const badStart = parseLive(liveDoc({ currentItemId: '102', liveStartAt: 'not a date' }));
    expect(computeTimerTarget(badStart, 0)).toBeNull();
    const noLength = parseLive(
      liveDoc({
        currentItemId: '1',
        liveStartAt: START,
        items: [{ id: '1', title: 'Open', length: 0 }],
      }),
    );
    expect(computeTimerTarget(noLength, 0)).toBeNull();
  });
});

describe('toTimerPatch', () => {
  it('builds a running target-mode patch that may go negative', () => {
    expect(toTimerPatch({ itemId: '1', endTime: 10_000.4 }, 4_000)).toEqual({
      mode: 'target',
      endTime: 10_000,
      remainingMs: 6_000,
      running: true,
      allowNegative: true,
    });
  });
});

describe('estimateClockOffset', () => {
  it('compares PCO time with the midpoint of the round trip', () => {
    // Sent at START-100 ms, answered at START+100 ms, PCO stamped START+1 s.
    const server = new Date(START_MS + 1_000).toISOString();
    expect(estimateClockOffset(server, START_MS - 100, START_MS + 100)).toBe(1_000);
  });

  it('refuses slow, inverted or absurd measurements', () => {
    expect(estimateClockOffset(START, START_MS, START_MS + 5_000)).toBeNull();
    expect(estimateClockOffset(START, START_MS, START_MS - 1)).toBeNull();
    expect(estimateClockOffset(START, START_MS - 3_600_000, START_MS - 3_599_900)).toBeNull();
    expect(estimateClockOffset(null, 0, 1)).toBeNull();
    expect(estimateClockOffset('garbage', 0, 1)).toBeNull();
  });
});

describe('sameTarget', () => {
  it('tolerates sub-second jitter on the same item only', () => {
    expect(sameTarget({ itemId: '1', endTime: 1000 }, { itemId: '1', endTime: 1500 })).toBe(true);
    expect(sameTarget({ itemId: '1', endTime: 1000 }, { itemId: '1', endTime: 2000 })).toBe(false);
    expect(sameTarget({ itemId: '1', endTime: 1000 }, { itemId: '2', endTime: 1000 })).toBe(false);
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget(null, { itemId: '1', endTime: 0 })).toBe(false);
  });
});
