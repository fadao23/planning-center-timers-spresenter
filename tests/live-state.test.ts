import { describe, expect, it } from 'vitest';
import { parseLive } from '../src/core/live-state';
import { ME, liveDoc } from './fixtures/live';

describe('parseLive', () => {
  it('reports a plan that has not started, with the first timed item as next', () => {
    const live = parseLive(liveDoc({ currentItemId: null }));
    expect(live.status).toBe('not-started');
    expect(live.current).toBeNull();
    expect(live.next?.title).toBe('Countdown video');
    expect(live.itemCount).toBe(4);
    expect(live.planTitle).toBe('Sunday Service');
  });

  it('resolves the running item, its start and the next timed item (skipping headers)', () => {
    const live = parseLive(
      liveDoc({ currentItemId: '102', liveStartAt: '2026-10-12T10:05:00Z', controller: ME }),
    );
    expect(live.status).toBe('running');
    expect(live.controller).toBe(ME);
    expect(live.current).toMatchObject({
      id: '102',
      title: 'Welcome',
      lengthSec: 120,
      liveStartAt: '2026-10-12T10:05:00Z',
      position: 2,
    });
    expect(live.next?.title).toBe('Amazing Grace');
  });

  it('has no next item on the last one', () => {
    const live = parseLive(liveDoc({ currentItemId: '105', liveStartAt: '2026-10-12T10:20:00Z' }));
    expect(live.current?.title).toBe('Sermon');
    expect(live.next).toBeNull();
  });

  it('treats a current pointer without an item as the end of the service', () => {
    const live = parseLive(liveDoc({ endOfService: true }));
    expect(live.status).toBe('ended');
    expect(live.current).toBeNull();
    expect(live.next).toBeNull();
  });

  it('copes with missing included data and null lengths', () => {
    const doc = liveDoc({ currentItemId: null });
    delete doc.included;
    expect(parseLive(doc)).toMatchObject({ status: 'not-started', itemCount: 0, next: null });

    const live = parseLive(
      liveDoc({ currentItemId: '1', items: [{ id: '1', title: 'Open', length: null }] }),
    );
    expect(live.current?.lengthSec).toBe(0);
  });

  it('falls back to the series title, then a placeholder', () => {
    const doc = liveDoc({});
    doc.data.attributes = { title: null, series_title: 'Advent' };
    expect(parseLive(doc).planTitle).toBe('Advent');
    doc.data.attributes = {};
    expect(parseLive(doc).planTitle).toBe('Untitled plan');
  });

  it('accepts a to-many shaped relationship', () => {
    const doc = liveDoc({ currentItemId: '102', liveStartAt: '2026-10-12T10:05:00Z' });
    const rel = doc.data.relationships!.current_item_time!;
    rel.data = [rel.data as { id: string; type: string }];
    expect(parseLive(doc).current?.id).toBe('102');
  });
});
