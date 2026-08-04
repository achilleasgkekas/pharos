import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_TENANT, type TenantContext } from './context';

// request.ts establishes the request-scoped tenant for the DATA PLANE (feature server
// actions + pages). These tests lock the two contracts that matter most:
//   1. OSS PARITY: SAAS_MODE off → resolveRequestTenant returns DEFAULT_TENANT with ZERO
//      header/cookie/DB work, and withRequestTenant runs the body inside the default tenant
//      (currentTenant stays the default → metering off, default connection).
//   2. SAAS ROUTING: SAAS_MODE on → the host resolves the tenant, the authenticated account
//      must be an ACTIVE member, the tenant status is enforced; on success the body runs with
//      that tenant ambient (currentTenant() === the resolved ctx).
//
// Everything request.ts calls is mocked so the tests are DB-free and deterministic, matching
// the repo's unit-test style (node env, no live Mongo).

const headersGet = vi.fn<(k: string) => string | null>();
vi.mock('next/headers', () => ({
  headers: async () => ({ get: headersGet }),
}));

const saasModeMock = vi.fn<() => boolean>();
vi.mock('./saasMode', () => ({ saasMode: () => saasModeMock() }));

const getTenantContextMock = vi.fn<(input?: { host?: string | null; slug?: string | null }) => Promise<TenantContext | null>>();
vi.mock('./context', async (orig) => {
  const actual = await orig<typeof import('./context')>();
  return { ...actual, getTenantContext: (input?: { host?: string | null }) => getTenantContextMock(input) };
});

const getCurrentAccountMock = vi.fn<() => Promise<{ sub: string; email: string } | null>>();
vi.mock('./accountSession', () => ({ getCurrentAccount: () => getCurrentAccountMock() }));

const accountTenantsMock = vi.fn<(accountId: string) => Promise<Array<{ tenantId: string; slug: string; name: string; role: string; plan: string; status: string }>>>();
vi.mock('./saasApi', () => ({ accountTenants: (id: string) => accountTenantsMock(id) }));

// redirect()/notFound() throw Next control-flow signals in production; the mocks throw too, so
// the "never returns" contract of the gate is exercised rather than assumed.
const redirectMock = vi.fn<(to: string) => never>((to) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const notFoundMock = vi.fn<() => never>(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  redirect: (to: string) => redirectMock(to),
  notFound: () => notFoundMock(),
}));

import { resolveRequestTenant, withRequestTenant, TenantResolutionError } from './request';
import { currentTenant } from './current';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

function membership(over: Partial<{ tenantId: string; role: string; status: string }> = {}) {
  return [{ tenantId: acme.tenantId!, slug: 'acme', name: 'Acme', role: 'owner', plan: 'shared', status: 'active', ...over }];
}

beforeEach(() => {
  headersGet.mockReset();
  saasModeMock.mockReset();
  getTenantContextMock.mockReset();
  getCurrentAccountMock.mockReset();
  accountTenantsMock.mockReset();
  redirectMock.mockClear();
  notFoundMock.mockClear();
});

describe('resolveRequestTenant — OSS / self-hosted (SAAS_MODE off)', () => {
  it('returns the frozen DEFAULT_TENANT and does ZERO resolution work', async () => {
    saasModeMock.mockReturnValue(false);

    const ctx = await resolveRequestTenant();

    expect(ctx).toBe(DEFAULT_TENANT);
    // The whole point of OSS parity: no host read, no DB tenant lookup, no auth check.
    expect(headersGet).not.toHaveBeenCalled();
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
  });
});

describe('withRequestTenant — OSS / self-hosted', () => {
  it('runs the body with the default tenant ambient (metering off, default connection)', async () => {
    saasModeMock.mockReturnValue(false);

    const seen = await withRequestTenant(async () => currentTenant());

    expect(seen).toBe(DEFAULT_TENANT);
    expect(seen.isDefault).toBe(true);
    // After the body returns, the ambient context is back to the default with no leak.
    expect(currentTenant()).toBe(DEFAULT_TENANT);
  });

  it('passes the body return value straight through', async () => {
    saasModeMock.mockReturnValue(false);
    await expect(withRequestTenant(async () => 42)).resolves.toBe(42);
  });
});

