import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// app/login/actions.ts backs the browser login FORM (distinct from the
// api/v1/auth/login route, which mints a bearer token for API clients and has its own dedicated test).
// This one sets an httpOnly session cookie via setSessionCookie and never touches
// apiToken. Behaviour pinned:
//  - loginAction fails closed with a specific message when AUTH_SECRET isn't configured
//    (authConfigured() false), BEFORE reading formData or touching the DB.
//  - username is trimmed + lowercased, password is read as-is; either missing → a generic
//    "Enter your username and password." error, no DB read.
//  - unknown user OR verifyPassword() false → the SAME generic "Wrong username or password."
//    message (no user-enumeration signal), verifyPassword only reached when a user was found.
//  - on success, setSessionCookie is called with { sub: user._id (stringified), role: 'admin'
//    only when the stored role is literally 'admin' (else 'member'), name: user.name falling
//    back to user.username when blank }.
//  - on success WITH mfaEnabled:true (P79), the real session is NOT set — a pending-MFA cookie
//    is set instead and the caller gets { ok: true, mfaRequired: true }.
//  - verifyMfaLoginAction reads the user id ONLY from the pending cookie (never a client-
//    supplied id), rate-limits per-user (shared config/store with /api/v1), and on success
//    clears the pending cookie + sets the real one with the same sub/role/name shape as
//    loginAction's own success path.
// hashPassword/verifyPassword (lib/auth.ts) run FOR REAL — both are pure/deterministic and
// already fully pinned in lib/auth.test.ts, so the "success" test proves a real stored hash
// round-trips through the real verifyPassword instead of trusting a hand-rolled stand-in.
// The actual MFA code verification (TOTP/recovery-code matching) is lib/userMfaStore.ts's job
// and is fully pinned in userMfaStore.test.ts — here it's mocked, so this file only proves the
// login-flow ORCHESTRATION around it (cookies, rate limit, session claims).

const {
  connectDBMock,
  userFindOne,
  userFindById,
  userState,
  setSessionCookieMock,
  clearSessionCookieMock,
  setMfaPendingCookieMock,
  clearMfaPendingCookieMock,
  getMfaPendingUserIdMock,
  verifyUserMfaLoginMock,
  redirectMock,
  authConfiguredMock,
} = vi.hoisted(() => {
  const userState: { doc: Record<string, unknown> | null } = { doc: null };
  const userFindOne = vi.fn((_q?: unknown) => ({ lean: async () => userState.doc }));
  const userFindById = vi.fn((_id?: unknown) => ({ select: () => ({ lean: async () => userState.doc }) }));
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userFindById,
    userState,
    setSessionCookieMock: vi.fn(async (_claims: Record<string, unknown>) => {}),
    clearSessionCookieMock: vi.fn(async () => {}),
    setMfaPendingCookieMock: vi.fn(async (_userId: string) => {}),
    clearMfaPendingCookieMock: vi.fn(async () => {}),
    getMfaPendingUserIdMock: vi.fn(async (): Promise<string | null> => null),
    verifyUserMfaLoginMock: vi.fn(
      async (
        _userId: string,
        _code: string
      ): Promise<
        | { ok: true; usedRecoveryCode: boolean }
        | { ok: false; reason: 'invalid_code' | 'not_enabled' | 'crypto_unavailable' | 'not_found' }
      > => ({ ok: false, reason: 'invalid_code' })
    ),
    redirectMock: vi.fn((_url: string) => {
      throw new Error('NEXT_REDIRECT');
    }),
    authConfiguredMock: vi.fn(() => true),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne, findById: userFindById } }));
vi.mock('@/lib/session', () => ({ authConfigured: authConfiguredMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    setSessionCookie: setSessionCookieMock,
    clearSessionCookie: clearSessionCookieMock,
    setMfaPendingCookie: setMfaPendingCookieMock,
    clearMfaPendingCookie: clearMfaPendingCookieMock,
    getMfaPendingUserId: getMfaPendingUserIdMock,
  };
});
vi.mock('@/lib/userMfaStore', () => ({ verifyUserMfaLogin: verifyUserMfaLoginMock }));

import { loginAction, logoutAction, verifyMfaLoginAction, cancelMfaLoginAction } from './actions';
import { hashPassword } from '@/lib/auth';
import { rateStore } from '@/lib/apiRateLimit';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** A real scrypt hash so verifyPassword (the real implementation) actually round-trips. */
const REAL_HASH = hashPassword('hunter2');

