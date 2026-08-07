import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// GET /api/saas/billing is the billing-panel read surface: plan metadata + lifecycle status +
// Stripe linkage + the single call-to-action the UI should render. It is the LAST api/saas route
// with zero route-level coverage (a scan of api/saas/**/route.ts against sibling route.test.ts
// files before this run left only this one). The pure math it leans on (`planDef`,
// `canManageBilling`, `evaluateTrial`, `buildBillingSummary`) is already unit-tested in its own
// suites, but here it runs FOR REAL so the assertions pin the actual wiring rather than a mock's
// echo. Mocked only at the node-only seams: session, tenant resolution, the Tenant model read and
// `stripeConfigured()` (env).
//
// What the ROUTE itself is responsible for, and what this file pins:
//   - saasAuthGate's short-circuit passes through untouched, zero session/DB work,
//   - no session → 401, zero connectDB,
//   - zero active-membership tenants → 404, never resolves a context,
//   - default (no ?tenant=) picks the FIRST membership; ?tenant= picks by slug (trimmed,
//     lower-cased); a blank ?tenant= falls back to the first rather than 403-ing,
//   - a slug the account isn't a member of → 403 WITHOUT touching the tenant context or DB read,
//   - context null / context without tenantId / tenant doc gone → 404 "workspace not found",
//   - the summary reads plan+status+Stripe ids from the TENANT DOC while role comes from the
//     MEMBERSHIP, and the response `tenant` block echoes the membership (slug/name/role),
//   - only the whitelisted summary fields reach the body (no stray tenant-doc secrets),
//   - a mid-handler throw becomes a clean 500 JSON via the real saasGuard.

