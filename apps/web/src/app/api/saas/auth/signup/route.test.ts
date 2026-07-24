import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/auth/signup is the entry point that MINTS a new global Account + its first
// Tenant (owner Membership) — the one SaaS route where a bug either lets a duplicate email slip
// through (two Accounts, or a provisioned Tenant orphaned from a half-created Account) or hands
// out a session cookie before the account row is actually durable. Zero route-level coverage
// before this file. hashPassword/verifyPassword and provisionTenant/slugify already have their
// own unit coverage elsewhere and are mocked here for determinism, not re-tested — this file is
// about what THIS route does with their results (validation order, the 409 race-safety fallback
// on the unique index, the workspace-name fallback chain, and the response shape):
//   - saasAuthGate short-circuit passes through untouched, zero DB,
//   - invalid/missing email → 400, zero DB touch,
//   - short password (<8 chars) → 400, zero DB touch,
//   - a pre-existing email → 409 via the Account.exists() pre-check, Account.create never called,
//   - a race lost between the pre-check and the write (exists()=false, create() throws Mongo
//     duplicate-key 11000) → the SAME 409, not a 500,
//   - any other Account.create() failure propagates (clean 500 via saasGuard, not swallowed),
//   - workspace name fallback chain: explicit workspace > name > local-part of the email,
//   - on success: passwordHash comes from hashPassword (never the raw password), provisionTenant
//     is called with the new account id, the account cookie is set, and the 201 body is
//     { account, tenants } with tenants sourced from accountTenants(accountId).

