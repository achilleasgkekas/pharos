import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// `resolveWorkspaceSession` is the shared authz resolver behind EVERY workspace-scoped SaaS
// route (members, settings, export, erasure, AI key, lifecycle...). All eight of those route
// test files MOCK it, which means until now no test in the suite ever executed it: a bug in the
// order gate → session → membership → role → context → tenant doc → status would have passed
// ~4500 green tests silently. This file runs it for real.
//
// Mocked only at the node-only seams (gate/env, session cookie, DB connect, membership read,
// tenant resolution, the Tenant model). The two pure collaborators it leans on
// (`canManageMembers`, `workspaceStatusError`) run FOR REAL, so the role ladder and the
// lifecycle ladder are pinned as wired, not as echoed.
//
// The fixtures deliberately DIVERGE (membership tenantId/plan/status vs context tenantId vs
// tenant-doc plan/status) so that every "which source of truth" assertion is load-bearing:
//   - the tenant doc is fetched by the CONTEXT's tenantId, not the membership's,
//   - the lifecycle gate reads the TENANT DOC's status, not the membership's,
//   - the role gate reads the MEMBERSHIP's role.

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

import { resolveWorkspaceSession } from './workspaceSession';

const ACCOUNT = { sub: 'acc1', email: 'a@example.com' };

