import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/login/actions.ts backs the browser login FORM (distinct from the
// api/v1/auth/login route, which mints a bearer token for API clients and has its own dedicated test).
// This one sets an httpOnly session cookie via setSessionCookie and never touches
// apiToken/rate-limiting. Behaviour pinned:
//  - loginAction fails closed with a specific message when AUTH_SECRET isn't configured
//    (authConfigured() false), BEFORE reading formData or touching the DB.
//  - username is trimmed + lowercased, password is read as-is; either missing → a generic
//    "Enter your username and password." error, no DB read.
//  - unknown user OR verifyPassword() false → the SAME generic "Wrong username or password."
//    message (no user-enumeration signal), verifyPassword only reached when a user was found.
//  - on success, setSessionCookie is called with { sub: user._id (stringified), role: 'admin'
//    only when the stored role is literally 'admin' (else 'member'), name: user.name falling
//    back to user.username when blank }.
// hashPassword/verifyPassword (lib/auth.ts) run FOR REAL — both are pure/deterministic and
// already fully pinned in lib/auth.test.ts, so the "success" test proves a real stored hash
// round-trips through the real verifyPassword instead of trusting a hand-rolled stand-in.
// setSessionCookie/clearSessionCookie (the actual next/headers cookie side-effect) are mocked,
// as is next/navigation's redirect (logoutAction calls it after clearing the cookie).

const { connectDBMock, userFindOne, userState, setSessionCookieMock, clearSessionCookieMock, redirectMock, authConfiguredMock } =
  vi.hoisted(() => {
    const userState: { doc: Record<string, unknown> | null } = { doc: null };
    const userFindOne = vi.fn((_q?: unknown) => ({ lean: async () => userState.doc }));
    return {
      connectDBMock: vi.fn(async () => {}),
      userFindOne,
      userState,
      setSessionCookieMock: vi.fn(async (_claims: Record<string, unknown>) => {}),
      clearSessionCookieMock: vi.fn(async () => {}),
      redirectMock: vi.fn((_url: string) => {
        throw new Error('NEXT_REDIRECT');
      }),
      authConfiguredMock: vi.fn(() => true),
    };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/lib/session', () => ({ authConfigured: authConfiguredMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, setSessionCookie: setSessionCookieMock, clearSessionCookie: clearSessionCookieMock };
});

import { loginAction, logoutAction } from './actions';
import { hashPassword } from '@/lib/auth';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** A real scrypt hash so verifyPassword (the real implementation) actually round-trips. */
const REAL_HASH = hashPassword('hunter2');

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  authConfiguredMock.mockImplementation(() => true);
  userState.doc = { _id: 'user1', username: 'ach', name: 'Achilleas', role: 'admin', passwordHash: REAL_HASH };
  userFindOne.mockImplementation((_q?: unknown) => ({ lean: async () => userState.doc }));
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
});

describe('logoutAction', () => {
  it('clears the session cookie then redirects to /login', async () => {
    await expect(logoutAction()).rejects.toThrow('NEXT_REDIRECT');
    expect(clearSessionCookieMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });
});
