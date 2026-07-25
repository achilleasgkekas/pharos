import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// GET /api/saas/admin/tenants is the superadmin console's cross-tenant LISTING (paginated,
// optional status/search filter) — zero route-level coverage today (grep of
// api/saas/admin/**/*.test.ts before this file: only admin/overview + admin/tenants/[slug]
// have one). The pure parse/filter/shape logic already has full unit coverage elsewhere
// (`adminTenants.test.ts` for parseAdminTenantQuery/buildTenantQueryFilter/summarizeTenant/
// buildTenantListing) — this closes the gap for what the ROUTE itself is responsible for:
// requireSuperadmin's short-circuit passes through untouched (zero query-string parsing, zero
// DB read), the query string is parsed and threaded into listTenantsForAdmin + the listing
// envelope verbatim, and a mid-handler throw surfaces as a clean 500 JSON via saasGuard rather
// than an HTML crash page.

const { requireSuperadminMock, parseAdminTenantQueryMock, listTenantsForAdminMock, buildTenantListingMock } =
  vi.hoisted(() => ({
    requireSuperadminMock: vi.fn(),
    parseAdminTenantQueryMock: vi.fn(),
    listTenantsForAdminMock: vi.fn(),
    buildTenantListingMock: vi.fn(),
  }));

vi.mock('@/lib/tenancy/superadmin', () => ({ requireSuperadmin: requireSuperadminMock }));
vi.mock('@/lib/tenancy/adminTenants', () => ({
  parseAdminTenantQuery: parseAdminTenantQueryMock,
  listTenantsForAdmin: listTenantsForAdminMock,
  buildTenantListing: buildTenantListingMock,
}));

import { GET } from './route';

function makeReq(url = 'https://pharos.test/api/saas/admin/tenants'): NextRequest {
  return { url } as unknown as NextRequest;
}

const QUERY = { limit: 50, offset: 0, status: null, q: null };
const RESULT = { summaries: [{ id: 't1', slug: 'acme' }], total: 1 };
const LISTING = {
  format: 'pharos.admin-tenant-listing' as const,
  version: 1 as const,
  generatedAt: '2026-07-25T00:00:00.000Z',
  total: 1,
  count: 1,
  limit: 50,
  offset: 0,
  filter: { status: null, q: null },
  tenants: RESULT.summaries,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperadminMock.mockResolvedValue({ account: { sub: 'op1', email: 'ops@pharos.dev' } });
  parseAdminTenantQueryMock.mockReturnValue(QUERY);
  listTenantsForAdminMock.mockResolvedValue(RESULT);
  buildTenantListingMock.mockReturnValue(LISTING);
});

describe('GET /api/saas/admin/tenants', () => {
  it('passes through requireSuperadmin short-circuit untouched, never parses/queries/lists', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(parseAdminTenantQueryMock).not.toHaveBeenCalled();
    expect(listTenantsForAdminMock).not.toHaveBeenCalled();
    expect(buildTenantListingMock).not.toHaveBeenCalled();
  });

  it('not authenticated short-circuit (401) passes through untouched', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(listTenantsForAdminMock).not.toHaveBeenCalled();
  });

  it('parses the request URL search params and threads the parsed query into listTenantsForAdmin', async () => {
    await GET(makeReq('https://pharos.test/api/saas/admin/tenants?status=suspended&q=acme&limit=10&offset=20'));

    expect(parseAdminTenantQueryMock).toHaveBeenCalledTimes(1);
    const passedParams = parseAdminTenantQueryMock.mock.calls[0][0] as URLSearchParams;
    expect(passedParams.get('status')).toBe('suspended');
    expect(passedParams.get('q')).toBe('acme');
    expect(passedParams.get('limit')).toBe('10');
    expect(passedParams.get('offset')).toBe('20');
    expect(listTenantsForAdminMock).toHaveBeenCalledWith(QUERY);
  });

  it('happy path: builds the listing envelope from the summaries/total and returns it verbatim with no-store', async () => {
    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(buildTenantListingMock).toHaveBeenCalledWith(
      RESULT.summaries,
      expect.objectContaining({ total: RESULT.total, query: QUERY, generatedAt: expect.any(Date) })
    );
    const json = await res.json();
    expect(json).toEqual(LISTING);
  });

  it('a mid-handler throw (DB read fails) surfaces as a clean 500 JSON (saasGuard), not an HTML crash page', async () => {
    listTenantsForAdminMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo down');
    expect(buildTenantListingMock).not.toHaveBeenCalled();
  });
});
