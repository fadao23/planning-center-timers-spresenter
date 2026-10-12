import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '../src/core/base64';

describe('encodeBase64', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['app-id:secret', 'YXBwLWlkOnNlY3JldA=='],
  ])('encodes %j', (input, expected) => {
    expect(encodeBase64(input)).toBe(expected);
  });

  it('matches Node for multi-byte UTF-8 (2, 3 and 4 bytes)', () => {
    const input = 'élan · 讚美 · 🙏';
    expect(encodeBase64(input)).toBe(Buffer.from(input, 'utf-8').toString('base64'));
  });
});
