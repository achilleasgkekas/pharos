import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// `resolveBillingSession` is the authz resolver behind EVERY billing route (checkout, portal).
// Both of those route test files MOCK it, and so does `saasApi.test.ts` — which means no test in
// the suite ever executed it: a bug in the order gate → session → membership → role → context →
// tenant doc would have passed ~4800 green tests silently. This file runs it for real.
//
// It is a hand-written MIRROR of `lib/tenancy/workspaceSession` (deliberately not shared code,
// see that module's header), so the point of this file is to pin where the mirror is IDENTICAL
// and, more importantly, where it must DIVERGE:
//
//   1. There is no `requireManage` switch. Billing is owner/admin ONLY, always. A plain member
//      who can read every workspace route must still be refused here.
//   2. There is NO lifecycle gate. A suspended / canceled / pending workspace still resolves,
//      because reaching the Stripe portal is exactly how a lapsed customer fixes or cancels a
//      subscription. Copying workspaceSession's status gate over would lock them out of the one
//      screen that can un-lapse them.
//   3. The 403 wording is billing-specific.
//
// Mocked only at the node-only seams (gate/env, session cookie, DB connect, membership read,
// tenant resolution, the Tenant model). The pure collaborator `canManageBilling` runs FOR REAL,
// so the role ladder is pinned as wired, not as echoed.
//
// The fixtures deliberately DIVERGE (membership tenantId/plan/status vs context tenantId vs
// tenant-doc plan/status) so every "which source of truth" assertion is load-bearing.

