import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST/DELETE /api/saas/auth/mfa is login step 2, the second factor gate that only makes sense
// once /auth/login has already verified the password and parked the account behind the signed
// MFA-pending cookie. Zero route-level coverage before this file. Covers what the route itself
// is responsible for (verifyMfaLogin/TOTP/recovery-code matching already have their own unit
// coverage in mfaStore and are mocked here for determinism, not re-tested):
//   - saasAuthGate is checked BEFORE the pending-cookie read (as coded, not a preference),
//   - no pending cookie → 401 "no_pending_login", zero rateLimit/DB touch,
//   - the rate limit is keyed per ACCOUNT id (not IP — the pending cookie already narrows the
//     guess target to one account) and is checked AFTER the pending-cookie read but BEFORE the
//     body is parsed,
//   - missing/blank code → 400, zero DB touch,
//   - every verifyMfaLogin failure reason (not_found/not_enabled/invalid_code/
//     crypto_unavailable) maps to a 401 with that reason as the error body — the route
//     hardcodes 401 regardless of reason, this documents that as-coded behaviour,
//   - the account disappearing between verifyMfaLogin succeeding and the Account.findById
//     re-read → 401 "not_found", and does NOT clear the pending cookie or set the real one,
//   - success (TOTP): stamps lastLoginAt, saves, clears the pending cookie, sets the real
//     account cookie, returns account+tenants+usedRecoveryCode:false,
//   - success (recovery code): same but usedRecoveryCode:true,
//   - a mid-handler throw becomes a clean 500 JSON via the real saasGuard,
//   - DELETE: gate short-circuit passes through untouched before the cookie is cleared, and the
//     normal path always clears the pending cookie and returns {ok:true}.

const {
  saasAuthGateMock,
  connectDBMock,
  accountFindById,
  accountFindByIdSelect,
  verifyMfaLoginMock,
  accountTenantsMock,
  getMfaPendingAccountIdMock,
  clearMfaPendingCookieMock,
  setAccountCookieMock,
  rateLimitMock,
} = vi.hoisted(() => {
  const accountFindByIdSelect = vi.fn(async () => null as Record<string, unknown> | null);
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindById: vi.fn(() => ({ select: accountFindByIdSelect })),
    accountFindByIdSelect,
    verifyMfaLoginMock: vi.fn(async () => ({ ok: false, reason: 'not_found' }) as
      | { ok: true; usedRecoveryCode: boolean }
      | { ok: false; reason: string }),
    accountTenantsMock: vi.fn(async () => [] as unknown[]),
    getMfaPendingAccountIdMock: vi.fn(async () => null as string | null),
    clearMfaPendingCookieMock: vi.fn(async () => {}),
    setAccountCookieMock: vi.fn(async () => {}),
    rateLimitMock: vi.fn(() => null as NextResponse | null),
  };
});

