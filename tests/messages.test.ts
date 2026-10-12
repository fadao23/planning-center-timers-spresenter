import { describe, expect, it } from 'vitest';
import { parseUiMessage } from '../src/core/messages';

describe('parseUiMessage', () => {
  it('accepts the simple commands', () => {
    for (const type of ['hello', 'next', 'previous', 'resync', 'tick', 'take-control']) {
      expect(parseUiMessage({ type })).toEqual({ type });
    }
  });

  it('trims and validates credentials', () => {
    expect(parseUiMessage({ type: 'save-credentials', appId: ' a ', secret: 'b' })).toEqual({
      type: 'save-credentials',
      appId: 'a',
      secret: 'b',
    });
    expect(parseUiMessage({ type: 'save-credentials', appId: 'a' })).toBeNull();
    expect(parseUiMessage({ type: 'save-credentials', appId: 'a', secret: '  ' })).toBeNull();
    expect(
      parseUiMessage({ type: 'save-credentials', appId: 'a', secret: 'x'.repeat(201) }),
    ).toBeNull();
  });

  it('only accepts numeric PCO ids for selections', () => {
    expect(parseUiMessage({ type: 'select-plan', id: '123' })).toEqual({
      type: 'select-plan',
      id: '123',
    });
    expect(parseUiMessage({ type: 'select-service-type', id: '../../people' })).toBeNull();
    expect(parseUiMessage({ type: 'select-plan', id: 5 })).toBeNull();
  });

  it('rejects anything else', () => {
    for (const raw of [null, 'next', 42, {}, { type: 7 }, { type: 'delete-everything' }]) {
      expect(parseUiMessage(raw)).toBeNull();
    }
  });
});