const {
  saasAuthGateMock,
  connectDBMock,
  accountExistsMock,
  accountCreateMock,
  hashPasswordMock,
  provisionTenantMock,
  accountTenantsMock,
  setAccountCookieMock,
} = vi.hoisted(() => ({
  saasAuthGateMock: vi.fn(() => null as NextResponse | null),
  connectDBMock: vi.fn(async () => {}),
  accountExistsMock: vi.fn(async () => false as unknown),
  accountCreateMock: vi.fn(async (doc: Record<string, unknown>) => ({
    _id: 'acc1',
    name: doc.name,
    email: doc.email,
  })),
  hashPasswordMock: vi.fn((plain: string) => `hashed:${plain}`),
  provisionTenantMock: vi.fn(async () => ({
    tenantId: 't1',
    slug: 'acme',
    name: 'Acme',
    dbName: 'tenant_acme',
    plan: 'free',
    status: 'active',
  })),
  accountTenantsMock: vi.fn(async () => [] as unknown[]),
  setAccountCookieMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({
  Account: { exists: accountExistsMock, create: accountCreateMock },
}));
vi.mock('@/lib/auth', () => ({ hashPassword: hashPasswordMock }));
vi.mock('@/lib/tenancy/provision', () => ({ provisionTenant: provisionTenantMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) — run it for real so
  // the mid-handler-throw test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});
vi.mock('@/lib/tenancy/accountSession', () => ({ setAccountCookie: setAccountCookieMock }));

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  accountExistsMock.mockImplementation(async () => false);
  accountCreateMock.mockImplementation(async (doc: Record<string, unknown>) => ({
    _id: 'acc1',
    name: doc.name,
    email: doc.email,
  }));
  hashPasswordMock.mockImplementation((plain: string) => `hashed:${plain}`);
  provisionTenantMock.mockImplementation(async () => ({
    tenantId: 't1',
    slug: 'acme',
    name: 'Acme',
    dbName: 'tenant_acme',
    plan: 'free',
    status: 'active',
  }));
  accountTenantsMock.mockImplementation(async () => []);
  setAccountCookieMock.mockImplementation(async () => {});
});

const VALID = { email: 'jo@example.com', password: 'secret123', name: 'Jo' };

describe('gate + validation', () => {
  it('saasAuthGate short-circuit (SAAS_MODE off / AUTH_SECRET missing) passes through untouched, zero DB', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await POST(makeReq(VALID));

    expect(res).toBe(blocked);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('missing email → 400, never touches the DB', async () => {
    const res = await POST(makeReq({ password: 'secret123' }));
    expect(res.status).toBe(400);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('malformed email → 400, never touches the DB', async () => {
    const res = await POST(makeReq({ email: 'not-an-email', password: 'secret123' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/valid email/i);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('password shorter than 8 chars → 400, never touches the DB', async () => {
    const res = await POST(makeReq({ email: 'jo@example.com', password: 'short' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/8 characters/);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('missing password → 400 (empty string fails the length check), never touches the DB', async () => {
    const res = await POST(makeReq({ email: 'jo@example.com' }));
    expect(res.status).toBe(400);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('lowercases + trims the email before the uniqueness check and the create call', async () => {
    await POST(makeReq({ email: '  Jo@Example.com  ', password: 'secret123' }));
    expect(accountExistsMock).toHaveBeenCalledWith({ email: 'jo@example.com' });
    expect(accountCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jo@example.com' })
    );
  });
});

describe('duplicate email', () => {
  it('Account.exists() pre-check finds a match → 409, Account.create is never called', async () => {
    accountExistsMock.mockResolvedValueOnce(true);

    const res = await POST(makeReq(VALID));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/already exists/i);
    expect(accountCreateMock).not.toHaveBeenCalled();
    expect(provisionTenantMock).not.toHaveBeenCalled();
  });

  it('race lost after the pre-check: exists()=false but create() throws a Mongo 11000 → the SAME 409, not a 500', async () => {
    accountExistsMock.mockResolvedValueOnce(false);
    const dup = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    accountCreateMock.mockRejectedValueOnce(dup);

    const res = await POST(makeReq(VALID));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/already exists/i);
    expect(provisionTenantMock).not.toHaveBeenCalled();
    expect(setAccountCookieMock).not.toHaveBeenCalled();
  });

  it('a non-duplicate-key create() failure propagates as a clean 500, not swallowed as a 409', async () => {
    accountCreateMock.mockRejectedValueOnce(new Error('mongo blip'));

    const res = await POST(makeReq(VALID));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});

describe('workspace-name fallback chain', () => {
  it('explicit workspace field wins over name/email', async () => {
    await POST(makeReq({ ...VALID, workspace: 'My Company' }));
    expect(provisionTenantMock).toHaveBeenCalledWith({
      accountId: 'acc1',
      workspaceName: 'My Company',
    });
  });

  it('falls back to the account name when workspace is absent', async () => {
    await POST(makeReq({ email: 'jo@example.com', password: 'secret123', name: 'Jo Doe' }));
    expect(provisionTenantMock).toHaveBeenCalledWith({
      accountId: 'acc1',
      workspaceName: 'Jo Doe',
    });
  });

  it('falls back to the email local-part when both workspace and name are absent', async () => {
    await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));
    expect(provisionTenantMock).toHaveBeenCalledWith({
      accountId: 'acc1',
      workspaceName: 'jo',
    });
  });
});

describe('success path', () => {
  it('hashes the password (never stores the raw value), provisions a tenant, sets the account cookie, returns 201 { account, tenants }', async () => {
    accountTenantsMock.mockResolvedValueOnce([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);

    const res = await POST(makeReq(VALID));

    expect(hashPasswordMock).toHaveBeenCalledWith('secret123');
    expect(accountCreateMock).toHaveBeenCalledWith({
      email: 'jo@example.com',
      name: 'Jo',
      passwordHash: 'hashed:secret123',
    });
    expect(provisionTenantMock).toHaveBeenCalledWith({ accountId: 'acc1', workspaceName: 'Jo' });
    expect(setAccountCookieMock).toHaveBeenCalledWith({ sub: 'acc1', email: 'jo@example.com' });
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');

    expect(res.status).toBe(201);
    const json = (await res.json()) as { account: unknown; tenants: unknown };
    expect(json.account).toEqual({ id: 'acc1', email: 'jo@example.com', name: 'Jo' });
    expect(json.tenants).toEqual([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);
  });

  it('falls back to an empty name in the response when no name was given', async () => {
    const res = await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));
    const json = (await res.json()) as { account: { name: string } };
    expect(json.account.name).toBe('');
  });
});