vi.mock('@/lib/apiAuth', () => ({ rateLimit: rateLimitMock }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findById: accountFindById } }));
vi.mock('@/lib/tenancy/mfaStore', () => ({ verifyMfaLogin: verifyMfaLoginMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) — run it for real so
  // the mid-handler-throw test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});
vi.mock('@/lib/tenancy/accountSession', () => ({
  getMfaPendingAccountId: getMfaPendingAccountIdMock,
  clearMfaPendingCookie: clearMfaPendingCookieMock,
  setAccountCookie: setAccountCookieMock,
}));

import { POST, DELETE } from './route';

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** A fake mongoose document: has the fields the route reads plus a spyable `.save()`. */
function makeAccount(over: Record<string, unknown> = {}) {
  return {
    _id: 'acc1',
    name: 'Jo',
    email: 'jo@example.com',
    lastLoginAt: null,
    save: vi.fn(async function (this: Record<string, unknown>) {
      return this;
    }),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  accountFindByIdSelect.mockImplementation(async () => null);
  verifyMfaLoginMock.mockImplementation(async () => ({ ok: false, reason: 'not_found' }));
  accountTenantsMock.mockImplementation(async () => []);
  getMfaPendingAccountIdMock.mockImplementation(async () => 'acc1');
  clearMfaPendingCookieMock.mockImplementation(async () => {});
  setAccountCookieMock.mockImplementation(async () => {});
  rateLimitMock.mockReturnValue(null);
});

describe('POST — gate + pending-cookie + rate limit', () => {
  it('saasAuthGate short-circuit passes through untouched, before the pending-cookie read', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await POST(makeReq({ code: '123456' }));

    expect(res).toBe(blocked);
    expect(getMfaPendingAccountIdMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('no pending cookie → 401 "no_pending_login", zero rate-limit/DB touch', async () => {
    getMfaPendingAccountIdMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('no_pending_login');
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('keys the rate limit by the pending account id, not IP', async () => {
    getMfaPendingAccountIdMock.mockResolvedValueOnce('acc-xyz');
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ _id: 'acc-xyz' }));
    verifyMfaLoginMock.mockResolvedValueOnce({ ok: true, usedRecoveryCode: false });

    await POST(makeReq({ code: '123456' }));

    expect(rateLimitMock).toHaveBeenCalledWith('saas-mfa:acc-xyz');
  });

  it('rate-limited → returns the 429 as-is, never reaches connectDB/verifyMfaLogin', async () => {
    const limited = NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    rateLimitMock.mockReturnValue(limited);

    const res = await POST(makeReq({ code: '123456' }));

    expect(res).toBe(limited);
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(verifyMfaLoginMock).not.toHaveBeenCalled();
  });

  it('missing code → 400, never touches the DB', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('code is required');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('blank code → 400, never touches the DB', async () => {
    const res = await POST(makeReq({ code: '   ' }));
    expect(res.status).toBe(400);
    expect(connectDBMock).not.toHaveBeenCalled();
  });
});

describe('POST — verifyMfaLogin failure reasons all map to 401', () => {
  it.each(['not_found', 'not_enabled', 'invalid_code', 'crypto_unavailable'] as const)(
    'reason=%s → 401 with that reason as the error body',
    async (reason) => {
      verifyMfaLoginMock.mockResolvedValueOnce({ ok: false, reason });

      const res = await POST(makeReq({ code: '000000' }));

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe(reason);
      expect(clearMfaPendingCookieMock).not.toHaveBeenCalled();
      expect(setAccountCookieMock).not.toHaveBeenCalled();
    }
  );
});

describe('POST — account disappears between verify and re-read', () => {
  it('verifyMfaLogin ok but Account.findById returns null → 401 "not_found", no cookies touched', async () => {
    verifyMfaLoginMock.mockResolvedValueOnce({ ok: true, usedRecoveryCode: false });
    accountFindByIdSelect.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_found');
    expect(clearMfaPendingCookieMock).not.toHaveBeenCalled();
    expect(setAccountCookieMock).not.toHaveBeenCalled();
  });
});

describe('POST — success', () => {
  it('TOTP success: stamps lastLoginAt, saves, clears pending cookie, sets real cookie, returns account+tenants', async () => {
    const account = makeAccount();
    verifyMfaLoginMock.mockResolvedValueOnce({ ok: true, usedRecoveryCode: false });
    accountFindByIdSelect.mockResolvedValueOnce(account);
    accountTenantsMock.mockResolvedValueOnce([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);

    const res = await POST(makeReq({ code: '123456' }));

    expect(account.save).toHaveBeenCalledTimes(1);
    expect(account.lastLoginAt).toBeInstanceOf(Date);
    expect(clearMfaPendingCookieMock).toHaveBeenCalledTimes(1);
    expect(setAccountCookieMock).toHaveBeenCalledWith({ sub: 'acc1', epoch: 0, email: 'jo@example.com' });
    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { account: unknown; tenants: unknown; usedRecoveryCode: boolean };
    expect(json.account).toEqual({ id: 'acc1', email: 'jo@example.com', name: 'Jo' });
    expect(json.tenants).toEqual([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);
    expect(json.usedRecoveryCode).toBe(false);
  });

  it('recovery-code success: usedRecoveryCode:true in the response', async () => {
    verifyMfaLoginMock.mockResolvedValueOnce({ ok: true, usedRecoveryCode: true });
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount());

    const res = await POST(makeReq({ code: 'recovery-code-1' }));

    const json = (await res.json()) as { usedRecoveryCode: boolean };
    expect(json.usedRecoveryCode).toBe(true);
  });

  it('falls back to an empty name when the account has none', async () => {
    verifyMfaLoginMock.mockResolvedValueOnce({ ok: true, usedRecoveryCode: false });
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ name: '' }));

    const res = await POST(makeReq({ code: '123456' }));

    const json = (await res.json()) as { account: { name: string } };
    expect(json.account.name).toBe('');
  });
});

describe('POST — error handling', () => {
  it('a mid-handler throw (account.save rejects) becomes a clean 500 JSON, not a crash', async () => {
    const account = makeAccount();
    account.save.mockRejectedValueOnce(new Error('mongo blip'));
    verifyMfaLoginMock.mockResolvedValueOnce({ ok: true, usedRecoveryCode: false });
    accountFindByIdSelect.mockResolvedValueOnce(account);

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});

describe('DELETE', () => {
  it('gate short-circuit passes through untouched, before the pending cookie is cleared', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await DELETE();

    expect(res).toBe(blocked);
    expect(clearMfaPendingCookieMock).not.toHaveBeenCalled();
  });

  it('normal path: clears the pending cookie, returns {ok:true}', async () => {
    const res = await DELETE();

    expect(clearMfaPendingCookieMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json).toEqual({ ok: true });
  });
});
