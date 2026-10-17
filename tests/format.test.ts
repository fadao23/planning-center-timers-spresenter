import { describe, expect, it } from 'vitest';
import { formatCountdown, formatLength } from '../src/core/format';

describe('formatCountdown', () => {
  it.each([
    [0, '0:00'],
    [1, '0:01'],
    [59_001, '1:00'],
    [300_000, '5:00'],
    [3_725_000, '1:02:05'],
    [-500, '0:00'],
    [-1_000, '-0:01'],
    [-75_400, '-1:15'],
  ])('%d ms → %s', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });

  it('formats planned lengths in seconds', () => {
    expect(formatLength(240)).toBe('4:00');
    expect(formatLength(0)).toBe('0:00');
  });
});
