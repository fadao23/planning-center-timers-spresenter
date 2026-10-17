// Minimal JSON:API shapes for the Planning Center Services v2 resources we use.
// Only the fields this plugin reads are typed; everything else is ignored.

export interface ResourceIdentifier {
  id: string;
  type: string;
}

export interface Relationship {
  data: ResourceIdentifier | ResourceIdentifier[] | null;
}

export interface Resource<A = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: A;
  relationships?: Record<string, Relationship | undefined>;
  links?: Record<string, string | null | undefined>;
}

export interface JsonApiDocument<D> {
  data: D;
  included?: Resource<object>[];
  meta?: Record<string, unknown>;
}

export interface OrganizationAttributes {
  name?: string;
}

export interface ServiceTypeAttributes {
  name: string;
  sequence?: number;
}

export interface PlanAttributes {
  title: string | null;
  dates: string;
  sort_date: string | null;
  series_title?: string | null;
}

export interface LiveAttributes {
  title?: string | null;
  series_title?: string | null;
  dates?: string | null;
  live_start_at?: string | null;
}

export interface ItemAttributes {
  title: string;
  /** Planned length in seconds. */
  length: number | null;
  /** 'item' | 'song' | 'media' | 'header' */
  item_type: string;
  /** 'pre' | 'during' | 'post' */
  service_position?: string | null;
  sequence?: number;
  key_name?: string | null;
}

export interface ItemTimeAttributes {
  live_start_at: string | null;
  live_end_at: string | null;
  length?: number | null;
}

export type LiveDocument = JsonApiDocument<Resource<LiveAttributes>>;
