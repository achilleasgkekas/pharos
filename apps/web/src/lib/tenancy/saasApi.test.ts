import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `saasApi` is the shared plumbing under EVERY /api/saas/* route: `saasAuthGate` decides
// whether the SaaS control plane exists at all for this deployment, and `accountTenants`
// is the workspace list that login, session and both resolvers (`workspaceSession`,
// `billingSession`) build their authz on. Every route test mocks both of them, and the two
// resolver tests mock them too, so until now nothing in the suite ever executed either:
// a regression here (a gate that stops firing when SAAS_MODE is off, or a tenant list that
// leaks a workspace the account was removed from) would have passed the whole suite green.
//
// `saasGuard`, the third export, already has its own file (`saasGuard.test.ts`) and is not
// re-tested here.
//
// Mocked only at the node-only seams: `accountAuthConfigured` (reads AUTH_SECRET) and the
// two Mongoose models. `saasMode()` runs FOR REAL off process.env, so the flag ladder is
// pinned as wired rather than echoed from a mock.
//
// The fixtures deliberately DIVERGE: the membership row and the tenant doc disagree on
// every field they share, so each "which source of truth" assertion is load-bearing.
// role comes from the MEMBERSHIP; slug / name / plan / status come from the TENANT DOC.

const {
  accountAuthConfiguredMock,
  connectDBMock,
  membershipFind,
  membershipSelect,
  membershipLean,
  tenantFind,
  tenantSelect,
  tenantLean,
} = vi.hoisted(() => {
  const membershipLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const membershipSelect = vi.fn((_fields: string) => ({ lean: membershipLean }));
  const membershipFind = vi.fn((_filter: Record<string, unknown>) => ({
    select: membershipSelect,
  }));
  const tenantLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const tenantSelect = vi.fn((_fields: string) => ({ lean: tenantLean }));
  const tenantFind = vi.fn((_filter: Record<string, unknown>) => ({ select: tenantSelect }));
  return {
    accountAuthConfiguredMock: vi.fn(() => true),
    connectDBMock: vi.fn(async () => {}),
    membershipFind,
    membershipSelect,
    membershipLean,
    tenantFind,
    tenantSelect,
    tenantLean,
  };
});

vi.mock('@/lib/tenancy/accountSession', () => ({
  accountAuthConfigured: accountAuthConfiguredMock,
}));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Membership', () => ({ Membership: { find: membershipFind } }));
vi.mock('@/models/Tenant', () => ({ Tenant: { find: tenantFind } }));

import { saasAuthGate, accountTenants } from './saasApi';

const ORIGINAL_MODE = process.env.SAAS_MODE;

/** Membership row as the control plane stores it. `role` here is the authz source of truth. */
function membership(over: Record<string, unknown> = {}) {
  return {
    tenant: 't1',
    role: 'owner',
    // deliberately present and WRONG: these must never be read off the membership.
    slug: 'membership-slug',
    plan: 'enterprise',
    status: 'active',
    ...over,
  };
}

/** Tenant doc. slug / name / plan / status here are the source of truth for the output. */
function tenantDoc(over: Record<string, unknown> = {}) {
  return {
    _id: 't1',
    slug: 'acme',
    name: 'Acme',
    plan: 'free',
    status: 'trialing',
    // fields that must NEVER reach the client through this helper:
    dbName: 'pharos_acme',
    aiKeyCipher: 'super-secret-cipher',
    stripeCustomerId: 'cus_123',
    ...over,
  };
}

/** Wire both model reads in one call. */
function wire(memberships: Array<Record<string, unknown>>, tenants: Array<Record<string, unknown>>) {
  membershipLean.mockResolvedValue(memberships);
  tenantLean.mockResolvedValue(tenants);
}

beforeEach(() => {
  vi.clearAllMocks();
  accountAuthConfiguredMock.mockReturnValue(true);
  connectDBMock.mockImplementation(async () => {});
  membershipSelect.mockImplementation(() => ({ lean: membershipLean }));
  membershipFind.mockImplementation(() => ({ select: membershipSelect }));
  tenantSelect.mockImplementation(() => ({ lean: tenantLean }));
  tenantFind.mockImplementation(() => ({ select: tenantSelect }));
  membershipLean.mockResolvedValue([]);
  tenantLean.mockResolvedValue([]);
  process.env.SAAS_MODE = 'on';
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.SAAS_MODE;
  else process.env.SAAS_MODE = ORIGINAL_MODE;
});