let savedRateLimit: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  authConfiguredMock.mockImplementation(() => true);
  userState.doc = { _id: 'user1', username: 'ach', name: 'Achilleas', role: 'admin', passwordHash: REAL_HASH };
  userFindOne.mockImplementation((_q?: unknown) => ({ lean: async () => userState.doc }));
  userFindById.mockImplementation((_id?: unknown) => ({ select: () => ({ lean: async () => userState.doc }) }));
  getMfaPendingUserIdMock.mockResolvedValue(null);
  verifyUserMfaLoginMock.mockResolvedValue({ ok: false, reason: 'invalid_code' });
  savedRateLimit = process.env.API_RATE_LIMIT;
  delete process.env.API_RATE_LIMIT;
  rateStore.clear();
});

afterEach(() => {
  if (savedRateLimit === undefined) delete process.env.API_RATE_LIMIT;
  else process.env.API_RATE_LIMIT = savedRateLimit;
  rateStore.clear();
});

describe('loginAction', () => {
  it('fails closed when AUTH_SECRET is not configured, before reading formData/DB', async () => {
    authConfiguredMock.mockReturnValue(false);
    const res = await loginAction(formData({ username: 'ach', password: 'hunter2' }));
    expect(res).toEqual({ ok: false, error: 'Server is missing AUTH_SECRET. Set it in .env and restart.' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('missing username → generic error, no DB read', async () => {
    const res = await loginAction(formData({ password: 'hunter2' }));
    expect(res).toEqual({ ok: false, error: 'Enter your username and password.' });
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('missing password → generic error, no DB read', async () => {
    const res = await loginAction(formData({ username: 'ach' }));
    expect(res).toEqual({ ok: false, error: 'Enter your username and password.' });
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('whitespace-only username (trims to empty) → generic error, no DB read', async () => {
    const res = await loginAction(formData({ username: '   ', password: 'hunter2' }));
    expect(res).toEqual({ ok: false, error: 'Enter your username and password.' });
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('trims + lowercases the username before the lookup', async () => {
    await loginAction(formData({ username: '  ACH  ', password: 'hunter2' }));
    expect(userFindOne).toHaveBeenCalledWith({ username: 'ach' });
  });

  it('unknown user → "Wrong username or password.", verifyPassword never reached', async () => {
    userState.doc = null;
    const res = await loginAction(formData({ username: 'ghost', password: 'hunter2' }));
    expect(res).toEqual({ ok: false, error: 'Wrong username or password.' });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it('wrong password → the SAME generic message (no user-enumeration signal)', async () => {
    const res = await loginAction(formData({ username: 'ach', password: 'nope' }));
    expect(res).toEqual({ ok: false, error: 'Wrong username or password.' });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it('success → sets the session cookie with sub/role/name and returns ok:true', async () => {
    const res = await loginAction(formData({ username: 'ach', password: 'hunter2' }));
    expect(res).toEqual({ ok: true });
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user1', role: 'admin', name: 'Achilleas' });
  });

  it('a non-"admin" stored role is downgraded to "member" (never trusts arbitrary role strings)', async () => {
    userState.doc = { _id: 'user2', username: 'bob', name: 'Bob', role: 'superadmin', passwordHash: REAL_HASH };
    await loginAction(formData({ username: 'bob', password: 'hunter2' }));
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user2', role: 'member', name: 'Bob' });
  });

  it('falls back to username when the user has no display name', async () => {
    userState.doc = { _id: 'user3', username: 'noname', name: '', role: 'member', passwordHash: REAL_HASH };
    await loginAction(formData({ username: 'noname', password: 'hunter2' }));
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user3', role: 'member', name: 'noname' });
  });

  // P79
  it('correct password + mfaEnabled:true → does NOT set the real session, sets a pending cookie instead', async () => {
    userState.doc = { _id: 'user1', username: 'ach', name: 'Achilleas', role: 'admin', passwordHash: REAL_HASH, mfaEnabled: true };
    const res = await loginAction(formData({ username: 'ach', password: 'hunter2' }));
    expect(res).toEqual({ ok: true, mfaRequired: true });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
    expect(setMfaPendingCookieMock).toHaveBeenCalledWith('user1');
  });

  it('mfaEnabled:false (the default/undefined case) behaves exactly like today — no pending cookie', async () => {
    await loginAction(formData({ username: 'ach', password: 'hunter2' }));
    expect(setMfaPendingCookieMock).not.toHaveBeenCalled();
    expect(setSessionCookieMock).toHaveBeenCalled();
  });

  it('a wrong password on an MFA-enabled account still gets the SAME generic error, before any MFA branch', async () => {
    userState.doc = { _id: 'user1', username: 'ach', name: 'Achilleas', role: 'admin', passwordHash: REAL_HASH, mfaEnabled: true };
    const res = await loginAction(formData({ username: 'ach', password: 'nope' }));
    expect(res).toEqual({ ok: false, error: 'Wrong username or password.' });
    expect(setMfaPendingCookieMock).not.toHaveBeenCalled();
  });
});

describe('logoutAction', () => {
  it('clears the session cookie then redirects to /login', async () => {
    await expect(logoutAction()).rejects.toThrow('NEXT_REDIRECT');
    expect(clearSessionCookieMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });
});

describe('verifyMfaLoginAction', () => {
  it('no pending cookie → "session expired" error, never reaches the DB/rate-limit', async () => {
    getMfaPendingUserIdMock.mockResolvedValue(null);
    const res = await verifyMfaLoginAction('123456');
    expect(res).toEqual({ ok: false, error: 'Your sign-in session expired. Please log in again.' });
    expect(verifyUserMfaLoginMock).not.toHaveBeenCalled();
  });

  it('reads the user id ONLY from the pending cookie, never from the argument', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: true, usedRecoveryCode: false });
    await verifyMfaLoginAction('123456');
    expect(verifyUserMfaLoginMock).toHaveBeenCalledWith('user1', '123456');
  });

  it('rate-limited per user id once API_RATE_LIMIT is configured — blocks before touching verifyUserMfaLogin', async () => {
    process.env.API_RATE_LIMIT = '2';
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: false, reason: 'invalid_code' });
    await verifyMfaLoginAction('000000');
    await verifyMfaLoginAction('000000');
    verifyUserMfaLoginMock.mockClear();
    const res = await verifyMfaLoginAction('000000');
    expect(res).toEqual({ ok: false, error: 'Too many attempts — wait a bit and try again.' });
    expect(verifyUserMfaLoginMock).not.toHaveBeenCalled();
  });

  it('is NOT rate-limited by default (API_RATE_LIMIT unset), same as the rest of the app', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: false, reason: 'invalid_code' });
    for (let i = 0; i < 20; i++) await verifyMfaLoginAction('000000');
    expect(verifyUserMfaLoginMock).toHaveBeenCalledTimes(20);
  });

  it('wrong code → friendly "did not match" error, no cookie change', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: false, reason: 'invalid_code' });
    const res = await verifyMfaLoginAction('000000');
    expect(res).toEqual({ ok: false, error: 'That code did not match. Check the time on your device and try again.' });
    expect(clearMfaPendingCookieMock).not.toHaveBeenCalled();
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it('not_enabled reason (MFA turned off mid-flow) maps to its own message', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: false, reason: 'not_enabled' });
    const res = await verifyMfaLoginAction('000000');
    expect(res.error).toBe('Two-factor authentication is no longer required on this account — please log in again.');
  });

  it('crypto_unavailable reason maps to its own message', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: false, reason: 'crypto_unavailable' });
    const res = await verifyMfaLoginAction('000000');
    expect(res.error).toBe('Two-factor authentication is not available on this server right now.');
  });

  it('success → clears the pending cookie, sets the real session with sub/role/name, returns ok:true', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: true, usedRecoveryCode: false });
    const res = await verifyMfaLoginAction('123456');
    expect(res).toEqual({ ok: true });
    expect(clearMfaPendingCookieMock).toHaveBeenCalledTimes(1);
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user1', role: 'admin', name: 'Achilleas' });
  });

  it('success via a recovery code sets the same session shape (the caller does not need to know which factor was used)', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('user1');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: true, usedRecoveryCode: true });
    const res = await verifyMfaLoginAction('ABCD-EFGH');
    expect(res).toEqual({ ok: true });
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user1', role: 'admin', name: 'Achilleas' });
  });

  it('a non-"admin" stored role is still downgraded to "member" on the MFA success path (same rule as loginAction)', async () => {
    userState.doc = { _id: 'user2', username: 'bob', name: 'Bob', role: 'viewer', passwordHash: REAL_HASH };
    getMfaPendingUserIdMock.mockResolvedValue('user2');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: true, usedRecoveryCode: false });
    await verifyMfaLoginAction('123456');
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user2', role: 'member', name: 'Bob' });
  });

  it('the user vanished between password and code steps (deleted mid-flow) → clean error, no session set', async () => {
    getMfaPendingUserIdMock.mockResolvedValue('ghost');
    verifyUserMfaLoginMock.mockResolvedValue({ ok: true, usedRecoveryCode: false });
    userState.doc = null;
    const res = await verifyMfaLoginAction('123456');
    expect(res).toEqual({ ok: false, error: 'Account not found.' });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });
});

describe('cancelMfaLoginAction', () => {
  it('clears the pending cookie ("use a different account")', async () => {
    await cancelMfaLoginAction();
    expect(clearMfaPendingCookieMock).toHaveBeenCalledTimes(1);
  });
});
