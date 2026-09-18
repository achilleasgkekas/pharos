import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/auth/login is the entry point of the entire SaaS account-auth surface — the
// first place a wrong build could either leak "does this email exist" (account enumeration) or
// hand out a session without a verified password. Zero route-level coverage before this file
// (grep of api/saas/**/*.test.ts: only billing/*, invites/accept, admin/tenants/[slug],
// workspace/{erasure,route}). This closes that gap for what the route itself is responsible
// for (verifyPassword/hashPassword already have their own unit coverage elsewhere and are
// mocked here for determinism, not re-tested):
//   - rateLimit is checked BEFORE saasAuthGate (so a limited request never reaches the gate/DB,
//     as coded — this test documents that ordering, not a preference about it),
//   - the saasAuthGate short-circuit passes through untouched,
//   - missing email/password → 400, zero DB touch,
//   - email is lowercased + trimmed before the lookup,
//   - unknown account and wrong password return the IDENTICAL 401 body (no enumeration) —
//     and an unknown account never even calls verifyPassword (the `||` short-circuits),
//   - mfaEnabled=false: stamps lastLoginAt, saves, sets the real account cookie, returns
//     account+tenants, never touches the MFA-pending cookie,
//   - mfaEnabled=true: does NOT stamp lastLoginAt/save/set the account cookie, sets the
//     MFA-pending cookie instead, returns only `{ mfaRequired: true }`,
//   - a mid-handler throw (e.g. account.save() rejecting) becomes a clean 500 JSON, not a
//     crash — same saasGuard idiom as every other SaaS route.