// ---------------------------------------------------------------------------
// saasAuthGate — the flag + config gate every SaaS route opens with.
// ---------------------------------------------------------------------------

describe('saasAuthGate — SAAS_MODE off (the self-hosted contract)', () => {
  it('returns a 404 when SAAS_MODE is unset (default = off)', async () => {
    delete process.env.SAAS_MODE;
    const res = saasAuthGate();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    expect(await res!.json()).toEqual({ error: 'SaaS mode is not enabled' });
  });

  it('404s for every off-ish flag value', () => {
    for (const v of ['', '   ', 'off', 'false', '0', 'no', 'disabled', 'onn', '2', 'yesplease']) {
      process.env.SAAS_MODE = v;
      expect(saasAuthGate()?.status, `SAAS_MODE=${JSON.stringify(v)}`).toBe(404);
    }
  });

  it('404s BEFORE looking at AUTH_SECRET — the mode check comes first', () => {
    // A self-hosted deployment has no AUTH_SECRET. It must still get the plain "these
    // endpoints do not exist" 404, never a 500 that hints a control plane is half-wired.
    process.env.SAAS_MODE = 'off';
    accountAuthConfiguredMock.mockReturnValue(false);
    const res = saasAuthGate();
    expect(res!.status).toBe(404);
    expect(accountAuthConfiguredMock).not.toHaveBeenCalled();
  });

  it('does not leak config state in the off body (exactly one key)', async () => {
    process.env.SAAS_MODE = 'off';
    const body = await saasAuthGate()!.json();
    expect(Object.keys(body)).toEqual(['error']);
  });
});

describe('saasAuthGate — SAAS_MODE on', () => {
  it('returns null (proceed) when the mode is on and AUTH_SECRET is configured', () => {
    expect(saasAuthGate()).toBeNull();
  });

  it('accepts every on-ish flag value, including casing and padding', () => {
    for (const v of ['on', '1', 'true', 'yes', 'ON', 'True', '  yes  ', 'YES']) {
      process.env.SAAS_MODE = v;
      expect(saasAuthGate(), `SAAS_MODE=${JSON.stringify(v)}`).toBeNull();
    }
  });

  it('fails closed with a 500 when AUTH_SECRET is missing', async () => {
    accountAuthConfiguredMock.mockReturnValue(false);
    const res = saasAuthGate();
    expect(res!.status).toBe(500);
    expect(await res!.json()).toEqual({ error: 'AUTH_SECRET is not configured' });
  });

  it('re-reads the flag on every call (no module-load caching)', () => {
    expect(saasAuthGate()).toBeNull();
    process.env.SAAS_MODE = 'off';
    expect(saasAuthGate()?.status).toBe(404);
    process.env.SAAS_MODE = 'on';
    expect(saasAuthGate()).toBeNull();
  });

  it('re-reads the AUTH_SECRET state on every call', () => {
    expect(saasAuthGate()).toBeNull();
    accountAuthConfiguredMock.mockReturnValue(false);
    expect(saasAuthGate()?.status).toBe(500);
    accountAuthConfiguredMock.mockReturnValue(true);
    expect(saasAuthGate()).toBeNull();
  });

  it('never throws — a gate that throws would surface as an HTML 500', () => {
    accountAuthConfiguredMock.mockImplementation(() => {
      throw new Error('secret read exploded');
    });
    // Documented as-is: the gate does NOT swallow a throwing config reader. The route's
    // `saasGuard` wrapper is what turns that into a JSON 500, so pin the propagation.
    expect(() => saasAuthGate()).toThrow('secret read exploded');
  });
});

// ---------------------------------------------------------------------------
// accountTenants — the workspace list behind login, session and both resolvers.
// ---------------------------------------------------------------------------