/** Membership row as `accountTenants` returns it. `role` here is the authz source of truth. */
function membership(over: Record<string, unknown> = {}) {
  return {
    tenantId: 't-membership', // deliberately NOT the context's tenantId
    slug: 'acme',
    name: 'Acme',
    role: 'owner',
    plan: 'pro', // deliberately NOT the tenant doc's plan
    status: 'active', // deliberately NOT the lifecycle source of truth
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

/** Tenant doc. `status` here is the lifecycle source of truth. */
function tenantDoc(over: Record<string, unknown> = {}) {
  return { _id: 't-doc', slug: 'acme', name: 'Acme', plan: 'free', status: 'active', ...over };
}

/** Wire the whole happy path in one call; each layer overridable. */
function happy(over: {
  tenants?: Array<Record<string, unknown>>;
  ctx?: Record<string, unknown> | null;
  doc?: Record<string, unknown> | null;
} = {}) {
  getCurrentAccountMock.mockResolvedValue(ACCOUNT);
  accountTenantsMock.mockResolvedValue(over.tenants ?? [membership()]);
  getTenantContextMock.mockResolvedValue(over.ctx === undefined ? context() : over.ctx);
  tenantFindByIdMock.mockResolvedValue(over.doc === undefined ? tenantDoc() : over.doc);
}

function isResponse(
  r: Awaited<ReturnType<typeof resolveWorkspaceSession>>
): r is { response: NextResponse } {
  return 'response' in r;
}

async function expectDenied(
  r: Awaited<ReturnType<typeof resolveWorkspaceSession>>,
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

describe('resolveWorkspaceSession — gate short-circuit', () => {
  it('returns the gate response untouched (by identity) and does no work behind it', async () => {
    const gate = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(gate);
    happy();

    const r = await resolveWorkspaceSession(null);

    expect(isResponse(r)).toBe(true);
    // Identity, not shape: the route must surface the gate's exact response.
    if (isResponse(r)) expect(r.response).toBe(gate);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('gate fires even when requireManage/allowInactive are set (no bypass path)', async () => {
    const gate = NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 });
    saasAuthGateMock.mockReturnValue(gate);
    happy();

    const r = await resolveWorkspaceSession('acme', true, true);

    expect(isResponse(r)).toBe(true);
    if (isResponse(r)) expect(r.response.status).toBe(500);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
  });
});

describe('resolveWorkspaceSession — session', () => {
  it('no account session → 401 without connecting to the DB', async () => {
    happy();
    getCurrentAccountMock.mockResolvedValue(null);

    await expectDenied(await resolveWorkspaceSession(null), 401, 'not authenticated');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
  });

  it('looks up memberships by the session subject, after connecting', async () => {
    happy();

    await resolveWorkspaceSession(null);

    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
    // connectDB must precede the query, not merely both happen.
    expect(connectDBMock.mock.invocationCallOrder[0]).toBeLessThan(
      accountTenantsMock.mock.invocationCallOrder[0]
    );
  });

  it('zero active memberships → 404 without resolving a tenant context', async () => {
    happy({ tenants: [] });

    await expectDenied(
      await resolveWorkspaceSession(null),
      404,
      'no workspace for this account'
    );
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });
});

describe('resolveWorkspaceSession — workspace selection', () => {
  it('no requested slug → the first membership', async () => {
    happy({ tenants: [membership({ slug: 'first' }), membership({ slug: 'second' })] });
    getTenantContextMock.mockResolvedValue(context({ slug: 'first' }));

    const r = await resolveWorkspaceSession(null);

    expect(isResponse(r)).toBe(false);
    if (!isResponse(r)) expect(r.session.workspace.slug).toBe('first');
  });

  it('requested slug is trimmed and lower-cased before matching', async () => {
    happy({ tenants: [membership({ slug: 'first' }), membership({ slug: 'second' })] });

    const r = await resolveWorkspaceSession('  SECOND  ');

    expect(isResponse(r)).toBe(false);
    if (!isResponse(r)) expect(r.session.workspace.slug).toBe('second');
  });

  it('blank / whitespace-only slug falls back to the first membership (not a 403)', async () => {
    // The `|| null` after trim(): an empty string must read as "unspecified", not as
    // "a workspace named ''" — easy to lose in a refactor to `?? null`.
    for (const raw of ['', '   ', '\t\n']) {
      vi.clearAllMocks();
      saasAuthGateMock.mockReturnValue(null);
      happy({ tenants: [membership({ slug: 'first' }), membership({ slug: 'second' })] });

      const r = await resolveWorkspaceSession(raw);

      expect(isResponse(r)).toBe(false);
      if (!isResponse(r)) expect(r.session.workspace.slug).toBe('first');
    }
  });

  it('slug the account is not a member of → 403, with no context resolve and no tenant read', async () => {
    happy({ tenants: [membership({ slug: 'acme' })] });

    await expectDenied(
      await resolveWorkspaceSession('other-co'),
      403,
      'not a member of that workspace'
    );
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it('membership matching is exact on the lower-cased slug (canonical slugs are lower-case)', async () => {
    // A stored slug with capitals can never be selected, because `want` is lower-cased but the
    // membership slug is compared verbatim. Pinning it makes the invariant explicit rather than
    // an accident: slugs are minted lower-case.
    happy({ tenants: [membership({ slug: 'Acme' })] });

    await expectDenied(
      await resolveWorkspaceSession('acme'),
      403,
      'not a member of that workspace'
    );
  });
});

describe('resolveWorkspaceSession — role gate (requireManage)', () => {
  it('defaults to read access: a plain member resolves a session', async () => {
    happy({ tenants: [membership({ role: 'member' })] });

    const r = await resolveWorkspaceSession('acme');

    expect(isResponse(r)).toBe(false);
  });

  it.each(['owner', 'admin'])('requireManage allows %s', async (role) => {
    happy({ tenants: [membership({ role })] });

    const r = await resolveWorkspaceSession('acme', true);

    expect(isResponse(r)).toBe(false);
  });

  it('requireManage rejects a plain member with 403, before any context or tenant read', async () => {
    happy({ tenants: [membership({ role: 'member' })] });

    await expectDenied(
      await resolveWorkspaceSession('acme', true),
      403,
      'this action requires an owner or admin role'
    );
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it.each(['', 'OWNER', 'superadmin', 'viewer'])(
    'requireManage fails closed for the unrecognised role %j',
    async (role) => {
      happy({ tenants: [membership({ role })] });

      await expectDenied(
        await resolveWorkspaceSession('acme', true),
        403,
        'this action requires an owner or admin role'
      );
    }
  );

  it('the role gate reads the MEMBERSHIP role, not anything on the tenant doc', async () => {
    happy({
      tenants: [membership({ role: 'member' })],
      doc: tenantDoc({ role: 'owner' }), // a doc field must not be able to escalate
    });

    await expectDenied(
      await resolveWorkspaceSession('acme', true),
      403,
      'this action requires an owner or admin role'
    );
  });

  it('non-membership beats the role gate (403 "not a member", never leaks role wording)', async () => {
    happy({ tenants: [membership({ slug: 'acme', role: 'owner' })] });

    await expectDenied(
      await resolveWorkspaceSession('other-co', true),
      403,
      'not a member of that workspace'
    );
  });
});

describe('resolveWorkspaceSession — tenant resolution', () => {
  it('resolves the context by the MEMBERSHIP slug, not the raw requested string', async () => {
    happy({ tenants: [membership({ slug: 'acme' })] });

    await resolveWorkspaceSession('  ACME  ');

    expect(getTenantContextMock).toHaveBeenCalledTimes(1);
    expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'acme' });
  });

  it('null context → 404 without a tenant read', async () => {
    happy({ ctx: null });

    await expectDenied(await resolveWorkspaceSession('acme'), 404, 'workspace not found');
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });

  it.each([null, '', undefined])(
    'context whose tenantId is %j → 404 without a tenant read (the self-hosted default ctx shape)',
    async (tenantId) => {
      happy({ ctx: context({ tenantId }) });

      await expectDenied(await resolveWorkspaceSession('acme'), 404, 'workspace not found');
      expect(tenantFindByIdMock).not.toHaveBeenCalled();
    }
  );

  it("reads the Tenant doc by the CONTEXT's tenantId, not the membership's", async () => {
    happy();

    await resolveWorkspaceSession('acme');

    expect(tenantFindByIdMock).toHaveBeenCalledTimes(1);
    expect(tenantFindByIdMock).toHaveBeenCalledWith('t-context');
    expect(tenantFindByIdMock).not.toHaveBeenCalledWith('t-membership');
  });

  it('missing tenant doc → 404 "workspace not found" (not a status 403)', async () => {
    // Ordering guard: the lifecycle gate must not run first and mislabel a vanished tenant.
    happy({ doc: null });

    await expectDenied(await resolveWorkspaceSession('acme'), 404, 'workspace not found');
  });
});

describe('resolveWorkspaceSession — lifecycle gate', () => {
  it.each(['active', 'trialing'])('%s workspaces pass the default gate', async (status) => {
    happy({ doc: tenantDoc({ status }) });

    const r = await resolveWorkspaceSession('acme');

    expect(isResponse(r)).toBe(false);
  });

  it.each([
    ['pending', 'workspace is still being set up'],
    ['suspended', 'workspace is suspended'],
    ['canceled', 'workspace has been canceled'],
    ['bogus', 'workspace is not active'],
    ['', 'workspace is not active'],
  ])('%s → 403 %j', async (status, error) => {
    happy({ doc: tenantDoc({ status }) });

    await expectDenied(await resolveWorkspaceSession('acme'), 403, error);
  });

  it.each([undefined, null, 42, {}])(
    'a non-string status (%j) fails closed with 403',
    async (status) => {
      happy({ doc: tenantDoc({ status }) });

      await expectDenied(await resolveWorkspaceSession('acme'), 403, 'workspace is not active');
    }
  );

  it('tolerates casing and padding on the stored status', async () => {
    happy({ doc: tenantDoc({ status: '  ACTIVE  ' }) });

    const r = await resolveWorkspaceSession('acme');

    expect(isResponse(r)).toBe(false);
  });

  it('the gate reads the TENANT DOC status, not the membership status', async () => {
    happy({
      tenants: [membership({ status: 'active' })],
      doc: tenantDoc({ status: 'suspended' }),
    });

    await expectDenied(await resolveWorkspaceSession('acme'), 403, 'workspace is suspended');
  });

  it('a stale membership status cannot block a live workspace', async () => {
    // `accountTenants` already filters to active memberships; the row's own `status` field is
    // tenant metadata copied at read time and must never gate on its own.
    happy({
      tenants: [membership({ status: 'canceled' })],
      doc: tenantDoc({ status: 'active' }),
    });

    const r = await resolveWorkspaceSession('acme');

    expect(isResponse(r)).toBe(false);
  });

  it.each(['pending', 'suspended', 'canceled', 'bogus'])(
    'allowInactive lets a %s workspace through (view/cancel/reactivate routes)',
    async (status) => {
      happy({ doc: tenantDoc({ status }) });

      const r = await resolveWorkspaceSession('acme', false, true);

      expect(isResponse(r)).toBe(false);
      if (!isResponse(r)) expect(r.session.tenant.status).toBe(status);
    }
  );

  it('allowInactive does NOT relax the role gate', async () => {
    happy({ tenants: [membership({ role: 'member' })], doc: tenantDoc({ status: 'canceled' }) });

    await expectDenied(
      await resolveWorkspaceSession('acme', true, true),
      403,
      'this action requires an owner or admin role'
    );
  });

  it('the role gate outranks the lifecycle gate for a member of a suspended workspace', async () => {
    happy({ tenants: [membership({ role: 'member' })], doc: tenantDoc({ status: 'suspended' }) });

    await expectDenied(
      await resolveWorkspaceSession('acme', true),
      403,
      'this action requires an owner or admin role'
    );
    // ...and it short-circuits before the tenant is ever read.
    expect(tenantFindByIdMock).not.toHaveBeenCalled();
  });
});

describe('resolveWorkspaceSession — resolved session', () => {
  it('returns exactly account/workspace/ctx/tenant, each the identical resolved object', async () => {
    const tenants = [membership()];
    const ctx = context();
    const doc = tenantDoc();
    happy({ tenants, ctx, doc });

    const r = await resolveWorkspaceSession('acme');

    expect(isResponse(r)).toBe(false);
    if (isResponse(r)) return;
    expect(Object.keys(r.session).sort()).toEqual(['account', 'ctx', 'tenant', 'workspace']);
    expect(r.session.account).toBe(ACCOUNT);
    expect(r.session.workspace).toBe(tenants[0]);
    expect(r.session.ctx).toBe(ctx);
    expect(r.session.tenant).toBe(doc);
  });

  it('the resolved union carries no `response` key (callers discriminate on it)', async () => {
    happy();

    const r = await resolveWorkspaceSession('acme');

    expect('response' in r).toBe(false);
    expect('session' in r).toBe(true);
  });

  it('the workspace block keeps the membership plan even when the tenant doc disagrees', async () => {
    // Callers that need billing truth must read `tenant`; `workspace` stays the membership view.
    happy();

    const r = await resolveWorkspaceSession('acme');

    expect(isResponse(r)).toBe(false);
    if (isResponse(r)) return;
    expect(r.session.workspace.plan).toBe('pro');
    expect(r.session.tenant.plan).toBe('free');
  });
});

describe('resolveWorkspaceSession — failures propagate', () => {
  // The resolver has no try/catch by design: routes wrap it in `saasGuard`, which shapes the
  // uniform `{ error }` 500. If a rejection were ever swallowed into a 200-ish session here,
  // a DB outage would read as an authorization decision.
  it.each([
    ['getCurrentAccount', () => getCurrentAccountMock.mockRejectedValue(new Error('session boom'))],
    ['connectDB', () => connectDBMock.mockRejectedValue(new Error('session boom'))],
    ['accountTenants', () => accountTenantsMock.mockRejectedValue(new Error('session boom'))],
    ['getTenantContext', () => getTenantContextMock.mockRejectedValue(new Error('session boom'))],
    ['Tenant.findById', () => tenantFindByIdMock.mockRejectedValue(new Error('session boom'))],
  ])('a throw from %s propagates to the caller', async (_name, arrange) => {
    happy();
    arrange();

    await expect(resolveWorkspaceSession('acme')).rejects.toThrow('session boom');
  });

  it('a synchronous throw from the gate propagates too', async () => {
    saasAuthGateMock.mockImplementation(() => {
      throw new Error('gate boom');
    });

    await expect(resolveWorkspaceSession(null)).rejects.toThrow('gate boom');
  });
});
