import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// GET /api/saas/usage is the billing/usage-dashboard read surface: current-period AI + storage
// usage and quota status for one of the signed-in account's workspaces. It exercises the whole
// metering stack (session → membership → tenant context → ledger → quota math). Zero
// route-level coverage today (grep of api/saas/usage/**/*.test.ts before this file: none). The
// quota/cost math itself (`aiQuotaStatus`/`storageQuotaStatus`/`buildCostSummary`) is pure and
// already unit-tested in its own suites, so this file mocks those at the module boundary and
// asserts only what the ROUTE itself is responsible for:
//   - saasAuthGate's short-circuit (SAAS_MODE off / AUTH_SECRET missing) passes through
//     untouched, zero DB/session work,
//   - no session (getCurrentAccount → null) → 401 "not authenticated", zero connectDB,
//   - authenticated but zero active-membership tenants → 404 "no workspace for this account",
//   - default (no ?tenant=) picks the FIRST tenant from accountTenants,
//   - ?tenant= picks by slug (case-insensitive, trimmed) and rejects a slug the account isn't
//     a member of with 403 "not a member of that workspace", never calling getTenantContext,
//   - getTenantContext resolving to null (tenant deleted mid-flight) → 404 "workspace not found",
//   - success: currentUsage/aiQuotaStatus/storageQuotaStatus/buildCostSummary are called with
//     the right arguments and the response envelope assembles their outputs verbatim,
//   - a mid-handler throw becomes a clean 500 JSON via the real saasGuard.