describe('accountTenants — the membership query', () => {
  // Regression: this function used to query Membership/Tenant directly with no connectDB()
  // of its own. The connection is opened with bufferCommands:false (lib/db.ts), so a query
  // issued before it resolves THROWS instead of waiting. Most callers already connect first
  // themselves (workspaceSession.ts), but the root layout's navbar path (getSessionUser ->
  // saasSessionUser -> here) does not, and is often the very first DB touch in a request —
  // right after a restart/redeploy that throw was silently read by saasSessionUser's
  // fail-closed catch as "not signed in", making the whole navbar disappear on that request.
  it('connects to the DB before ever touching Membership or Tenant', async () => {
    await accountTenants('acc1');
    expect(connectDBMock).toHaveBeenCalled();
    expect(membershipFind.mock.invocationCallOrder[0]).toBeGreaterThan(connectDBMock.mock.invocationCallOrder[0]);
  });

  it('queries active memberships for the given account only', async () => {
    await accountTenants('acc1');
    expect(membershipFind).toHaveBeenCalledWith({ account: 'acc1', status: 'active' });
  });

  it('filters out invited/removed rows in the QUERY, not after the fact', async () => {
    // The status filter lives in the Mongo filter, so a still-invited or removed member
    // never reaches the mapping stage at all. Pin the filter key explicitly.
    await accountTenants('acc1');
    const filter = membershipFind.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.status).toBe('active');
  });

  it('projects only tenant + role and leans (no hydrated documents)', async () => {
    await accountTenants('acc1');
    expect(membershipSelect).toHaveBeenCalledWith('tenant role');
    expect(membershipLean).toHaveBeenCalled();
  });

  it('short-circuits with [] and ZERO tenant read when the account has no memberships', async () => {
    wire([], [tenantDoc()]);
    await expect(accountTenants('acc1')).resolves.toEqual([]);
    expect(tenantFind).not.toHaveBeenCalled();
  });
});

describe('accountTenants — the tenant read', () => {
  it('fetches exactly the tenants the memberships point at, in one $in query', async () => {
    wire(
      [membership({ tenant: 't1' }), membership({ tenant: 't2' }), membership({ tenant: 't3' })],
      []
    );
    await accountTenants('acc1');
    expect(tenantFind).toHaveBeenCalledTimes(1);
    expect(tenantFind).toHaveBeenCalledWith({ _id: { $in: ['t1', 't2', 't3'] } });
  });

  it('projects only slug / name / plan / status and leans', async () => {
    wire([membership()], [tenantDoc()]);
    await accountTenants('acc1');
    expect(tenantSelect).toHaveBeenCalledWith('slug name plan status');
    expect(tenantLean).toHaveBeenCalled();
  });

  it('passes ObjectId-shaped tenant refs through untouched to the $in', async () => {
    // The membership rows are lean, so `tenant` is whatever Mongo handed back (an ObjectId
    // in production). It must go into the query as-is, not stringified first, or the $in
    // would never match.
    const oid = { toString: () => 't1' };
    wire([membership({ tenant: oid })], [tenantDoc()]);
    await accountTenants('acc1');
    expect((tenantFind.mock.calls[0][0] as { _id: { $in: unknown[] } })._id.$in[0]).toBe(oid);
  });

  it('matches ObjectId refs to docs by String() on both sides', async () => {
    wire(
      [membership({ tenant: { toString: () => 't1' } })],
      [tenantDoc({ _id: { toString: () => 't1' } })]
    );
    const out = await accountTenants('acc1');
    expect(out).toHaveLength(1);
    expect(out[0].tenantId).toBe('t1');
  });
});