describe('resolveRequestTenant — SaaS routing (SAAS_MODE on)', () => {
  it('resolves the tenant from the host and requires an active membership', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockImplementation((k) => (k === 'x-tenant-host' ? 'acme.ph-aros.com' : null));
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });
    accountTenantsMock.mockResolvedValue(membership());

    const ctx = await resolveRequestTenant();

    expect(ctx).toBe(acme);
    // The host — not a session claim — decides which tenant we look up.
    expect(getTenantContextMock).toHaveBeenCalledWith({ host: 'acme.ph-aros.com' });
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
  });

  it('runs the body with the resolved tenant ambient', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockReturnValue('acme.ph-aros.com');
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });
    accountTenantsMock.mockResolvedValue(membership());

    const slug = await withRequestTenant(async () => currentTenant().slug);

    expect(slug).toBe('acme');
    // No leak once the request body is done.
    expect(currentTenant()).toBe(DEFAULT_TENANT);
  });

  it('throws no_tenant when the host names no tenant', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockReturnValue('ph-aros.com');
    getTenantContextMock.mockResolvedValue(null);

    await expect(resolveRequestTenant()).rejects.toMatchObject({ code: 'no_tenant' });
    // Must not proceed to auth once there's no tenant.
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
  });

  it('rejects the implicit default tenant leaking through in SaaS mode', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockReturnValue('acme.ph-aros.com');
    getTenantContextMock.mockResolvedValue(DEFAULT_TENANT);

    await expect(resolveRequestTenant()).rejects.toBeInstanceOf(TenantResolutionError);
  });

  it('throws not_authenticated when there is no account session', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockReturnValue('acme.ph-aros.com');
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue(null);

    await expect(resolveRequestTenant()).rejects.toMatchObject({ code: 'not_authenticated' });
  });

  it('throws not_a_member when the account has no membership in the host tenant', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockReturnValue('acme.ph-aros.com');
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });
    accountTenantsMock.mockResolvedValue(membership({ tenantId: 'someOtherTenantId' }));

    await expect(resolveRequestTenant()).rejects.toMatchObject({ code: 'not_a_member' });
  });

  it('throws workspace_inactive when the tenant is suspended/canceled', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockReturnValue('acme.ph-aros.com');
    getTenantContextMock.mockResolvedValue({ ...acme, status: 'suspended' });
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });
    accountTenantsMock.mockResolvedValue(membership());

    await expect(resolveRequestTenant()).rejects.toMatchObject({ code: 'workspace_inactive' });
  });

  it('falls back to x-forwarded-host / host when x-tenant-host is absent', async () => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockImplementation((k) => (k === 'host' ? 'acme.ph-aros.com' : null));
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });
    accountTenantsMock.mockResolvedValue(membership());

    const ctx = await resolveRequestTenant();
    expect(ctx).toBe(acme);
    expect(getTenantContextMock).toHaveBeenCalledWith({ host: 'acme.ph-aros.com' });
  });
});

// ── withRequestTenant: no failure mode may reach the 500 error boundary ──────────────────────
//
// Every case below used to throw straight past the caller, so a logged-out visitor, a mistyped
// subdomain and a suspended customer all got the same "Something went wrong" page from a server
// that was working perfectly. These pin the replacement, including the one property that is a
// security property rather than a UX one (unknown workspace and not-a-member must be
// indistinguishable).
describe('withRequestTenant — failures become responses, never a 500', () => {
  const onTenantHost = (host = 'acme.ph-aros.com', path: string | null = '/receipts') => {
    saasModeMock.mockReturnValue(true);
    headersGet.mockImplementation((k) => (k === 'x-pathname' ? path : host));
  };
  const body = vi.fn(async () => 'ran');

  beforeEach(() => body.mockClear());

  it('logged out on a workspace host → login, carrying the path back', async () => {
    onTenantHost();
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue(null);

    await expect(withRequestTenant(body)).rejects.toThrow('NEXT_REDIRECT:/account/login?next=%2Freceipts');
    expect(redirectMock).toHaveBeenCalledWith('/account/login?next=%2Freceipts');
    expect(body).not.toHaveBeenCalled();
  });

  it('unknown workspace subdomain → 404, not a crash', async () => {
    onTenantHost('nosuch.ph-aros.com');
    getTenantContextMock.mockResolvedValue(null);

    await expect(withRequestTenant(body)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    // It must not go looking for a session first: there is no workspace to be a member of.
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
  });

  it('signed-in stranger on someone else’s workspace → the SAME 404 as a nonexistent one', async () => {
    onTenantHost();
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });
    accountTenantsMock.mockResolvedValue(membership({ tenantId: 'someOtherTenantId' }));

    await expect(withRequestTenant(body)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(redirectMock).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
  });

  it('signed in on the apex (no workspace in the host) → their workspace list', async () => {
    onTenantHost('ph-aros.com', '/items');
    getTenantContextMock.mockResolvedValue(null);
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });

    await expect(withRequestTenant(body)).rejects.toThrow('NEXT_REDIRECT:/account');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('logged out on the apex → login, not the workspace list', async () => {
    onTenantHost('ph-aros.com', '/items');
    getTenantContextMock.mockResolvedValue(null);
    getCurrentAccountMock.mockResolvedValue(null);

    await expect(withRequestTenant(body)).rejects.toThrow('NEXT_REDIRECT:/account/login?next=%2Fitems');
  });

  it('suspended workspace → the workspace page, flagged with the reason', async () => {
    onTenantHost();
    getTenantContextMock.mockResolvedValue({ ...acme, status: 'suspended' });
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@a.com' });
    accountTenantsMock.mockResolvedValue(membership());

    await expect(withRequestTenant(body)).rejects.toThrow('NEXT_REDIRECT:/account/workspace?blocked=suspended');
    expect(body).not.toHaveBeenCalled();
  });

  it('a genuine fault still reaches the error boundary — it is not dressed up as a redirect', async () => {
    // The gate must not turn a dead database into a login page: that would hide real outages
    // behind an infinite "sign in, get bounced, sign in" loop.
    onTenantHost();
    getTenantContextMock.mockRejectedValue(new Error('mongo down'));

    await expect(withRequestTenant(body)).rejects.toThrow('mongo down');
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('a missing x-pathname just drops the next param, it does not break the redirect', async () => {
    onTenantHost('acme.ph-aros.com', null);
    getTenantContextMock.mockResolvedValue(acme);
    getCurrentAccountMock.mockResolvedValue(null);

    await expect(withRequestTenant(body)).rejects.toThrow('NEXT_REDIRECT:/account/login');
  });

  it('SELF-HOSTED PARITY: with SAAS_MODE off nothing in the gate can fire', async () => {
    saasModeMock.mockReturnValue(false);

    await expect(withRequestTenant(body)).resolves.toBe('ran');
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(headersGet).not.toHaveBeenCalled();
  });
});