const {
  saasAuthGateMock,
  connectDBMock,
  accountTenantsMock,
  getCurrentAccountMock,
  getTenantContextMock,
  tenantFindByIdMock,
  tenantLeanMock,
  stripeConfiguredMock,
} = vi.hoisted(() => {
  const tenantLean = vi.fn(async () => null as Record<string, unknown> | null);
  return {
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
    tenantFindByIdMock: vi.fn((_id: unknown) => ({ lean: tenantLean })),
    tenantLeanMock: tenantLean,
    stripeConfiguredMock: vi.fn(() => false),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/context', () => ({ getTenantContext: getTenantContextMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { findById: tenantFindByIdMock } }));
vi.mock('@/lib/billing/stripe', () => ({ stripeConfigured: stripeConfiguredMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the throw tests
  // exercise the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});

import { GET } from './route';

function makeReq(url = 'https://app.example.com/api/saas/billing'): Request {
  return new Request(url);
}

// The MEMBERSHIP rows (what accountTenants returns): slug/name/role live here.
const MEMBER_A = { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' };
const MEMBER_B = { tenantId: 't2', slug: 'globex', name: 'Globex', role: 'member', plan: 'shared', status: 'active' };

// The TENANT DOC (what Tenant.findById returns): plan/status/Stripe ids live here.
function tenantDoc(over: Record<string, unknown> = {}) {
  return {
    _id: 't1',
    slug: 'acme',
    name: 'Acme',
    plan: 'shared',
    status: 'active',
    billingCustomerId: 'cus_123',
    billingSubscriptionId: 'sub_123',
    trialEndsAt: null,
    ...over,
  };
}

type BillingBody = {
  tenant: { slug: string; name: string; role: string };
  plan: {
    key: string;
    name: string;
    priceMonthlyEUR: number;
    tier: string;
    storageGB: number;
    aiCallsPerMonth: number | null;
    customDomain: boolean;
  };
  status: string;
  trialEndsAt: string | null;
  trial: { onTrial: boolean; expired: boolean; daysLeft: number | null };
  subscription: { customerId: string | null; subscriptionId: string | null; active: boolean };
  billingConfigured: boolean;
  canManage: boolean;
  action: string;
};

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  accountTenantsMock.mockImplementation(async () => [MEMBER_A, MEMBER_B]);
  getTenantContextMock.mockImplementation(async () => ({ tenantId: 't1', plan: 'shared', status: 'active' }));
  tenantFindByIdMock.mockImplementation(() => ({ lean: tenantLeanMock }));
  tenantLeanMock.mockImplementation(async () => tenantDoc());
  stripeConfiguredMock.mockReturnValue(true);
});

describe('gate', () => {
  it('saasAuthGate short-circuit (SAAS_MODE off / AUTH_SECRET missing) passes through untouched, zero session/DB work', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
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
  it('zero active-membership tenants → 404 "no workspace for this account", never resolves a context', async () => {
    accountTenantsMock.mockResolvedValueOnce([]);

    const res = await GET(makeReq());

    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('no workspace for this account');
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });
});

describe('tenant selection', () => {
  it('no ?tenant= → picks the FIRST membership', async () => {
    await GET(makeReq());
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'acme' });
  });

  it('?tenant= picks by slug, trimmed and case-insensitive', async () => {
    await GET(makeReq('https://app.example.com/api/saas/billing?tenant=%20GLOBEX%20'));
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'globex' });
  });

  it('a blank/whitespace ?tenant= falls back to the FIRST membership instead of 403-ing', async () => {
    const res = await GET(makeReq('https://app.example.com/api/saas/billing?tenant=%20%20'));

    expect(res.status).toBe(200);
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'acme' });
  });

  it('the resolver receives the MEMBERSHIP slug, not the raw query string', async () => {
    await GET(makeReq('https://app.example.com/api/saas/billing?tenant=GLOBEX'));
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: MEMBER_B.slug });
  });

  it('?tenant= naming a workspace the account is not a member of → 403, zero context resolve and zero DB read', async () => {
    const res = await GET(makeReq('https://app.example.com/api/saas/billing?tenant=notmine'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not a member of that workspace');
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('context null (tenant deleted mid-flight) → 404 "workspace not found", no DB read', async () => {
    getTenantContextMock.mockResolvedValueOnce(null);

    const res = await GET(makeReq());

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('workspace not found');
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('context WITHOUT a tenantId (self-hosted default ctx shape) → 404, no DB read', async () => {
    getTenantContextMock.mockResolvedValueOnce({ plan: 'shared', status: 'active' });

    const res = await GET(makeReq());

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('workspace not found');
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('tenant doc missing (membership row outlived the tenant) → 404 "workspace not found"', async () => {
    tenantLeanMock.mockResolvedValueOnce(null);

    const res = await GET(makeReq());

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('workspace not found');
  });

  it('reads the tenant doc by the tenantId from the RESOLVED CONTEXT, not the membership row', async () => {
    // Membership says t1; the resolver is the authority and says t99.
    getTenantContextMock.mockResolvedValueOnce({ tenantId: 't99', plan: 'free', status: 'active' });

    await GET(makeReq());

    expect(tenantFindByIdMock).toHaveBeenCalledTimes(1);
    expect(tenantFindByIdMock).toHaveBeenCalledWith('t99');
  });
});

describe('summary assembly', () => {
  it('plan/status/Stripe linkage come from the TENANT DOC, role + identity from the MEMBERSHIP', async () => {
    // Deliberately divergent: the membership row is stale (free/active/"Old name"), the doc is truth.
    accountTenantsMock.mockResolvedValueOnce([
      { ...MEMBER_A, name: 'Acme Household', plan: 'free', status: 'canceled' },
    ]);
    tenantLeanMock.mockResolvedValueOnce(
      tenantDoc({ plan: 'dedicated', status: 'past_due', slug: 'renamed-in-doc', name: 'Doc Name' }),
    );

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    const json = (await res.json()) as BillingBody;
    // Identity block mirrors the membership (what the viewer navigated to), not the doc.
    expect(json.tenant).toEqual({ slug: 'acme', name: 'Acme Household', role: 'owner' });
    // Plan + status come from the doc.
    expect(json.plan.key).toBe('dedicated');
    expect(json.plan.name).toBe('Dedicated');
    expect(json.plan.tier).toBe('dedicated');
    // 2026-08-07 plan change: the top plan is capped at 1000 AI calls and no longer carries a
    // custom domain. What this test actually guards is that the numbers come from the TENANT
    // doc's plan, so it just tracks the new values.
    expect(json.plan.aiCallsPerMonth).toBe(1000);
    expect(json.plan.customDomain).toBe(false);
    expect(json.status).toBe('past_due');
  });

  it('an unknown/legacy plan on the doc falls back to the free plan definition', async () => {
    tenantLeanMock.mockResolvedValueOnce(tenantDoc({ plan: 'enterprise-2019' }));

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.plan.key).toBe('free');
    expect(json.plan.name).toBe('Free');
    expect(json.plan.priceMonthlyEUR).toBe(0);
  });

  it('a missing status defaults to "trialing" rather than leaking null to the UI', async () => {
    tenantLeanMock.mockResolvedValueOnce(tenantDoc({ status: null }));

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.status).toBe('trialing');
  });

  it('trialEndsAt is serialized to ISO and drives the derived trial state', async () => {
    const end = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    tenantLeanMock.mockResolvedValueOnce(tenantDoc({ status: 'trialing', trialEndsAt: end }));

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.trialEndsAt).toBe(end.toISOString());
    expect(json.trial.onTrial).toBe(true);
    expect(json.trial.expired).toBe(false);
    expect(json.trial.daysLeft).toBe(3);
  });

  it('a trial whose end has passed reads as expired, not on-trial', async () => {
    const end = new Date(Date.now() - 60 * 60 * 1000);
    tenantLeanMock.mockResolvedValueOnce(tenantDoc({ status: 'trialing', trialEndsAt: end }));

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.trial).toEqual({ onTrial: false, expired: true, daysLeft: 0 });
  });

  it('an unparseable trialEndsAt yields null rather than "Invalid Date"', async () => {
    tenantLeanMock.mockResolvedValueOnce(tenantDoc({ status: 'active', trialEndsAt: 'not-a-date' }));

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.trialEndsAt).toBeNull();
  });

  it('Stripe ids are trimmed; a blank subscription id means no active subscription', async () => {
    tenantLeanMock.mockResolvedValueOnce(
      tenantDoc({ billingCustomerId: '  cus_pad  ', billingSubscriptionId: '   ' }),
    );

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.subscription).toEqual({ customerId: 'cus_pad', subscriptionId: null, active: false });
  });

  it('billingConfigured echoes stripeConfigured() — false when Stripe keys are absent', async () => {
    stripeConfiguredMock.mockReturnValueOnce(false);

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.billingConfigured).toBe(false);
  });

  it('the body carries ONLY the whitelisted summary fields — no stray tenant-doc secrets', async () => {
    tenantLeanMock.mockResolvedValueOnce(
      tenantDoc({ aiKeyCipher: 'ENCRYPTED', dbName: 'tenant_acme', internalNotes: 'do not ship' }),
    );

    const res = await GET(makeReq());
    const body = await res.text();
    const json = JSON.parse(body) as BillingBody;

    expect(Object.keys(json).sort()).toEqual(
      [
        'action',
        'billingConfigured',
        'canManage',
        'plan',
        'status',
        'subscription',
        'tenant',
        'trial',
        'trialEndsAt',
      ].sort(),
    );
    expect(body).not.toContain('ENCRYPTED');
    expect(body).not.toContain('tenant_acme');
    expect(body).not.toContain('do not ship');
  });
});

