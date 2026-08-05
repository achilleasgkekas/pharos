import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The bridge between the two identity systems. Without it, a signed-in hosted customer looked
// like nobody: every gate redirected to /login, /login saw zero self-hosted User documents and
// redirected to /setup, and the customer was handed "create your admin account" inside their own
// workspace. navRole is the pure half; saasSessionUser is the impure orchestration around it.
//
// saasSessionUser's retry+logging behavior (added alongside the SiteNav "top nav disappears on
// refresh/back" bug report): `resolveRequestTenant` (lib/tenancy/request.ts) resolves the SAME
// tenant independently, via its OWN cache()-wrapped call to accountTenants() — so a one-off
// blip (cold container after a redeploy, one slow query) can hit ONE of the two calls and not
// the other, in the same request: the page's own data fetch succeeds while this one silently
// swallowed the error and returned null, which is why the navbar (gated on this) disappeared
// even though the page content rendered fine. The fix: retry once before failing closed, and
// log the error either way so a recurrence is diagnosable from server logs.

const headersGet = vi.fn<(k: string) => string | null>();
vi.mock('next/headers', () => ({
  headers: async () => ({ get: headersGet }),
}));

const saasModeMock = vi.fn<() => boolean>();
vi.mock('./saasMode', () => ({ saasMode: () => saasModeMock() }));

const getCurrentAccountMock = vi.fn<() => Promise<{ sub: string; email: string } | null>>();
vi.mock('./accountSession', () => ({ getCurrentAccount: () => getCurrentAccountMock() }));

const accountTenantsMock = vi.fn<
  (accountId: string) => Promise<Array<{ tenantId: string; slug: string; name: string; role: string; plan: string; status: string }>>
>();
vi.mock('./saasApi', () => ({ accountTenants: (id: string) => accountTenantsMock(id) }));

import { navRole, saasSessionUser } from './saasIdentity';

describe('navRole', () => {
  it('maps owner and admin to admin', () => {
    expect(navRole('owner')).toBe('admin');
    expect(navRole('admin')).toBe('admin');
  });

  it('maps member to member', () => {
    expect(navRole('member')).toBe('member');
  });

  it.each([undefined, '', 'nonsense', 'OWNER ', 'root', 'superuser'])(
    'falls back to viewer (least privilege) for %s',
    (r) => {
      // This value now gates requireAdmin, so an unrecognised string must NEVER open a door.
      // 'OWNER ' with a trailing space is the realistic version: it comes from stored data.
      expect(navRole(r as string | undefined)).toBe('viewer');
    },
  );

  it('is case-insensitive for the values it does recognise', () => {
    expect(navRole('Owner')).toBe('admin');
    expect(navRole('MEMBER')).toBe('member');
  });
});

describe('saasSessionUser', () => {
  const ACCOUNT = { sub: 'acc1', email: 'ach@example.com' };
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    saasModeMock.mockReset();
    getCurrentAccountMock.mockReset();
    accountTenantsMock.mockReset();
    headersGet.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('SAAS_MODE off → null, no account/DB work at all', async () => {
    saasModeMock.mockReturnValue(false);
    const res = await saasSessionUser();
    expect(res).toBeNull();
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
  });

  it('no signed-in account → null', async () => {
    saasModeMock.mockReturnValue(true);
    getCurrentAccountMock.mockResolvedValue(null);
    const res = await saasSessionUser();
    expect(res).toBeNull();
    expect(accountTenantsMock).not.toHaveBeenCalled();
  });

  it('no workspace in the host (account area) → viewer, no tenant lookup', async () => {
    saasModeMock.mockReturnValue(true);
    getCurrentAccountMock.mockResolvedValue(ACCOUNT);
    headersGet.mockReturnValue(null); // no x-tenant-host / x-forwarded-host / host
    const res = await saasSessionUser();
    expect(res).toEqual({ id: 'acc1', role: 'viewer', name: 'ach@example.com' });
    expect(accountTenantsMock).not.toHaveBeenCalled();
  });

  it('workspace host + active membership → maps org role to nav role', async () => {
    saasModeMock.mockReturnValue(true);
    getCurrentAccountMock.mockResolvedValue(ACCOUNT);
    headersGet.mockImplementation((k) => (k === 'x-tenant-host' ? 'acme.ph-aros.com' : null));
    accountTenantsMock.mockResolvedValue([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'shared', status: 'active' },
    ]);
    const res = await saasSessionUser();
    expect(res).toEqual({ id: 'acc1', role: 'admin', name: 'ach@example.com' });
    expect(accountTenantsMock).toHaveBeenCalledTimes(1);
  });

  it('workspace host, account has no membership there → null (not promoted, not an error)', async () => {
    saasModeMock.mockReturnValue(true);
    getCurrentAccountMock.mockResolvedValue(ACCOUNT);
    headersGet.mockImplementation((k) => (k === 'x-tenant-host' ? 'other.ph-aros.com' : null));
    accountTenantsMock.mockResolvedValue([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'shared', status: 'active' },
    ]);
    const res = await saasSessionUser();
    expect(res).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled(); // not a failure, no log
  });

  it('accountTenants throws ONCE then succeeds → the retry absorbs it, no failure logged', async () => {
    saasModeMock.mockReturnValue(true);
    getCurrentAccountMock.mockResolvedValue(ACCOUNT);
    headersGet.mockImplementation((k) => (k === 'x-tenant-host' ? 'acme.ph-aros.com' : null));
    accountTenantsMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce([{ tenantId: 't1', slug: 'acme', name: 'Acme', role: 'member', plan: 'shared', status: 'active' }]);

    const res = await saasSessionUser();
    expect(res).toEqual({ id: 'acc1', role: 'member', name: 'ach@example.com' });
    expect(accountTenantsMock).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('accountTenants throws twice → fails closed (null) and logs once, with account/slug context', async () => {
    saasModeMock.mockReturnValue(true);
    getCurrentAccountMock.mockResolvedValue(ACCOUNT);
    headersGet.mockImplementation((k) => (k === 'x-tenant-host' ? 'acme.ph-aros.com' : null));
    accountTenantsMock.mockRejectedValue(new Error('Mongo timeout'));

    const res = await saasSessionUser();
    expect(res).toBeNull();
    expect(accountTenantsMock).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [msg, meta] = consoleErrorSpy.mock.calls[0];
    expect(msg).toContain('saasSessionUser');
    expect(meta).toMatchObject({ accountId: 'acc1', slug: 'acme', error: 'Mongo timeout' });
  });
});
