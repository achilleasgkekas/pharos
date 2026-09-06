import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `getTenantContext` is the fork in the road between the two shapes of this codebase: with
// SAAS_MODE off it must hand back the frozen DEFAULT_TENANT having touched NOTHING (no
// connect, no query) — that is the self-hosted backward-compatibility contract — and with it
// on it becomes the tenant resolver every SaaS path reads. Nothing in the suite executed it
// until now: the route tests all mock it, so a regression in the slug/custom-domain ladder
// (or, worse, a DB touch leaking into self-hosted mode) would have stayed green.
//
// Mocked only at the two node-only seams: `connectDB` and the `Tenant` model. `saasMode`,
// `parseTenantSlug`, `normalizeHost` and `baseDomain` run FOR REAL off process.env, so the
// host→slug rules are pinned as wired here rather than echoed from a mock.

const { connectDBMock, findOneMock, findMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  findOneMock: vi.fn((_filter: Record<string, unknown>) => ({
    lean: async () => null as Record<string, unknown> | null,
  })),
  findMock: vi.fn((_filter: Record<string, unknown>) => ({
    select: () => ({ lean: async () => [] as Array<Record<string, unknown>> }),
  })),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { findOne: findOneMock, find: findMock } }));

import {
  getTenantContext,
  listActiveTenantContexts,
  dbNameFor,
  scoped,
  DEFAULT_TENANT,
  baseDomain,
  parseTenantSlug,
  normalizeHost,
  type TenantContext,
} from './context';

/** Tenant doc as the registry stores it (loose: the resolver reads it defensively). */
function doc(over: Record<string, unknown> = {}) {
  return {
    _id: 'tid1',
    slug: 'acme',
    dbName: 'pharos_acme',
    plan: 'shared',
    status: 'active',
    customDomain: '',
    aiByoKey: false,
    ...over,
  };
}

/** Registry-backed findOne: matches a doc on whichever single key the resolver queried. */
let registry: Array<Record<string, unknown>> = [];
function wireRegistry() {
  findOneMock.mockImplementation((filter: Record<string, unknown>) => ({
    lean: async () => {
      const [key, value] = Object.entries(filter)[0];
      return registry.find((d) => d[key] === value) ?? null;
    },
  }));
}

const ORIGINAL_MODE = process.env.SAAS_MODE;
const ORIGINAL_BASE = process.env.SAAS_BASE_DOMAIN;

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockResolvedValue(undefined);
  registry = [];
  wireRegistry();
  process.env.SAAS_MODE = 'on';
  process.env.SAAS_BASE_DOMAIN = 'ph-aros.com';
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.SAAS_MODE;
  else process.env.SAAS_MODE = ORIGINAL_MODE;
  if (ORIGINAL_BASE === undefined) delete process.env.SAAS_BASE_DOMAIN;
  else process.env.SAAS_BASE_DOMAIN = ORIGINAL_BASE;
});

