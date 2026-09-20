import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/account/password is the logged-in self-service password change: re-verify the
// current password, then store a fresh hash of the new one. Zero route-level coverage before
// this file. verifyPassword/hashPassword (scrypt) and passwordChangeError (policy) already have
// their own unit coverage elsewhere and are mocked here for determinism, not re-tested — this
// file is about what THIS route does with their results:
//   - saasAuthGate short-circuit passes through untouched, zero session/DB touch,
//   - no session cookie (getCurrentAccount → null) → 401 "Not authenticated", zero DB touch,
//   - missing/blank currentPassword or newPassword → 400, zero DB touch,
//   - passwordChangeError (too short / same-as-current) → 400 with that message, zero DB touch,
//   - a missing account row (dangling cookie) and a wrong current password both collapse to the
//     SAME 401 "Invalid credentials" (no information leak about which one failed),
//   - success: hashPassword is called with the NEW password (never the raw current one stored),
//     the doc's passwordHash is overwritten, .save() is called, response is {ok:true},
//   - a mid-handler throw (account.save rejecting) becomes a clean 500 JSON via the real
//     saasGuard.

const {
  saasAuthGateMock,
  connectDBMock,
  accountFindById,
  accountFindByIdSelect,
  getCurrentAccountMock,
  setAccountCookieMock,
  hashPasswordMock,
  verifyPasswordMock,
  passwordChangeErrorMock,
} = vi.hoisted(() => {
  const accountFindByIdSelect = vi.fn(async () => null as Record<string, unknown> | null);
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindById: vi.fn(() => ({ select: accountFindByIdSelect })),
    accountFindByIdSelect,
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    setAccountCookieMock: vi.fn(async (_claims: { sub: string; email: string; epoch?: number }) => {}),
    hashPasswordMock: vi.fn((plain: string) => `hashed:${plain}`),
    verifyPasswordMock: vi.fn(() => true),
    passwordChangeErrorMock: vi.fn(() => null as string | null),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findById: accountFindById } }));
vi.mock('@/lib/auth', () => ({ hashPassword: hashPasswordMock, verifyPassword: verifyPasswordMock, assertCanWrite: vi.fn(async () => {}) }));
vi.mock('@/lib/tenancy/accountProfile', () => ({ passwordChangeError: passwordChangeErrorMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({
  getCurrentAccount: getCurrentAccountMock,
  setAccountCookie: setAccountCookieMock,
}));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) — run it for real so
  // the mid-handler-throw test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** A fake mongoose document: has the field the route reads plus a spyable `.save()`. */
function makeAccount(over: Record<string, unknown> = {}) {
  return {
    _id: 'acc1',
    email: 'a@example.com',
    passwordHash: 'old-hash',
    sessionEpoch: 3,
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
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  hashPasswordMock.mockImplementation((plain: string) => `hashed:${plain}`);
  verifyPasswordMock.mockReturnValue(true);
  passwordChangeErrorMock.mockReturnValue(null);
  accountFindByIdSelect.mockResolvedValue(makeAccount());
});

describe('gate', () => {
  it('saasAuthGate short-circuit (SAAS_MODE off / AUTH_SECRET missing) passes through untouched, zero DB', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'new-pw-1' }));

    expect(res).toBe(blocked);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });
});

describe('not authenticated', () => {
  it('no session cookie (getCurrentAccount → null) → 401 "Not authenticated", zero DB touch', async () => {
    getCurrentAccountMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'new-pw-1' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Not authenticated');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindById).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it('missing currentPassword → 400, zero DB touch', async () => {
    const res = await POST(makeReq({ newPassword: 'new-pw-1' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('currentPassword and newPassword are required');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('missing newPassword → 400, zero DB touch', async () => {
    const res = await POST(makeReq({ currentPassword: 'old-pw-1' }));

    expect(res.status).toBe(400);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('policy rejection (passwordChangeError) → 400 with that message, zero DB touch', async () => {
    passwordChangeErrorMock.mockReturnValueOnce('Password must be at least 8 characters');

    const res = await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'short' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Password must be at least 8 characters');
    expect(passwordChangeErrorMock).toHaveBeenCalledWith('old-pw-1', 'short');
    expect(connectDBMock).not.toHaveBeenCalled();
  });
});

describe('credential checks', () => {
  it('dangling cookie (account row gone) → 401 "Invalid credentials"', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'new-pw-1' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid credentials');
  });

  it('wrong current password (verifyPassword false) → the SAME 401 "Invalid credentials"', async () => {
    verifyPasswordMock.mockReturnValueOnce(false);
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValueOnce(account);

    const res = await POST(makeReq({ currentPassword: 'wrong-pw', newPassword: 'new-pw-1' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid credentials');
    expect(verifyPasswordMock).toHaveBeenCalledWith('wrong-pw', 'old-hash');
    expect(account.save).not.toHaveBeenCalled();
  });
});

describe('success', () => {
  it('re-hashes the NEW password (never stores the raw current one) and saves', async () => {
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValueOnce(account);

    const res = await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'brand-new-pw' }));

    expect(accountFindById).toHaveBeenCalledWith('acc1');
    expect(hashPasswordMock).toHaveBeenCalledWith('brand-new-pw');
    expect(hashPasswordMock).not.toHaveBeenCalledWith('old-pw-1');
    expect(account.passwordHash).toBe('hashed:brand-new-pw');
    expect(account.save).toHaveBeenCalled();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json).toEqual({ ok: true });
  });
});

describe('errors', () => {
  it('a mid-handler throw (account.save rejecting) becomes a clean 500 JSON via saasGuard', async () => {
    const account = makeAccount({
      save: vi.fn(async () => {
        throw new Error('mongo blip');
      }),
    });
    accountFindByIdSelect.mockResolvedValueOnce(account);

    const res = await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'new-pw-1' }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});

// #182/#193 — a hosted session is only revocable if the password routes move the counter that
// `getCurrentAccount` compares against. Without the bump, a password change left every other
// device signed in, which is the opposite of what the person just asked for.
describe('session revocation', () => {
  it('bumps the account session epoch and re-mints THIS device\'s cookie with the new value', async () => {
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@example.com' });
    const account = makeAccount({ sessionEpoch: 3 });
    accountFindByIdSelect.mockResolvedValue(account);

    const res = await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'brand-new-pw' }));

    expect(res.status).toBe(200);
    expect(account.sessionEpoch).toBe(4);
    expect(account.save).toHaveBeenCalled();
    // The new cookie names the epoch that was just STORED — never a stale one, or the person who
    // changed their password would sign themselves out.
    expect(setAccountCookieMock).toHaveBeenCalledWith({ sub: 'acc1', email: 'a@example.com', epoch: 4 });
  });

  it('starts from 0 for an account that has never revoked anything', async () => {
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@example.com' });
    const account = makeAccount({ sessionEpoch: undefined });
    accountFindByIdSelect.mockResolvedValue(account);

    await POST(makeReq({ currentPassword: 'old-pw-1', newPassword: 'brand-new-pw' }));

    expect(account.sessionEpoch).toBe(1);
  });

  it('does not touch the epoch when the current password is wrong', async () => {
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc1', email: 'a@example.com' });
    const account = makeAccount({ sessionEpoch: 3 });
    accountFindByIdSelect.mockResolvedValue(account);
    verifyPasswordMock.mockReturnValueOnce(false);

    const res = await POST(makeReq({ currentPassword: 'wrong', newPassword: 'brand-new-pw' }));

    expect(res.status).toBe(401);
    expect(account.sessionEpoch).toBe(3);
    expect(setAccountCookieMock).not.toHaveBeenCalled();
  });
});