const {
  rateLimitMock,
  clientIpMock,
  saasAuthGateMock,
  connectDBMock,
  accountFindOne,
  accountFindOneSelect,
  verifyPasswordMock,
  accountTenantsMock,
  setAccountCookieMock,
  setMfaPendingCookieMock,
} = vi.hoisted(() => {
  const accountFindOneSelect = vi.fn(async () => null as Record<string, unknown> | null);
  return {
    rateLimitMock: vi.fn(() => null as NextResponse | null),
    clientIpMock: vi.fn(() => '203.0.113.9'),
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindOne: vi.fn(() => ({ select: accountFindOneSelect })),
    accountFindOneSelect,
    verifyPasswordMock: vi.fn(() => false),
    accountTenantsMock: vi.fn(async () => [] as unknown[]),
    setAccountCookieMock: vi.fn(async () => {}),
    setMfaPendingCookieMock: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/apiAuth', () => ({ rateLimit: rateLimitMock, clientIp: clientIpMock }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findOne: accountFindOne } }));
vi.mock('@/lib/auth', () => ({ verifyPassword: verifyPasswordMock, assertCanWrite: vi.fn(async () => {}) }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) — run it for real so
  // the mid-handler-throw test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});
vi.mock('@/lib/tenancy/accountSession', () => ({
  setAccountCookie: setAccountCookieMock,
  setMfaPendingCookie: setMfaPendingCookieMock,
}));

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** A fake mongoose document: has the fields the route reads plus a spyable `.save()`. */
function makeAccount(over: Record<string, unknown> = {}) {
  return {
    _id: 'acc1',
    name: 'Jo',
    email: 'jo@example.com',
    passwordHash: 'scrypt$hash',
    mfaEnabled: false,
    lastLoginAt: null,
    save: vi.fn(async function (this: Record<string, unknown>) {
      return this;
    }),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue(null);
  clientIpMock.mockReturnValue('203.0.113.9');
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  accountFindOneSelect.mockImplementation(async () => null);
  verifyPasswordMock.mockImplementation(() => false);
  accountTenantsMock.mockImplementation(async () => []);
  setAccountCookieMock.mockImplementation(async () => {});
  setMfaPendingCookieMock.mockImplementation(async () => {});
});

describe('rate limit + gate + validation', () => {
  it('rate-limited → returns the 429 as-is, never reaches saasAuthGate or the DB', async () => {
    const limited = NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    rateLimitMock.mockReturnValue(limited);

    const res = await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));

    expect(res).toBe(limited);
    expect(saasAuthGateMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('keys the rate limit by client IP', async () => {
    clientIpMock.mockReturnValue('198.51.100.4');
    await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));
    expect(rateLimitMock).toHaveBeenCalledWith('saas-login:198.51.100.4');
  });

  it('saasAuthGate short-circuit (SAAS_MODE off / AUTH_SECRET missing) passes through untouched, zero DB', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));

    expect(res).toBe(blocked);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('missing email → 400, never touches the DB', async () => {
    const res = await POST(makeReq({ password: 'secret123' }));
    expect(res.status).toBe(400);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('missing password → 400, never touches the DB', async () => {
    const res = await POST(makeReq({ email: 'jo@example.com' }));
    expect(res.status).toBe(400);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('lowercases + trims the email before the account lookup', async () => {
    accountFindOneSelect.mockResolvedValueOnce(null);
    await POST(makeReq({ email: '  Jo@Example.com  ', password: 'secret123' }));
    expect(accountFindOne).toHaveBeenCalledWith({ email: 'jo@example.com' });
  });
});

describe('no account enumeration', () => {
  it('unknown account → 401 "Invalid credentials", verifyPassword never called', async () => {
    accountFindOneSelect.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ email: 'ghost@example.com', password: 'whatever' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid credentials');
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it('known account + wrong password → the SAME 401 "Invalid credentials"', async () => {
    accountFindOneSelect.mockResolvedValueOnce(makeAccount());
    verifyPasswordMock.mockReturnValueOnce(false);

    const res = await POST(makeReq({ email: 'jo@example.com', password: 'wrong' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid credentials');
    expect(verifyPasswordMock).toHaveBeenCalledWith('wrong', 'scrypt$hash');
  });
});

describe('mfaEnabled = false — direct login', () => {
  it('correct password: stamps lastLoginAt, saves, sets the account cookie, returns account+tenants', async () => {
    const account = makeAccount();
    accountFindOneSelect.mockResolvedValueOnce(account);
    verifyPasswordMock.mockReturnValueOnce(true);
    accountTenantsMock.mockResolvedValueOnce([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);

    const res = await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));

    expect(account.save).toHaveBeenCalledTimes(1);
    expect(account.lastLoginAt).toBeInstanceOf(Date);
    expect(setAccountCookieMock).toHaveBeenCalledWith({ sub: 'acc1', epoch: 0, email: 'jo@example.com' });
    expect(setMfaPendingCookieMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { account: unknown; tenants: unknown };
    expect(json.account).toEqual({ id: 'acc1', email: 'jo@example.com', name: 'Jo' });
    expect(json.tenants).toEqual([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);
  });

  it('falls back to an empty name when the account has none', async () => {
    accountFindOneSelect.mockResolvedValueOnce(makeAccount({ name: '' }));
    verifyPasswordMock.mockReturnValueOnce(true);

    const res = await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));

    const json = (await res.json()) as { account: { name: string } };
    expect(json.account.name).toBe('');
  });
});

describe('mfaEnabled = true — pending second factor', () => {
  it('correct password: does NOT stamp lastLoginAt/save/set the account cookie; sets the MFA-pending cookie and returns only mfaRequired', async () => {
    const account = makeAccount({ mfaEnabled: true });
    accountFindOneSelect.mockResolvedValueOnce(account);
    verifyPasswordMock.mockReturnValueOnce(true);

    const res = await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));

    expect(account.save).not.toHaveBeenCalled();
    expect(account.lastLoginAt).toBeNull();
    expect(setMfaPendingCookieMock).toHaveBeenCalledWith('acc1');
    expect(setAccountCookieMock).not.toHaveBeenCalled();
    expect(accountTenantsMock).not.toHaveBeenCalled();
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ mfaRequired: true });
  });
});

describe('error handling', () => {
  it('a mid-handler throw (account.save rejects) becomes a clean 500 JSON, not a crash', async () => {
    const account = makeAccount();
    account.save.mockRejectedValueOnce(new Error('mongo blip'));
    accountFindOneSelect.mockResolvedValueOnce(account);
    verifyPasswordMock.mockReturnValueOnce(true);

    const res = await POST(makeReq({ email: 'jo@example.com', password: 'secret123' }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});
