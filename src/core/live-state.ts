// Turns a Planning Center LIVE document (`/live?include=items,current_item_time`)
// into the small, flat state the plugin needs: where the service is, which item
// is running, when it started (PCO server time) and how long it was planned for.

import type {
  ItemAttributes,
  ItemTimeAttributes,
  LiveDocument,
  Resource,
  ResourceIdentifier,
} from './pco-types';

export type LiveStatus = 'not-started' | 'running' | 'ended';

export interface LiveItem {
  id: string;
  title: string;
  /** Planned length in seconds (0 when the plan has no length for it). */
  lengthSec: number;
  itemType: string;
}

export interface LiveState {
  planTitle: string;
  status: LiveStatus;
  /** Link to whoever controls LIVE right now (null: nobody). */
  controller: string | null;
  current: (LiveItem & { liveStartAt: string | null; position: number }) | null;
  next: LiveItem | null;
  /** Number of timed items (headers excluded). */
  itemCount: number;
}

const TIMED_TYPES = new Set(['item', 'song', 'media']);

export function parseLive(doc: LiveDocument): LiveState {
  const included = doc.included ?? [];
  const items = included.filter((r): r is Resource<ItemAttributes> => r.type === 'Item');
  const timed = items.filter((i) => TIMED_TYPES.has(i.attributes.item_type));
  const itemTimes = included.filter(
    (r): r is Resource<ItemTimeAttributes> => r.type === 'ItemTime',
  );

  const base = {
    planTitle: doc.data.attributes.title || doc.data.attributes.series_title || 'Untitled plan',
    controller: doc.data.links?.controller ?? null,
    itemCount: timed.length,
  };

  const currentTimeRef = single(doc.data.relationships?.current_item_time?.data);
  if (!currentTimeRef) {
    return { ...base, status: 'not-started', current: null, next: toLiveItem(timed[0]) };
  }

  const itemTime = itemTimes.find((t) => t.id === currentTimeRef.id);
  const itemRef = single(itemTime?.relationships?.item?.data);
  const item = itemRef ? items.find((i) => i.id === itemRef.id) : undefined;
  if (!itemTime || !item) {
    // The current pointer moved past the last item: PCO shows "end of service".
    return { ...base, status: 'ended', current: null, next: null };
  }

  const index = items.indexOf(item);
  const next = items.slice(index + 1).find((i) => TIMED_TYPES.has(i.attributes.item_type));
  return {
    ...base,
    status: 'running',
    current: {
      ...toLiveItem(item)!,
      liveStartAt: itemTime.attributes.live_start_at,
      position: timed.indexOf(item) + 1,
    },
    next: toLiveItem(next),
  };
}

function toLiveItem(item: Resource<ItemAttributes> | undefined): LiveItem | null {
  if (!item) return null;
  return {
    id: item.id,
    title: item.attributes.title,
    lengthSec: Math.max(0, item.attributes.length ?? 0),
    itemType: item.attributes.item_type,
  };
}

function single(
  data: ResourceIdentifier | ResourceIdentifier[] | null | undefined,
): ResourceIdentifier | null {
  if (!data) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}
