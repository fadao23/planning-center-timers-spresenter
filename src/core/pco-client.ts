// Planning Center Services v2 client. Transport-agnostic: it receives an
// `HttpFn` (in the plugin, `spresenter.net.httpRequest`) so it can be unit
// tested with a fake. Authenticates with a Personal Access Token (HTTP Basic).

import { encodeBase64 } from './base64';
import type {
  JsonApiDocument,
  LiveDocument,
  OrganizationAttributes,
  PlanAttributes,
  Resource,
  ServiceTypeAttributes,
} from './pco-types';

export const PCO_SERVICES_BASE = 'https://api.planningcenteronline.com/services/v2';

export interface HttpRequest {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
  error?: string;
}

export type HttpFn = (req: HttpRequest) => Promise<HttpResponse>;

export interface PcoCredentials {
  appId: string;
  secret: string;
}

export interface ServiceTypeSummary {
  id: string;
  name: string;
}

export interface PlanSummary {
  id: string;
  title: string;
  dates: string;
  sortDate: string | null;
}

export class PcoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PcoError';
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

const LIVE_INCLUDE = 'include=items,current_item_time';

export class PcoClient {
  private readonly authHeader: string;

  constructor(
    private readonly http: HttpFn,
    credentials: PcoCredentials,
    private readonly baseUrl = PCO_SERVICES_BASE,
    private readonly timeoutMs = 8000,
  ) {
    this.authHeader = `Basic ${encodeBase64(`${credentials.appId}:${credentials.secret}`)}`;
  }

  async getOrganizationName(): Promise<string> {
    const doc = await this.request<JsonApiDocument<Resource<OrganizationAttributes>>>('GET', '');
    return doc.data.attributes.name ?? 'Planning Center';
  }

  async listServiceTypes(): Promise<ServiceTypeSummary[]> {
    const doc = await this.request<JsonApiDocument<Resource<ServiceTypeAttributes>[]>>(
      'GET',
      '/service_types?per_page=100&order=sequence',
    );
    return doc.data.map((st) => ({ id: st.id, name: st.attributes.name }));
  }

  /** The most recent past plan (a service already under way) plus upcoming ones. */
  async listPlans(serviceTypeId: string, upcoming = 10): Promise<PlanSummary[]> {
    const base = `/service_types/${enc(serviceTypeId)}/plans`;
    const [past, future] = await Promise.all([
      this.request<JsonApiDocument<Resource<PlanAttributes>[]>>(
        'GET',
        `${base}?filter=past&order=-sort_date&per_page=1`,
      ),
      this.request<JsonApiDocument<Resource<PlanAttributes>[]>>(
        'GET',
        `${base}?filter=future&order=sort_date&per_page=${upcoming}`,
      ),
    ]);
    return [...past.data, ...future.data].map(toPlanSummary);
  }

  getLive(serviceTypeId: string, planId: string): Promise<LiveDocument> {
    return this.request<LiveDocument>('GET', `${livePath(serviceTypeId, planId)}?${LIVE_INCLUDE}`);
  }

  toggleControl(serviceTypeId: string, planId: string): Promise<LiveDocument> {
    return this.request<LiveDocument>('POST', `${livePath(serviceTypeId, planId)}/toggle_control`);
  }

  goToNextItem(serviceTypeId: string, planId: string): Promise<LiveDocument> {
    return this.request<LiveDocument>(
      'POST',
      `${livePath(serviceTypeId, planId)}/go_to_next_item?${LIVE_INCLUDE}`,
    );
  }

  goToPreviousItem(serviceTypeId: string, planId: string): Promise<LiveDocument> {
    return this.request<LiveDocument>(
      'POST',
      `${livePath(serviceTypeId, planId)}/go_to_previous_item?${LIVE_INCLUDE}`,
    );
  }

  private async request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
    const res = await this.http({
      method,
      url: `${this.baseUrl}${path}`,
      headers: { Authorization: this.authHeader, Accept: 'application/json' },
      timeoutMs: this.timeoutMs,
    });
    if (res.error && !res.status) {
      throw new PcoError(0, `Network error: ${res.error}`);
    }
    if (!res.ok) {
      throw new PcoError(res.status, describeFailure(res));
    }
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new PcoError(res.status, 'Planning Center returned a response that is not JSON');
    }
  }
}

function livePath(serviceTypeId: string, planId: string): string {
  return `/service_types/${enc(serviceTypeId)}/plans/${enc(planId)}/live`;
}

function enc(id: string): string {
  return encodeURIComponent(id);
}

function toPlanSummary(plan: Resource<PlanAttributes>): PlanSummary {
  return {
    id: plan.id,
    title: plan.attributes.title || plan.attributes.series_title || 'Untitled plan',
    dates: plan.attributes.dates,
    sortDate: plan.attributes.sort_date,
  };
}

function describeFailure(res: HttpResponse): string {
  if (res.status === 401) return 'Planning Center rejected the credentials (401)';
  if (res.status === 403) return 'This account is not allowed to do that in Planning Center (403)';
  if (res.status === 404) return 'Plan or service type not found in Planning Center (404)';
  if (res.status === 429) return 'Planning Center rate limit reached (429), retrying shortly';
  const detail = firstErrorDetail(res.body);
  return `Planning Center error ${res.status}${detail ? `: ${detail}` : ` ${res.statusText}`}`;
}

function firstErrorDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ detail?: string; title?: string }> };
    const first = parsed.errors?.[0];
    return first?.detail ?? first?.title;
  } catch {
    return undefined;
  }
}
