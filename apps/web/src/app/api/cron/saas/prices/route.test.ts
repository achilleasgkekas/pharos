import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/cron/saas/prices is the scheduler trigger for the MULTI-TENANT price scrape
// (runPriceScrapeAllTenants). The fan-out itself is unit-tested in
// items/actions.priceScrapeSweep.test.ts; here only the runner is mocked at the module
// boundary (alongside saasMode). saasGuard is pure and runs for REAL, so the mid-throw test
// exercises the production error shaping. This covers what the ROUTE owns:
//   - SAAS_MODE off → 404 (self-host uses /api/cron/prices; this is the inverse gate),
//   - CRON_SECRET unset → 500 fail-closed, sweep untouched,
//   - bearer gate: missing / wrong token → 401, sweep untouched,
//   - correct token → 200, runs the sweep once, echoes every fleet counter,
//   - a mid-handler throw → clean { error } 500 JSON.

type SweepResult = {
  ok: boolean;
  tenants: number;
  tenantErrors: number;
  scanned: number;
  itemsChanged: number;
  linksChecked: number;
  drops: number;
  errors: number;
};

const ZERO: SweepResult = { ok: true, tenants: 0, tenantErrors: 0, scanned: 0, itemsChanged: 0, linksChecked: 0, drops: 0, errors: 0 };

const { saasModeMock, runPriceScrapeAllTenantsMock } = vi.hoisted(() => ({
  saasModeMock: vi.fn(() => true),
  runPriceScrapeAllTenantsMock: vi.fn(async (): Promise<SweepResult> => ({ ...ZERO })),
}));

vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/app/items/actions', () => ({ runPriceScrapeAllTenants: runPriceScrapeAllTenantsMock }));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/cron/saas/prices', { method: 'POST', headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'cron-secret-123' };
  saasModeMock.mockReturnValue(true);
  runPriceScrapeAllTenantsMock.mockResolvedValue({ ...ZERO });
});

describe('mode + configuration gates', () => {
  it('SAAS_MODE off → 404, never runs the sweep', async () => {
    saasModeMock.mockReturnValue(false);
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'SaaS mode is not enabled' });
    expect(runPriceScrapeAllTenantsMock).not.toHaveBeenCalled();
  });

  it('CRON_SECRET unset → 500 (fail closed), never runs the sweep', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeReq({ authorization: 'Bearer whatever' }));
    expect(res.status).toBe(500);
    expect(runPriceScrapeAllTenantsMock).not.toHaveBeenCalled();
  });
});

describe('bearer token gate', () => {
  it('missing authorization header → 401, never runs the sweep', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(runPriceScrapeAllTenantsMock).not.toHaveBeenCalled();
  });

  it('wrong token → 401', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-XXX' }));
    expect(res.status).toBe(401);
    expect(runPriceScrapeAllTenantsMock).not.toHaveBeenCalled();
  });

  it('correct bearer token → 200 and runs the sweep exactly once', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    expect(runPriceScrapeAllTenantsMock).toHaveBeenCalledTimes(1);
  });
});

describe('result passthrough', () => {
  it('echoes every fleet counter of a working sweep verbatim', async () => {
    runPriceScrapeAllTenantsMock.mockResolvedValueOnce({
      ok: true, tenants: 3, tenantErrors: 1, scanned: 40, itemsChanged: 9, linksChecked: 88, drops: 5, errors: 12,
    });
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, tenants: 3, tenantErrors: 1, scanned: 40, itemsChanged: 9, linksChecked: 88, drops: 5, errors: 12,
    });
  });

  it('a mid-handler throw surfaces as a clean 500 JSON, not an HTML crash page', async () => {
    runPriceScrapeAllTenantsMock.mockRejectedValueOnce(new Error('registry down'));
    const res = await POST(makeReq({ authorization: 'Bearer cron-secret-123' }));
    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'registry down' });
  });
});
