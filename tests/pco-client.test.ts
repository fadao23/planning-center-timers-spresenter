import { describe, expect, it, vi } from 'vitest';
import {
  PcoClient,
  PcoError,
  PCO_SERVICES_BASE,
  type HttpRequest,
  type HttpResponse,
} from '../src/core/pco-client';
import { liveDoc } from './fixtures/live';

function ok(body: unknown): HttpResponse {
  return { ok: true, status: 200, statusText: 'OK', body: JSON.stringify(body) };
}

function fail(status: number, body = ''): HttpResponse {
  return { ok: false, status, statusText: 'Nope', body };
}

function clientWith(...responses: HttpResponse[]) {
  const http = vi.fn<(req: HttpRequest) => Promise<HttpResponse>>();
  for (const r of responses) http.mockResolvedValueOnce(r);
  return { http, client: new PcoClient(http, { appId: 'app', secret: 'sec' }) };
}

describe('PcoClient requests', () => {
  it('authenticates with HTTP Basic and asks for JSON', async () => {
    const { http, client } = clientWith(
      ok({ data: { id: '1', type: 'Organization', attributes: { name: 'Word of Life' } } }),
    );
    await expect(client.getOrganizationName()).resolves.toBe('Word of Life');
    expect(http).toHaveBeenCalledWith({
      method: 'GET',
      url: PCO_SERVICES_BASE,
      headers: { Authorization: 'Basic YXBwOnNlYw==', Accept: 'application/json' },
      timeoutMs: 8000,
    });
  });

  it('defaults the organization name', async () => {
    const { client } = clientWith(ok({ data: { id: '1', type: 'Organization', attributes: {} } }));
    await expect(client.getOrganizationName()).resolves.toBe('Planning Center');
  });

  it('lists service types', async () => {
    const { http, client } = clientWith(
      ok({ data: [{ id: '11', type: 'ServiceType', attributes: { name: 'Sunday' } }] }),
    );
    await expect(client.listServiceTypes()).resolves.toEqual([{ id: '11', name: 'Sunday' }]);
    expect(http.mock.calls[0][0].url).toBe(
      `${PCO_SERVICES_BASE}/service_types?per_page=100&order=sequence`,
    );
  });

  it('lists the latest past plan followed by upcoming plans', async () => {
    const plan = (id: string, title: string | null, series: string | null = null) => ({
      id,
      type: 'Plan',
      attributes: { title, series_title: series, dates: `Date ${id}`, sort_date: `2026-10-${id}` },
    });
    const { http, client } = clientWith(
      ok({ data: [plan('11', 'Last week')] }),
      ok({ data: [plan('18', null, 'Advent'), plan('25', null)] }),
    );
    const plans = await client.listPlans('77');
    expect(plans.map((p) => p.title)).toEqual(['Last week', 'Advent', 'Untitled plan']);
    expect(plans[0]).toEqual({
      id: '11',
      title: 'Last week',
      dates: 'Date 11',
      sortDate: '2026-10-11',
    });
    const urls = http.mock.calls.map((c) => c[0].url);
    expect(urls).toEqual([
      `${PCO_SERVICES_BASE}/service_types/77/plans?filter=past&order=-sort_date&per_page=1`,
      `${PCO_SERVICES_BASE}/service_types/77/plans?filter=future&order=sort_date&per_page=10`,
    ]);
  });

  it.each([
    ['getLive', 'GET', '/live?include=items,current_item_time'],
    ['toggleControl', 'POST', '/live/toggle_control'],
    ['goToNextItem', 'POST', '/live/go_to_next_item?include=items,current_item_time'],
    ['goToPreviousItem', 'POST', '/live/go_to_previous_item?include=items,current_item_time'],
  ] as const)('%s → %s …%s', async (method, verb, suffix) => {
    const { http, client } = clientWith(ok(liveDoc({})));
    const doc = await client[method]('77', '9001');
    expect(doc.data.type).toBe('Live');
    expect(http.mock.calls[0][0]).toMatchObject({
      method: verb,
      url: `${PCO_SERVICES_BASE}/service_types/77/plans/9001${suffix}`,
    });
  });

  it('escapes ids in paths', async () => {
    const { http, client } = clientWith(ok(liveDoc({})));
    await client.getLive('7/7', '9 9');
    expect(http.mock.calls[0][0].url).toContain('/service_types/7%2F7/plans/9%209/live');
  });
});

describe('PcoClient errors', () => {
  async function errorFor(res: HttpResponse): Promise<PcoError> {
    const { client } = clientWith(res);
    try {
      await client.listServiceTypes();
    } catch (err) {
      return err as PcoError;
    }
    throw new Error('expected a rejection');
  }

  it('explains auth, permission, missing and rate-limit failures', async () => {
    const e401 = await errorFor(fail(401));
    expect(e401).toBeInstanceOf(PcoError);
    expect(e401.isAuth).toBe(true);
    expect(e401.message).toMatch(/credentials/);
    expect((await errorFor(fail(403))).isAuth).toBe(true);
    expect((await errorFor(fail(404))).message).toMatch(/not found/);
    const e429 = await errorFor(fail(429));
    expect(e429.isRateLimited).toBe(true);
    expect(e429.isAuth).toBe(false);
  });

  it('surfaces the JSON:API error detail when there is one', async () => {
    const body = JSON.stringify({
      errors: [{ title: 'Unprocessable', detail: 'Not the controller' }],
    });
    expect((await errorFor(fail(422, body))).message).toBe(
      'Planning Center error 422: Not the controller',
    );
    expect((await errorFor(fail(500, 'oops'))).message).toBe('Planning Center error 500 Nope');
  });

  it('reports network errors and non-JSON bodies', async () => {
    const net = await errorFor({
      ok: false,
      status: 0,
      statusText: '',
      body: '',
      error: 'ENOTFOUND',
    });
    expect(net.status).toBe(0);
    expect(net.message).toBe('Network error: ENOTFOUND');
    const html = await errorFor({ ok: true, status: 200, statusText: 'OK', body: '<html>' });
    expect(html.message).toMatch(/not JSON/);
  });
});
