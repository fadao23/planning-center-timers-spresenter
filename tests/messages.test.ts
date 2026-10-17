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

describe('parseUiMessage — stage display', () => {
  it('accepts the simple stage commands', () => {
    for (const type of ['stage-show', 'stage-hide', 'stage-refresh-targets']) {
      expect(parseUiMessage({ type })).toEqual({ type });
    }
  });

  it('validates stage configuration fields', () => {
    expect(
      parseUiMessage({ type: 'stage-configure', output: '1', layer: 3, layout: 'bar' }),
    ).toEqual({ type: 'stage-configure', output: '1', layer: 3, layout: 'bar' });
    expect(parseUiMessage({ type: 'stage-configure', output: 2 })).toEqual({
      type: 'stage-configure',
      output: '2',
    });
    for (const bad of [
      {},
      { output: 'main' },
      { output: '' },
      { layer: -1 },
      { layer: 1.5 },
      { layer: 100 },
      { layer: '2' },
      { layout: 'huge' },
      { layout: 3 },
    ]) {
      expect(parseUiMessage({ type: 'stage-configure', ...bad })).toBeNull();
    }
  });
});