const {
  saasAuthGateMock,
  connectDBMock,
  accountTenantsMock,
  getCurrentAccountMock,
  getTenantContextMock,
  tenantFindByIdMock,
} = vi.hoisted(() => ({
  saasAuthGateMock: vi.fn(() => null as NextResponse | null),
  connectDBMock: vi.fn(async () => {}),
  accountTenantsMock: vi.fn(async (_accountId: string) => [] as Array<Record<string, unknown>>),
  getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
  getTenantContextMock: vi.fn(async (_input?: unknown) => null as Record<string, unknown> | null),
  tenantFindByIdMock: vi.fn(async (_id: unknown) => null as Record<string, unknown> | null),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/context', () => ({ getTenantContext: getTenantContextMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { findById: tenantFindByIdMock } }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});

import { resolveBillingSession } from './billingSession';

const ACCOUNT = { sub: 'acc1', email: 'a@example.com' };

/** Membership row as `accountTenants` returns it. `role` here is the authz source of truth. */
function membership(over: Record<string, unknown> = {}) {
  return {
    tenantId: 't-membership', // deliberately NOT the context's tenantId
    slug: 'acme',
    name: 'Acme',
    role: 'owner',
    plan: 'pro', // deliberately NOT the tenant doc's plan
    status: 'active',
    ...over,
  };
}

/** Resolved tenant context. `tenantId` here is what the Tenant read must key on. */
function context(over: Record<string, unknown> = {}) {
  return {
    tenantId: 't-context',
    slug: 'acme',
    dbName: 'pharos_acme',
    plan: 'free',
    status: 'active',
    isDefault: false,
    ...over,
  };
}

function tenantDoc(over: Record<string, unknown> = {}) {
  return {
    _id: 't-doc',
    slug: 'acme',
    name: 'Acme',
    plan: 'free',
    status: 'active',
    stripeCustomerId: 'cus_123',
    ...over,
  };
}

/** Wire the whole happy path in one call; each layer overridable. */
function happy(
  over: {
    tenants?: Array<Record<string, unknown>>;
    ctx?: Record<string, unknown> | null;
    doc?: Record<string, unknown> | null;
  } = {}
) {
  getCurrentAccountMock.mockResolvedValue(ACCOUNT);
  accountTenantsMock.mockResolvedValue(over.tenants ?? [membership()]);
  getTenantContextMock.mockResolvedValue(over.ctx === undefined ? context() : over.ctx);
  tenantFindByIdMock.mockResolvedValue(over.doc === undefined ? tenantDoc() : over.doc);
}

function isResponse(
  r: Awaited<ReturnType<typeof resolveBillingSession>>
): r is { response: NextResponse } {
  return 'response' in r;
}

async function expectDenied(
  r: Awaited<ReturnType<typeof resolveBillingSession>>,
  status: number,
  error: string
) {
  expect(isResponse(r)).toBe(true);
  if (!isResponse(r)) return;
  expect(r.response.status).toBe(status);
  expect(await r.response.json()).toEqual({ error });
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockResolvedValue(undefined);
});

describe('resolveBillingSession — gate short-circuit', () => {
  it('returns the gate response untouched (by identity) and does no work behind it', async () => {
    const gate = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(gate);
    happy();

    const r = await resolveBillingSession(null);

    expect(isResponse(r)).toBe(true);
    // Identity, not shape: the route must surface the gate's exact response.
    if (isResponse(r)) expect(r.response).toBe(gate);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('the gate is the FIRST thing consulted, even with a slug supplied', async () => {
    // Self-hosted must never pay a DB round-trip for a billing route that cannot exist.
    const gate = NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 });
    saasAuthGateMock.mockReturnValue(gate);
    happy();

    const r = await resolveBillingSession('acme');

    expect(isResponse(r)).toBe(true);
    if (isResponse(r)) expect(r.response.status).toBe(500);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('a throwing gate propagates (the route turns it into a 500, not this resolver)', async () => {
    saasAuthGateMock.mockImplementation(() => {
      throw new Error('env read blew up');
    });
    happy();

    await expect(resolveBillingSession(null)).rejects.toThrow('env read blew up');
  });
});

describe('resolveBillingSession — session', () => {
  it('no account session → 401 without connecting to the DB', async () => {
    happy();
    getCurrentAccountMock.mockResolvedValue(null);

    await expectDenied(await resolveBillingSession(null), 401, 'not authenticated');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
  });

  it('looks up memberships by the session subject, after connecting', async () => {
    happy();

    await resolveBillingSession(null);

    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
    // connectDB must precede the query, not merely both happen.
    expect(connectDBMock.mock.invocationCallOrder[0]).toBeLessThan(
      accountTenantsMock.mock.invocationCallOrder[0]
    );
  });

  it('the membership read is keyed on the SESSION subject, never on a caller-supplied value', async () => {
    happy({ tenants: [membership({ account: 'someone-else' })] });

    await resolveBillingSession('acme');

    expect(accountTenantsMock).toHaveBeenCalledWith(ACCOUNT.sub);
  });

  it('zero active memberships → 404 without resolving a tenant context', async () => {
    happy({ tenants: [] });

    await expectDenied(await resolveBillingSession(null), 404, 'no workspace for this account');
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('a failing membership read propagates instead of reading as "no workspace"', async () => {
    // A registry outage must not be laundered into a 404 that tells a paying customer their
    // workspace is gone.
    happy();
    accountTenantsMock.mockRejectedValue(new Error('registry down'));

    await expect(resolveBillingSession(null)).rejects.toThrow('registry down');
  });
});

describe('resolveBillingSession — workspace selection', () => {
  it('no requested slug → the first membership', async () => {
    happy({ tenants: [membership({ slug: 'first' }), membership({ slug: 'second' })] });
    getTenantContextMock.mockResolvedValue(context({ slug: 'first' }));

    const r = await resolveBillingSession(null);

    expect(isResponse(r)).toBe(false);
    if (!isResponse(r)) expect(r.session.workspace.slug).toBe('first');
  });

  it('requested slug is trimmed and lower-cased before matching', async () => {
    happy({ tenants: [membership({ slug: 'first' }), membership({ slug: 'second' })] });

    const r = await resolveBillingSession('  SECOND  ');

    expect(isResponse(r)).toBe(false);
    if (!isResponse(r)) expect(r.session.workspace.slug).toBe('second');
  });

  it.each(['', '   ', '\t\n'])(
    'blank slug %j falls back to the first membership (not a 403)',
    async (raw) => {
      // The `|| null` after trim(): an empty string must read as "unspecified", not as
      // "a workspace named ''" — easy to lose in a refactor to `?? null`.
      happy({ tenants: [membership({ slug: 'first' }), membership({ slug: 'second' })] });

      const r = await resolveBillingSession(raw);

      expect(isResponse(r)).toBe(false);
      if (!isResponse(r)) expect(r.session.workspace.slug).toBe('first');
    }
  );

  it('slug the account is not a member of → 403, with no context resolve and no tenant read', async () => {
    happy({ tenants: [membership({ slug: 'acme' })] });

    await expectDenied(
      await resolveBillingSession('other-co'),
      403,
      'not a member of that workspace'
    );
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('membership matching is exact on the lower-cased slug (canonical slugs are lower-case)', async () => {
    happy({ tenants: [membership({ slug: 'Acme' })] });

    await expectDenied(await resolveBillingSession('acme'), 403, 'not a member of that workspace');
  });

  it('picks the matching membership, not merely the first, when several exist', async () => {
    happy({
      tenants: [
        membership({ slug: 'first', role: 'owner' }),
        membership({ slug: 'second', role: 'admin' }),
      ],
    });

    const r = await resolveBillingSession('second');

    expect(isResponse(r)).toBe(false);
    if (!isResponse(r)) expect(r.session.workspace.role).toBe('admin');
  });
});

describe('resolveBillingSession — role gate (owner/admin ONLY, no read tier)', () => {
  it.each(['owner', 'admin'])('%s may manage billing', async (role) => {
    happy({ tenants: [membership({ role })] });

    const r = await resolveBillingSession('acme');

    expect(isResponse(r)).toBe(false);
  });

  it('DIVERGENCE from workspaceSession: a plain member is refused even with no manage flag', async () => {
    // workspaceSession defaults to read access for `member`; billing has no such tier and no
    // switch to relax it. If this ever starts passing, a member can open checkout or the Stripe
    // portal for a workspace they do not own.
    happy({ tenants: [membership({ role: 'member' })] });

    await expectDenied(
      await resolveBillingSession('acme'),
      403,
      'billing requires an owner or admin role'
    );
  });

  it('the role gate runs BEFORE any context resolve or tenant read', async () => {
    happy({ tenants: [membership({ role: 'member' })] });

    await resolveBillingSession('acme');

    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it.each(['', 'OWNER', 'Admin', 'superadmin', 'viewer', 'billing'])(
    'fails closed for the unrecognised role %j',
    async (role) => {
      happy({ tenants: [membership({ role })] });

      await expectDenied(
        await resolveBillingSession('acme'),
        403,
        'billing requires an owner or admin role'
      );
    }
  );

  it.each([undefined, null, 42, {}])('fails closed for the non-string role %j', async (role) => {
    happy({ tenants: [membership({ role })] });

    await expectDenied(
      await resolveBillingSession('acme'),
      403,
      'billing requires an owner or admin role'
    );
  });

  it('the role gate reads the MEMBERSHIP role, not anything on the tenant doc', async () => {
    happy({
      tenants: [membership({ role: 'member' })],
      doc: tenantDoc({ role: 'owner' }), // a doc field must not be able to escalate
    });

    await expectDenied(
      await resolveBillingSession('acme'),
      403,
      'billing requires an owner or admin role'
    );
  });

  it('non-membership beats the role gate (403 "not a member", never leaks billing wording)', async () => {
    happy({ tenants: [membership({ slug: 'acme', role: 'owner' })] });

    await expectDenied(
      await resolveBillingSession('other-co'),
      403,
      'not a member of that workspace'
    );
  });
});

describe('resolveBillingSession — tenant resolution', () => {
  it('resolves the context by the MEMBERSHIP slug, not the raw requested string', async () => {
    happy({ tenants: [membership({ slug: 'acme' })] });

    await resolveBillingSession('  ACME  ');

    expect(getTenantContextMock).toHaveBeenCalledTimes(1);
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'acme' });
  });

  it('null context → 404 without a tenant read', async () => {
    happy({ ctx: null });

    await expectDenied(await resolveBillingSession('acme'), 404, 'workspace not found');
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it.each([null, '', undefined])(
    'context whose tenantId is %j → 404 without a tenant read (the self-hosted default ctx shape)',
    async (tenantId) => {
      happy({ ctx: context({ tenantId }) });

      await expectDenied(await resolveBillingSession('acme'), 404, 'workspace not found');
      expect(tenantFindByIdMock).not.toHaveBeenCalled();
    }
  );

  it("reads the Tenant doc by the CONTEXT's tenantId, not the membership's", async () => {
    happy();

    await resolveBillingSession('acme');

    expect(tenantFindByIdMock).toHaveBeenCalledTimes(1);
    expect(tenantFindByIdMock).toHaveBeenCalledWith('t-context');
    expect(tenantFindByIdMock).not.toHaveBeenCalledWith('t-membership');
  });

  it('missing tenant doc → 404 "workspace not found"', async () => {
    happy({ doc: null });

    await expectDenied(await resolveBillingSession('acme'), 404, 'workspace not found');
  });

  it('a failing tenant read propagates instead of reading as a missing workspace', async () => {
    happy();
    tenantFindByIdMock.mockRejectedValue(new Error('mongo timeout'));

    await expect(resolveBillingSession('acme')).rejects.toThrow('mongo timeout');
  });
});

describe('resolveBillingSession — NO lifecycle gate (deliberate divergence)', () => {
  // workspaceSession refuses suspended/canceled/pending workspaces. Billing must NOT: the
  // Stripe portal is precisely how a lapsed customer updates a dead card or cancels for good,
  // and checkout is how a canceled workspace comes back. Locking the status here would strand
  // exactly the accounts that need to pay.
  it.each(['active', 'trialing', 'pending', 'suspended', 'canceled', 'bogus', ''])(
    'a %j workspace still resolves a billing session',
    async (status) => {
      happy({ doc: tenantDoc({ status }) });

      const r = await resolveBillingSession('acme');

      expect(isResponse(r)).toBe(false);
      if (!isResponse(r)) expect(r.session.tenant.status).toBe(status);
    }
  );

  it.each([undefined, null])('a %j tenant status is not a denial either', async (status) => {
    happy({ doc: tenantDoc({ status }) });

    const r = await resolveBillingSession('acme');

    expect(isResponse(r)).toBe(false);
  });
});

describe('resolveBillingSession — resolved session', () => {
  it('returns exactly the four keys, each the identical object it resolved', async () => {
    const tenants = [membership()];
    const ctx = context();
    const doc = tenantDoc();
    happy({ tenants, ctx, doc });

    const r = await resolveBillingSession('acme');

    expect(isResponse(r)).toBe(false);
    if (isResponse(r)) return;
    expect(Object.keys(r.session).sort()).toEqual(['account', 'ctx', 'tenant', 'workspace']);
    // Identity, not deep-equality: the routes mutate/read the very doc that was fetched.
    expect(r.session.account).toBe(ACCOUNT);
    expect(r.session.workspace).toBe(tenants[0]);
    expect(r.session.ctx).toBe(ctx);
    expect(r.session.tenant).toBe(doc);
    expect('response' in r).toBe(false);
  });

  it('the context and the tenant doc may legitimately disagree; both are surfaced verbatim', async () => {
    // The routes decide which to trust (the doc, for anything Stripe-facing). The resolver must
    // not silently reconcile them.
    happy({ ctx: context({ plan: 'free' }), doc: tenantDoc({ plan: 'pro' }) });

    const r = await resolveBillingSession('acme');

    expect(isResponse(r)).toBe(false);
    if (isResponse(r)) return;
    expect(r.session.ctx.plan).toBe('free');
    expect(r.session.tenant.plan).toBe('pro');
  });

  it('does not mutate the membership row it selected', async () => {
    const tenants = [membership()];
    const before = JSON.parse(JSON.stringify(tenants[0]));
    happy({ tenants });

    await resolveBillingSession('acme');

    expect(tenants[0]).toEqual(before);
  });
});