const {
  saasAuthGateMock,
  connectDBMock,
  accountTenantsMock,
  getCurrentAccountMock,
  getTenantContextMock,
  currentUsageMock,
  aiQuotaStatusMock,
  storageQuotaStatusMock,
  buildCostSummaryMock,
} = vi.hoisted(() => ({
  saasAuthGateMock: vi.fn(() => null as NextResponse | null),
  connectDBMock: vi.fn(async () => {}),
  accountTenantsMock: vi.fn(async (_accountId: string) => [] as Array<{
    tenantId: string;
    slug: string;
    name: string;
    role: string;
    plan: string;
    status: string;
  }>),
  getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
  getTenantContextMock: vi.fn(async (_input?: unknown) => null as Record<string, unknown> | null),
  currentUsageMock: vi.fn(async (_ctx: unknown) => ({
    period: '2026-07',
    aiCalls: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiCostMicros: 0,
    storageBytes: 0,
    metered: true,
  })),
  aiQuotaStatusMock: vi.fn((_plan: unknown, _used: number) => ({
    used: 0,
    limit: null as number | null,
    remaining: null as number | null,
    allowed: true,
    ratio: 0,
  })),
  storageQuotaStatusMock: vi.fn((_plan: unknown, _used: number) => ({
    used: 0,
    limit: null as number | null,
    remaining: null as number | null,
    allowed: true,
    ratio: 0,
  })),
  buildCostSummaryMock: vi.fn((_input: unknown) => ({ period: '2026-07', aiCalls: 0, costFormatted: '€0.00' })),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/context', () => ({ getTenantContext: getTenantContextMock }));
vi.mock('@/lib/billing/usage', () => ({
  currentUsage: currentUsageMock,
  aiQuotaStatus: aiQuotaStatusMock,
  storageQuotaStatus: storageQuotaStatusMock,
}));
vi.mock('@/lib/billing/costSummary', () => ({ buildCostSummary: buildCostSummaryMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the mid-handler-throw
  // test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});

import { GET } from './route';

function makeReq(url = 'https://app.example.com/api/saas/usage'): Request {
  return new Request(url);
}

const TENANT_A = { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' };
const TENANT_B = { tenantId: 't2', slug: 'globex', name: 'Globex', role: 'member', plan: 'pro', status: 'active' };

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  accountTenantsMock.mockImplementation(async () => [TENANT_A, TENANT_B]);
  getTenantContextMock.mockImplementation(async () => ({ tenantId: 't1', plan: 'free', status: 'active' }));
  currentUsageMock.mockImplementation(async () => ({
    period: '2026-07',
    aiCalls: 12,
    aiInputTokens: 3000,
    aiOutputTokens: 900,
    aiCostMicros: 45000,
    storageBytes: 1048576,
    metered: true,
  }));
  aiQuotaStatusMock.mockImplementation(() => ({ used: 12, limit: 1000, remaining: 988, allowed: true, ratio: 0.012 }));
  storageQuotaStatusMock.mockImplementation(() => ({ used: 1048576, limit: null, remaining: null, allowed: true, ratio: 0 }));
  buildCostSummaryMock.mockImplementation(() => ({ period: '2026-07', aiCalls: 12, costFormatted: '€0.05' }));
});

describe('gate', () => {
  it('saasAuthGate short-circuit (SAAS_MODE off / AUTH_SECRET missing) passes through untouched, zero DB/session work', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });
});

describe('not authenticated', () => {
  it('no session (getCurrentAccount → null) → 401 "not authenticated", zero connectDB', async () => {
    getCurrentAccountMock.mockResolvedValueOnce(null);

    const res = await GET(makeReq());

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not authenticated');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
  });
});

describe('no workspace', () => {
  it('zero active-membership tenants → 404 "no workspace for this account"', async () => {
    accountTenantsMock.mockResolvedValueOnce([]);

    const res = await GET(makeReq());

    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('no workspace for this account');
    expect(getTenantContextMock).not.toHaveBeenCalled();
  });
});

describe('tenant selection', () => {
  it('no ?tenant= → picks the FIRST tenant from accountTenants', async () => {
    await GET(makeReq());
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'acme' });
  });

  it('?tenant= picks by slug, case-insensitive and trimmed', async () => {
    await GET(makeReq('https://app.example.com/api/saas/usage?tenant=%20GLOBEX%20'));
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'globex' });
  });

  it('?tenant= naming a workspace the account is not a member of → 403, never calls getTenantContext', async () => {
    const res = await GET(makeReq('https://app.example.com/api/saas/usage?tenant=notmine'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not a member of that workspace');
    expect(getTenantContextMock).not.toHaveBeenCalled();
  });

  it('getTenantContext resolving to null (tenant deleted mid-flight) → 404 "workspace not found"', async () => {
    getTenantContextMock.mockResolvedValueOnce(null);

    const res = await GET(makeReq());

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('workspace not found');
    expect(currentUsageMock).not.toHaveBeenCalled();
  });
});

describe('success', () => {
  it('assembles tenant/period/usage/quotas/cost from the resolved context and usage snapshot', async () => {
    const ctx = { tenantId: 't1', plan: 'pro', status: 'trialing' };
    getTenantContextMock.mockResolvedValueOnce(ctx);

    const res = await GET(makeReq());

    expect(currentUsageMock).toHaveBeenCalledWith(ctx);
    expect(aiQuotaStatusMock).toHaveBeenCalledWith('pro', 12);
    expect(storageQuotaStatusMock).toHaveBeenCalledWith('pro', 1048576);
    expect(buildCostSummaryMock).toHaveBeenCalledWith({
      period: '2026-07',
      aiCalls: 12,
      aiInputTokens: 3000,
      aiOutputTokens: 900,
      aiCostMicros: 45000,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      tenant: { slug: string; name: string; plan: string; status: string; role: string };
      period: string;
      usage: Record<string, unknown>;
      quotas: Record<string, unknown>;
      cost: Record<string, unknown>;
    };
    expect(json.tenant).toEqual({ slug: 'acme', name: 'Acme', plan: 'pro', status: 'trialing', role: 'owner' });
    expect(json.period).toBe('2026-07');
    expect(json.usage).toEqual({
      aiCalls: 12,
      aiInputTokens: 3000,
      aiOutputTokens: 900,
      aiCostMicros: 45000,
      storageBytes: 1048576,
      metered: true,
    });
    expect(json.quotas).toEqual({
      ai: { used: 12, limit: 1000, remaining: 988, allowed: true, ratio: 0.012 },
      storage: { used: 1048576, limit: null, remaining: null, allowed: true, ratio: 0 },
    });
    expect(json.cost).toEqual({ period: '2026-07', aiCalls: 12, costFormatted: '€0.05' });
  });
});

describe('errors', () => {
  it('a mid-handler throw (connectDB rejecting) becomes a clean 500 JSON via saasGuard', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('db down');
  });
});