describe('getTenantContext — SAAS_MODE off (the self-hosted contract)', () => {
  it.each([undefined, '', 'off', 'false', '0'])(
    'SAAS_MODE=%j returns DEFAULT_TENANT by identity with zero DB access',
    async (mode) => {
      if (mode === undefined) delete process.env.SAAS_MODE;
      else process.env.SAAS_MODE = mode;
      registry = [doc()];

      const ctx = await getTenantContext();

      // Identity, not shape: callers compare against the shared frozen instance.
      expect(ctx).toBe(DEFAULT_TENANT);
      expect(connectDBMock).not.toHaveBeenCalled();
      expect(findOneMock).not.toHaveBeenCalled();
    }
  );

  it('ignores a host AND an explicit slug that would otherwise resolve a real tenant', async () => {
    process.env.SAAS_MODE = 'off';
    registry = [doc()];

    const ctx = await getTenantContext({ host: 'acme.ph-aros.com', slug: 'acme' });

    expect(ctx).toBe(DEFAULT_TENANT);
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('DEFAULT_TENANT is the frozen single-user identity (dbName "" ⇒ default connection)', () => {
    expect(Object.isFrozen(DEFAULT_TENANT)).toBe(true);
    expect(DEFAULT_TENANT).toEqual({
      tenantId: null,
      slug: 'default',
      dbName: '',
      plan: 'dedicated', // self-hosted gets every feature
      status: 'active',
      isDefault: true,
      byoKey: false,
    });
  });
});

describe('getTenantContext — nothing to resolve', () => {
  it.each([undefined, null, '', '   '])(
    'host %j with no slug → null without connecting',
    async (host) => {
      const ctx = await getTenantContext({ host });

      expect(ctx).toBeNull();
      expect(connectDBMock).not.toHaveBeenCalled();
      expect(findOneMock).not.toHaveBeenCalled();
    }
  );

  it('a whitespace-only explicit slug does not count as a slug', async () => {
    const ctx = await getTenantContext({ slug: '   ' });

    expect(ctx).toBeNull();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('the apex host connects but queries nothing (customDomain === baseDomain)', async () => {
    // Documented as-is: the early return only fires when BOTH are empty, so the apex pays a
    // connect. Pinning it means a future short-circuit is a deliberate change, not a surprise.
    const ctx = await getTenantContext({ host: 'ph-aros.com' });

    expect(ctx).toBeNull();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).not.toHaveBeenCalled();
  });
});

describe('getTenantContext — slug resolution', () => {
  it('resolves a subdomain host to its tenant', async () => {
    registry = [doc()];

    const ctx = await getTenantContext({ host: 'acme.ph-aros.com' });

    expect(findOneMock).toHaveBeenCalledWith({ slug: 'acme' });
    expect(ctx?.slug).toBe('acme');
    expect(connectDBMock.mock.invocationCallOrder[0]).toBeLessThan(
      findOneMock.mock.invocationCallOrder[0]
    );
  });

  it('an explicit slug outranks the host slug (session claim wins over routing)', async () => {
    registry = [doc({ _id: 'tid2', slug: 'beta', dbName: 'pharos_beta' })];

    const ctx = await getTenantContext({ host: 'acme.ph-aros.com', slug: 'beta' });

    expect(findOneMock).toHaveBeenCalledWith({ slug: 'beta' });
    expect(ctx?.slug).toBe('beta');
  });

  it('the explicit slug is trimmed and lower-cased', async () => {
    registry = [doc()];

    const ctx = await getTenantContext({ slug: '  ACME \n' });

    expect(findOneMock).toHaveBeenCalledWith({ slug: 'acme' });
    expect(ctx?.slug).toBe('acme');
  });

  it('a blank explicit slug falls back to the host instead of blocking it', async () => {
    registry = [doc()];

    const ctx = await getTenantContext({ host: 'acme.ph-aros.com', slug: '  ' });

    expect(findOneMock).toHaveBeenCalledWith({ slug: 'acme' });
    expect(ctx?.slug).toBe('acme');
  });

  it('host casing and port are normalised before the lookup', async () => {
    registry = [doc()];

    const ctx = await getTenantContext({ host: 'ACME.Ph-Aros.com:3000' });

    expect(findOneMock).toHaveBeenCalledWith({ slug: 'acme' });
    expect(ctx?.slug).toBe('acme');
  });

  it('honours a SAAS_BASE_DOMAIN override (staging / localhost deploys)', async () => {
    process.env.SAAS_BASE_DOMAIN = 'staging.example.dev';
    registry = [doc()];

    const ctx = await getTenantContext({ host: 'acme.staging.example.dev' });

    expect(findOneMock).toHaveBeenCalledWith({ slug: 'acme' });
    expect(ctx?.slug).toBe('acme');
  });

  it.each(['www', 'app', 'api', 'admin', 'cdn'])(
    'the reserved label %s is never treated as a slug',
    async (label) => {
      registry = [doc({ slug: label })];

      const ctx = await getTenantContext({ host: `${label}.ph-aros.com` });

      expect(findOneMock).not.toHaveBeenCalledWith({ slug: label });
      expect(ctx).toBeNull();
    }
  );

  it('a nested subdomain is not a flat slug', async () => {
    registry = [doc({ slug: 'b' })];

    const ctx = await getTenantContext({ host: 'a.b.ph-aros.com' });

    expect(findOneMock).not.toHaveBeenCalledWith({ slug: 'b' });
    expect(ctx).toBeNull();
  });
});

describe('getTenantContext — custom-domain fallback', () => {
  it('resolves a dedicated tenant by its own domain when the host is off-base', async () => {
    registry = [doc({ customDomain: 'money.acme.io' })];

    const ctx = await getTenantContext({ host: 'money.acme.io' });

    expect(findOneMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith({ customDomain: 'money.acme.io' });
    expect(ctx?.slug).toBe('acme');
  });

  it('normalises the host (case, port, trailing dot) for the domain lookup too', async () => {
    registry = [doc({ customDomain: 'money.acme.io' })];

    const ctx = await getTenantContext({ host: 'Money.ACME.io:8443.' });

    expect(findOneMock).toHaveBeenCalledWith({ customDomain: 'money.acme.io' });
    expect(ctx).not.toBeNull();
  });

  it('falls through from a missed slug to the domain lookup (both are tried, in order)', async () => {
    registry = [doc({ slug: 'other', customDomain: 'acme.ph-aros.com' })];

    const ctx = await getTenantContext({ host: 'acme.ph-aros.com' });

    expect(findOneMock).toHaveBeenNthCalledWith(1, { slug: 'acme' });
    expect(findOneMock).toHaveBeenNthCalledWith(2, { customDomain: 'acme.ph-aros.com' });
    expect(ctx?.slug).toBe('other');
  });

  it('a slug hit short-circuits: the domain lookup never runs', async () => {
    registry = [doc()];

    await getTenantContext({ host: 'acme.ph-aros.com' });

    expect(findOneMock).toHaveBeenCalledTimes(1);
  });

  it('an explicit slug that misses still tries the host as a custom domain', async () => {
    registry = [doc({ customDomain: 'books.example.org' })];

    const ctx = await getTenantContext({ host: 'books.example.org', slug: 'ghost' });

    expect(findOneMock).toHaveBeenNthCalledWith(1, { slug: 'ghost' });
    expect(findOneMock).toHaveBeenNthCalledWith(2, { customDomain: 'books.example.org' });
    expect(ctx?.slug).toBe('acme');
  });

  it('an explicit slug with no host cannot fall through to a domain lookup', async () => {
    const ctx = await getTenantContext({ slug: 'ghost' });

    expect(findOneMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith({ slug: 'ghost' });
    expect(ctx).toBeNull();
  });

  it('the base domain itself is never matchable as a custom domain', async () => {
    // Guard against a tenant claiming the apex and hijacking the marketing site.
    registry = [doc({ customDomain: 'ph-aros.com' })];

    const ctx = await getTenantContext({ host: 'ph-aros.com' });

    expect(ctx).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('both lookups missing → null, not a throw', async () => {
    const ctx = await getTenantContext({ host: 'nobody.example.org' });

    expect(ctx).toBeNull();
  });
});

describe('getTenantContext — document → context mapping', () => {
  it('maps a full document onto the context shape', async () => {
    registry = [doc({ _id: 'tid9', plan: 'dedicated', status: 'trialing', aiByoKey: true })];

    const ctx = await getTenantContext({ slug: 'acme' });

    expect(ctx).toEqual({
      tenantId: 'tid9',
      slug: 'acme',
      dbName: 'pharos_acme',
      plan: 'dedicated',
      status: 'trialing',
      isDefault: false,
      byoKey: true,
    });
  });

  it('stringifies a non-string _id (ObjectId comes off Mongo as an object)', async () => {
    const oid = { toString: () => '507f1f77bcf86cd799439011' };
    registry = [doc({ _id: oid })];

    const ctx = await getTenantContext({ slug: 'acme' });

    expect(ctx?.tenantId).toBe('507f1f77bcf86cd799439011');
    expect(typeof ctx?.tenantId).toBe('string');
  });

  it.each([undefined, null])('a %j plan falls back to free (least privilege)', async (plan) => {
    registry = [doc({ plan })];

    const ctx = await getTenantContext({ slug: 'acme' });

    expect(ctx?.plan).toBe('free');
  });

  it.each([undefined, null])('a %j status falls back to trialing', async (status) => {
    registry = [doc({ status })];

    const ctx = await getTenantContext({ slug: 'acme' });

    expect(ctx?.status).toBe('trialing');
  });

  it('an empty-string plan/status is kept verbatim (only nullish falls back)', async () => {
    registry = [doc({ plan: '', status: '' })];

    const ctx = await getTenantContext({ slug: 'acme' });

    expect(ctx?.plan).toBe('');
    expect(ctx?.status).toBe('');
  });

  it.each([
    [true, true],
    [false, false],
    [undefined, false],
    ['yes', true],
    [0, false],
  ])('aiByoKey %j becomes byoKey %j (BYO-key drives AI metering)', async (stored, expected) => {
    registry = [doc({ aiByoKey: stored })];

    const ctx = await getTenantContext({ slug: 'acme' });

    expect(ctx?.byoKey).toBe(expected);
  });

  it('a resolved tenant is never flagged as the default one', async () => {
    registry = [doc({ slug: 'default' })];

    const ctx = await getTenantContext({ slug: 'default' });

    expect(ctx?.isDefault).toBe(false);
    expect(ctx).not.toBe(DEFAULT_TENANT);
  });
});

describe('getTenantContext — failures are not "no tenant"', () => {
  it('a connect failure propagates instead of resolving to null', async () => {
    connectDBMock.mockRejectedValue(new Error('mongo down'));

    await expect(getTenantContext({ slug: 'acme' })).rejects.toThrow('mongo down');
  });

  it('a query failure propagates instead of resolving to null', async () => {
    findOneMock.mockImplementation(() => ({
      lean: async () => {
        throw new Error('query boom');
      },
    }));

    await expect(getTenantContext({ host: 'acme.ph-aros.com' })).rejects.toThrow('query boom');
  });
});

describe('dbNameFor', () => {
  it('the default tenant always maps to the default connection', () => {
    expect(dbNameFor(DEFAULT_TENANT)).toBe('');
  });

  it('isDefault outranks a populated dbName (no accidental switch for self-hosted)', () => {
    const ctx = { ...DEFAULT_TENANT, dbName: 'pharos_someone' } as TenantContext;

    expect(dbNameFor(ctx)).toBe('');
  });

  it('a resolved tenant maps to its own database', async () => {
    registry = [doc()];

    const ctx = await getTenantContext({ slug: 'acme' });

    expect(dbNameFor(ctx as TenantContext)).toBe('pharos_acme');
  });
});

describe('scoped', () => {
  const tenantCtx: TenantContext = {
    tenantId: 'tid1',
    slug: 'acme',
    dbName: 'pharos_acme',
    plan: 'shared',
    status: 'active',
    isDefault: false,
  };

  it('adds the tenant filter for a real tenant, without mutating the caller filter', () => {
    const filter = { status: 'active' };

    const out = scoped(filter, tenantCtx);

    expect(out).toEqual({ status: 'active', tenant: 'tid1' });
    expect(filter).toEqual({ status: 'active' });
    expect(out).not.toBe(filter);
  });

  it('returns the filter untouched (by identity) for the default tenant', () => {
    const filter = { status: 'active' };

    expect(scoped(filter, DEFAULT_TENANT)).toBe(filter);
  });

  it('the context tenant overrides a tenant key already on the filter', () => {
    // A caller-supplied tenant must never be able to widen the scope past its own context.
    const out = scoped({ tenant: 'someone-else' }, tenantCtx);

    expect(out.tenant).toBe('tid1');
  });

  it('an empty filter still gets scoped', () => {
    expect(scoped({}, tenantCtx)).toEqual({ tenant: 'tid1' });
  });
});

describe('listActiveTenantContexts', () => {
  function wireFind(docs: Array<Record<string, unknown>>) {
    findMock.mockImplementation(() => ({ select: () => ({ lean: async () => docs }) }));
  }

  it.each([undefined, '', 'off', 'false', '0'])(
    'SAAS_MODE=%j returns [] with zero DB access (self-hosted has no registry to sweep)',
    async (mode) => {
      if (mode === undefined) delete process.env.SAAS_MODE;
      else process.env.SAAS_MODE = mode;
      wireFind([doc()]);

      const list = await listActiveTenantContexts();

      expect(list).toEqual([]);
      expect(connectDBMock).not.toHaveBeenCalled();
      expect(findMock).not.toHaveBeenCalled();
    }
  );

  it('queries only trialing/active tenants, connecting first', async () => {
    wireFind([]);

    await listActiveTenantContexts();

    expect(findMock).toHaveBeenCalledWith({ status: { $in: ['trialing', 'active'] } });
    expect(connectDBMock.mock.invocationCallOrder[0]).toBeLessThan(findMock.mock.invocationCallOrder[0]);
  });

  it('maps every returned doc onto a non-default TenantContext ready for withTenant', async () => {
    wireFind([
      doc({ _id: 'tid1', slug: 'acme', dbName: 'pharos_acme', plan: 'shared', status: 'active', aiByoKey: true }),
      doc({ _id: 'tid2', slug: 'globex', dbName: 'pharos_globex', plan: 'free', status: 'trialing', aiByoKey: false }),
    ]);

    const list = await listActiveTenantContexts();

    expect(list).toEqual([
      { tenantId: 'tid1', slug: 'acme', dbName: 'pharos_acme', plan: 'shared', status: 'active', isDefault: false, byoKey: true },
      { tenantId: 'tid2', slug: 'globex', dbName: 'pharos_globex', plan: 'free', status: 'trialing', isDefault: false, byoKey: false },
    ]);
    expect(list.every((c) => c.isDefault === false)).toBe(true);
  });

  it('an empty registry is a clean empty list, not a throw', async () => {
    wireFind([]);
    await expect(listActiveTenantContexts()).resolves.toEqual([]);
  });
});

describe('host helpers are re-exported unchanged', () => {
  it('exposes the real parser/normaliser/base so node callers need one import', () => {
    expect(baseDomain()).toBe('ph-aros.com');
    expect(parseTenantSlug('acme.ph-aros.com')).toBe('acme');
    expect(parseTenantSlug('www.ph-aros.com')).toBeNull();
    expect(normalizeHost('ACME.example.org:443')).toBe('acme.example.org');
  });
});
