import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// GET /api/saas/admin/tenants/[slug]/dbstats is the superadmin console's LIVE, on-demand
// db.stats() reader for a single tenant — zero route-level coverage today. The pure shaping
// logic already has full unit coverage in `adminTenantDbStats.test.ts`
// (summarizeLiveDbStats/buildLiveDbStats) and the resolve-by-slug + live-read orchestration in
// `readLiveDbStatsForAdmin` is itself unit-tested there too — this closes the gap for what the
// ROUTE itself is responsible for: requireSuperadmin's short-circuit passes through untouched
// (zero live read), an unknown slug (readLiveDbStatsForAdmin returns null) → 404, a known slug
// → the real envelope verbatim with no-store, and a mid-handler throw surfaces as a clean 500
// JSON via saasGuard rather than an HTML crash page.

const { requireSuperadminMock, readLiveDbStatsForAdminMock } = vi.hoisted(() => ({
  requireSuperadminMock: vi.fn(),
  readLiveDbStatsForAdminMock: vi.fn(),
}));

vi.mock('@/lib/tenancy/superadmin', () => ({ requireSuperadmin: requireSuperadminMock }));
vi.mock('@/lib/tenancy/adminTenantDbStats', () => ({
  readLiveDbStatsForAdmin: readLiveDbStatsForAdminMock,
}));

import { GET } from './route';

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const ENVELOPE = {
  format: 'pharos.admin-tenant-dbstats' as const,
  version: 1 as const,
  generatedAt: '2026-07-25T00:00:00.000Z',
  slug: 'acme',
  dbName: 'pharos_acme',
  measured: true,
  live: {
    dataSize: 1000,
    storageSize: 800,
    indexSize: 200,
    objects: 42,
    dbBytes: 1000,
    fileBytes: 500,
    totalBytes: 1500,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperadminMock.mockResolvedValue({ account: { sub: 'op1', email: 'ops@pharos.dev' } });
  readLiveDbStatsForAdminMock.mockResolvedValue(ENVELOPE);
});

describe('GET /api/saas/admin/tenants/[slug]/dbstats', () => {
  it('passes through requireSuperadmin short-circuit untouched, never reads live stats', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(new Request('https://pharos.test'), makeParams('acme'));

    expect(res).toBe(blocked);
    expect(readLiveDbStatsForAdminMock).not.toHaveBeenCalled();
  });

  it('not authenticated short-circuit (401) passes through untouched', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(new Request('https://pharos.test'), makeParams('acme'));

    expect(res).toBe(blocked);
    expect(readLiveDbStatsForAdminMock).not.toHaveBeenCalled();
  });

  it('unknown slug (readLiveDbStatsForAdmin → null) → 404', async () => {
    readLiveDbStatsForAdminMock.mockResolvedValueOnce(null);

    const res = await GET(new Request('https://pharos.test'), makeParams('ghost'));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('tenant not found');
  });

  it('known slug → the real envelope verbatim, no-store', async () => {
    const res = await GET(new Request('https://pharos.test'), makeParams('acme'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(readLiveDbStatsForAdminMock).toHaveBeenCalledWith('acme');
    const json = await res.json();
    expect(json).toEqual(ENVELOPE);
  });

  it('threads the resolved slug param through verbatim (no trim/lowercase at the route level)', async () => {
    await GET(new Request('https://pharos.test'), makeParams('  ACME  '));
    expect(readLiveDbStatsForAdminMock).toHaveBeenCalledWith('  ACME  ');
  });

  it('a mid-handler throw (live db.stats read fails) surfaces as a clean 500 JSON (saasGuard), not an HTML crash page', async () => {
    readLiveDbStatsForAdminMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await GET(new Request('https://pharos.test'), makeParams('acme'));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo down');
  });
});
