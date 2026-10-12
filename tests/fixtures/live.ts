// Builds Planning Center LIVE documents shaped like
// GET /services/v2/service_types/:st/plans/:plan/live?include=items,current_item_time

import type { LiveDocument, Resource } from '../../src/core/pco-types';

export interface FixtureItem {
  id: string;
  title: string;
  length: number | null;
  item_type?: string;
}

export const PLAN_ITEMS: FixtureItem[] = [
  { id: '100', title: 'Pre-service', length: 300, item_type: 'header' },
  { id: '101', title: 'Countdown video', length: 300, item_type: 'media' },
  { id: '102', title: 'Welcome', length: 120 },
  { id: '103', title: 'Worship', length: null, item_type: 'header' },
  { id: '104', title: 'Amazing Grace', length: 240, item_type: 'song' },
  { id: '105', title: 'Sermon', length: 1800 },
];

export const ME = 'https://api.planningcenteronline.com/services/v2/people/42';
export const SOMEONE_ELSE = 'https://api.planningcenteronline.com/services/v2/people/7';

export function liveDoc(opts: {
  currentItemId?: string | null;
  liveStartAt?: string | null;
  controller?: string | null;
  items?: FixtureItem[];
  /** Point current_item_time at an ItemTime whose item is missing (end of service). */
  endOfService?: boolean;
}): LiveDocument {
  const items = opts.items ?? PLAN_ITEMS;
  const included: Resource<object>[] = items.map((i) => ({
    id: i.id,
    type: 'Item',
    attributes: { title: i.title, length: i.length, item_type: i.item_type ?? 'item' },
  }));

  let currentRef: { id: string; type: string } | null = null;
  if (opts.endOfService) {
    currentRef = { id: 'it-end', type: 'ItemTime' };
    included.push({
      id: 'it-end',
      type: 'ItemTime',
      attributes: { live_start_at: '2026-10-12T10:45:00Z', live_end_at: null },
      relationships: { item: { data: null } },
    });
  } else if (opts.currentItemId) {
    currentRef = { id: `it-${opts.currentItemId}`, type: 'ItemTime' };
    included.push({
      id: currentRef.id,
      type: 'ItemTime',
      attributes: { live_start_at: opts.liveStartAt ?? null, live_end_at: null },
      relationships: { item: { data: { id: opts.currentItemId, type: 'Item' } } },
    });
  }

  return {
    data: {
      id: '9001',
      type: 'Live',
      attributes: { title: 'Sunday Service', series_title: null },
      relationships: { current_item_time: { data: currentRef } },
      links: { controller: opts.controller ?? null },
    },
    included,
  };
}
