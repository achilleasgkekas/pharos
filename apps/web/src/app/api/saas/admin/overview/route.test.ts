import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// GET /api/saas/admin/overview is the superadmin console's FLEET OVERVIEW aggregate — zero
// route-level coverage today (grep of api/saas/admin/**/*.test.ts before this file: only
// admin/tenants/[slug] has one). The underlying tally/rollup logic already has full unit
// coverage (`adminOverview.test.ts` for `readFleetOverviewForAdmin`, `superadmin.test.ts` for
// the allowlist gate) — this closes the gap for what the ROUTE wrapper itself is responsible
// for: requireSuperadmin's short-circuit passes through untouched (zero aggregate work),
// the happy path returns the aggregate verbatim with `no-store`, and a mid-handler throw
// surfaces as a clean 500 JSON via saasGuard rather than an HTML crash page.

const { requireSuperadminMock, readFleetOverviewForAdminMock } = vi.hoisted(() => ({
  requireSuperadminMock: vi.fn(),
  readFleetOverviewForAdminMock: vi.fn(),
}));

vi.mock('@/lib/tenancy/superadmin', () => ({ requireSuperadmin: requireSuperadminMock }));
vi.mock('@/lib/tenancy/adminOverview', () => ({
  readFleetOverviewForAdmin: readFleetOverviewForAdminMock,
}));

import { GET } from './route';

const OVERVIEW = {
  format: 'pharos.admin-fleet-overview' as const,
  version: 1 as const,
  generatedAt: '2026-07-25T00:00:00.000Z',
  tenants: { total: 3, byPlan: { free: 2, shared: 1 }, byStatus: { active: 3 }, byTier: { shared: 3, dedicated: 0 } },
  accounts: { total: 5 },
  usage: { period: '2026-07', aiCalls: 12, aiTokens: 3400, aiCostUsd: 0.5, storageBytes: 1024 },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperadminMock.mockResolvedValue({ account: { sub: 'op1', email: 'ops@pharos.dev' } });
  readFleetOverviewForAdminMock.mockResolvedValue(OVERVIEW);
});

describe('GET /api/saas/admin/overview', () => {
  it('passes through requireSuperadmin short-circuit untouched, never reads the overview', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET();

    expect(res).toBe(blocked);
    expect(readFleetOverviewForAdminMock).not.toHaveBeenCalled();
  });

  it('not authenticated short-circuit (401) passes through untouched', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET();

    expect(res).toBe(blocked);
    expect(readFleetOverviewForAdminMock).not.toHaveBeenCalled();
  });

  it('happy path: returns the fleet overview verbatim with no-store', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(readFleetOverviewForAdminMock).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json).toEqual(OVERVIEW);
  });

  it('a mid-handler throw surfaces as a clean 500 JSON (saasGuard), not an HTML crash page', async () => {
    readFleetOverviewForAdminMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await GET();

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo down');
  });
});