describe('call-to-action', () => {
  it('owner with a live subscription → canManage + "manage"', async () => {
    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.canManage).toBe(true);
    expect(json.action).toBe('manage');
    expect(json.subscription.active).toBe(true);
  });

  it('owner with no subscription yet → canManage + "subscribe"', async () => {
    tenantLeanMock.mockResolvedValueOnce(tenantDoc({ billingSubscriptionId: null }));

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.canManage).toBe(true);
    expect(json.action).toBe('subscribe');
  });

  it('admin is also a billing manager', async () => {
    accountTenantsMock.mockResolvedValueOnce([{ ...MEMBER_A, role: 'admin' }]);

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.canManage).toBe(true);
    expect(json.action).toBe('manage');
  });

  it('a plain member gets a read-only "view" even when a subscription exists', async () => {
    // This READ endpoint is open to any member — the role only downgrades the CTA.
    accountTenantsMock.mockResolvedValueOnce([{ ...MEMBER_A, role: 'member' }]);

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    const json = (await res.json()) as BillingBody;
    expect(json.canManage).toBe(false);
    expect(json.action).toBe('view');
    // Still sees the state, just cannot act on it.
    expect(json.subscription.active).toBe(true);
  });

  it('an unknown role is treated as non-managing (fails closed)', async () => {
    accountTenantsMock.mockResolvedValueOnce([{ ...MEMBER_A, role: 'billing-robot' }]);

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.canManage).toBe(false);
    expect(json.action).toBe('view');
  });

  it('the CTA is independent of billingConfigured — intent still surfaces when Stripe is unwired', async () => {
    stripeConfiguredMock.mockReturnValueOnce(false);
    tenantLeanMock.mockResolvedValueOnce(tenantDoc({ billingSubscriptionId: null }));

    const json = (await (await GET(makeReq())).json()) as BillingBody;

    expect(json.billingConfigured).toBe(false);
    expect(json.action).toBe('subscribe');
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

  it('a failing tenant read becomes a 500, not a misleading 404', async () => {
    tenantLeanMock.mockRejectedValueOnce(new Error('read timeout'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('read timeout');
  });

  it('a message-less error still yields the generic "Server error"', async () => {
    connectDBMock.mockRejectedValueOnce(new Error(''));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Server error');
  });

  it('a huge error message is truncated to 200 chars (no internals dumped to the client)', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('x'.repeat(5000)));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toHaveLength(200);
  });
});