describe('accountTenants — shaping and the authority split', () => {
  it('reads slug / name / plan / status from the TENANT DOC and role from the MEMBERSHIP', async () => {
    wire([membership({ role: 'member' })], [tenantDoc()]);
    const out = await accountTenants('acc1');
    expect(out).toEqual([
      {
        tenantId: 't1',
        slug: 'acme', // tenant doc, NOT the membership's 'membership-slug'
        name: 'Acme',
        role: 'member', // membership, NOT the tenant doc
        plan: 'free', // tenant doc, NOT the membership's 'enterprise'
        status: 'trialing', // tenant doc
      },
    ]);
  });

  it('a role written onto the tenant doc cannot escalate the membership role', async () => {
    wire([membership({ role: 'member' })], [tenantDoc({ role: 'owner' })]);
    const out = await accountTenants('acc1');
    expect(out[0].role).toBe('member');
  });

  it('returns exactly the six whitelisted keys — no dbName, cipher or Stripe id leaks', async () => {
    wire([membership()], [tenantDoc()]);
    const out = await accountTenants('acc1');
    expect(Object.keys(out[0]).sort()).toEqual([
      'name',
      'plan',
      'role',
      'slug',
      'status',
      'tenantId',
    ]);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('super-secret-cipher');
    expect(serialized).not.toContain('pharos_acme');
    expect(serialized).not.toContain('cus_123');
  });

  it('coerces role / plan / status to strings but passes slug and name through verbatim', async () => {
    // Documented as-is: the helper String()s the three enum-ish fields and trusts the two
    // free-text ones. A missing plan therefore surfaces as the literal 'undefined' rather
    // than a fallback — worth knowing before anyone renders it raw.
    wire([membership({ role: 7 })], [tenantDoc({ plan: undefined, status: null, name: 42 })]);
    const out = await accountTenants('acc1');
    expect(out[0].role).toBe('7');
    expect(out[0].plan).toBe('undefined');
    expect(out[0].status).toBe('null');
    expect(out[0].name).toBe(42 as unknown as string);
  });

  it('stringifies the tenant id even when the doc carries an ObjectId', async () => {
    wire([membership({ tenant: 'abc123' })], [tenantDoc({ _id: { toString: () => 'abc123' } })]);
    const out = await accountTenants('acc1');
    expect(out[0].tenantId).toBe('abc123');
    expect(typeof out[0].tenantId).toBe('string');
  });
});

describe('accountTenants — orphans, order and duplicates', () => {
  it('drops a membership whose tenant doc no longer exists, keeping the rest', async () => {
    // A deleted workspace must vanish from the list rather than crash the login response.
    wire(
      [membership({ tenant: 't1' }), membership({ tenant: 'gone' }), membership({ tenant: 't2' })],
      [tenantDoc({ _id: 't1' }), tenantDoc({ _id: 't2', slug: 'beta', name: 'Beta' })]
    );
    const out = await accountTenants('acc1');
    expect(out.map((t) => t.slug)).toEqual(['acme', 'beta']);
  });

  it('returns [] when every membership is orphaned', async () => {
    wire([membership({ tenant: 'gone' })], []);
    await expect(accountTenants('acc1')).resolves.toEqual([]);
  });

  it('preserves MEMBERSHIP order, not the order the tenant query returned', async () => {
    wire(
      [membership({ tenant: 't2' }), membership({ tenant: 't1' })],
      [tenantDoc({ _id: 't1', slug: 'acme' }), tenantDoc({ _id: 't2', slug: 'beta' })]
    );
    const out = await accountTenants('acc1');
    expect(out.map((t) => t.slug)).toEqual(['beta', 'acme']);
  });

  it('emits one row per membership, each with its own role, for the same tenant', async () => {
    // The unique {account,tenant} index makes this impossible in practice; pinning it keeps
    // the mapping honest (it iterates memberships, not tenants).
    wire(
      [membership({ tenant: 't1', role: 'owner' }), membership({ tenant: 't1', role: 'member' })],
      [tenantDoc({ _id: 't1' })]
    );
    const out = await accountTenants('acc1');
    expect(out.map((t) => t.role)).toEqual(['owner', 'member']);
  });

  it('ignores a tenant doc that no membership points at', async () => {
    wire([membership({ tenant: 't1' })], [tenantDoc({ _id: 't1' }), tenantDoc({ _id: 't9' })]);
    const out = await accountTenants('acc1');
    expect(out).toHaveLength(1);
    expect(out[0].tenantId).toBe('t1');
  });

  it('does not mutate the rows it read', async () => {
    const rows = [membership()];
    const docs = [tenantDoc()];
    wire(rows, docs);
    await accountTenants('acc1');
    expect(rows[0]).toEqual(membership());
    expect(docs[0]).toEqual(tenantDoc());
  });
});

describe('accountTenants — failures propagate', () => {
  it('propagates a membership read failure instead of reporting "no workspaces"', async () => {
    membershipLean.mockRejectedValue(new Error('registry down'));
    await expect(accountTenants('acc1')).rejects.toThrow('registry down');
  });

  it('propagates a tenant read failure', async () => {
    wire([membership()], []);
    tenantLean.mockRejectedValue(new Error('tenant read failed'));
    await expect(accountTenants('acc1')).rejects.toThrow('tenant read failed');
  });
});
