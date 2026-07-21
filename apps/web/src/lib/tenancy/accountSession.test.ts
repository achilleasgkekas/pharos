import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import {
  ACCOUNT_COOKIE,
  ACCOUNT_MAX_AGE,
  accountCookieOptions,
  accountAuthConfigured,
  signAccountSession,
  verifyAccountSession,
  MFA_PENDING_COOKIE,
  MFA_PENDING_MAX_AGE,
  mfaPendingCookieOptions,
  signMfaPendingToken,
  verifyMfaPendingToken,
} from './accountSession';

// Edge-safe half of this module (sign/verify, no next/headers) — same convention as
// lib/session.test.ts. The cookie set/clear/read helpers (setAccountCookie, setMfaPendingCookie,
// getCurrentAccount, getMfaPendingAccountId, clearAccountCookie, clearMfaPendingCookie) all need
// next/headers' request-scoped cookies() and are exercised via the API routes instead.

const SECRET = 'test-secret-at-least-16-chars-long';

let savedSecret: string | undefined;
let savedCookieSecure: string | undefined;

beforeEach(() => {
  savedSecret = process.env.AUTH_SECRET;
  savedCookieSecure = process.env.AUTH_COOKIE_SECURE;
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = savedSecret;
  if (savedCookieSecure === undefined) delete process.env.AUTH_COOKIE_SECURE;
  else process.env.AUTH_COOKIE_SECURE = savedCookieSecure;
});

describe('cookie name constants', () => {
  it('the account and pending-MFA cookies are distinct names', () => {
    expect(ACCOUNT_COOKIE).toBe('pharos_account');
    expect(MFA_PENDING_COOKIE).toBe('pharos_account_mfa_pending');
    expect(MFA_PENDING_COOKIE).not.toBe(ACCOUNT_COOKIE);
  });

  it('both max-ages are positive integer seconds, pending shorter than the real session', () => {
    expect(Number.isInteger(ACCOUNT_MAX_AGE)).toBe(true);
    expect(Number.isInteger(MFA_PENDING_MAX_AGE)).toBe(true);
    expect(ACCOUNT_MAX_AGE).toBeGreaterThan(0);
    expect(MFA_PENDING_MAX_AGE).toBeGreaterThan(0);
    expect(MFA_PENDING_MAX_AGE).toBeLessThan(ACCOUNT_MAX_AGE);
  });
});

describe('cookie option builders', () => {
  it('share the same hardening attributes', () => {
    delete process.env.AUTH_COOKIE_SECURE;
    for (const opts of [accountCookieOptions(), mfaPendingCookieOptions()]) {
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
      expect(opts.secure).toBe(false);
    }
    expect(accountCookieOptions().maxAge).toBe(ACCOUNT_MAX_AGE);
    expect(mfaPendingCookieOptions().maxAge).toBe(MFA_PENDING_MAX_AGE);
  });

  it('secure only when AUTH_COOKIE_SECURE is exactly "true"', () => {
    process.env.AUTH_COOKIE_SECURE = 'true';
    expect(accountCookieOptions().secure).toBe(true);
    expect(mfaPendingCookieOptions().secure).toBe(true);
    process.env.AUTH_COOKIE_SECURE = 'nope';
    expect(accountCookieOptions().secure).toBe(false);
  });
});

describe('accountAuthConfigured', () => {
  it('true when AUTH_SECRET is at least 16 chars, false otherwise', () => {
    expect(accountAuthConfigured()).toBe(true);
    process.env.AUTH_SECRET = 'short';
    expect(accountAuthConfigured()).toBe(false);
    delete process.env.AUTH_SECRET;
    expect(accountAuthConfigured()).toBe(false);
  });
});

describe('signAccountSession → verifyAccountSession roundtrip', () => {
  it('recovers sub and email', async () => {
    const token = await signAccountSession({ sub: 'acc-1', email: 'a@example.com' });
    const out = await verifyAccountSession(token);
    expect(out).not.toBeNull();
    expect(out!.sub).toBe('acc-1');
    expect(out!.email).toBe('a@example.com');
  });

  it('throws when signing without a configured secret', async () => {
    delete process.env.AUTH_SECRET;
    await expect(signAccountSession({ sub: 'acc-1', email: 'a@example.com' })).rejects.toThrow(/AUTH_SECRET/);
  });

  it('null on empty/missing/garbage token', async () => {
    expect(await verifyAccountSession(undefined)).toBeNull();
    expect(await verifyAccountSession(null)).toBeNull();
    expect(await verifyAccountSession('not-a-jwt')).toBeNull();
  });
});

describe('signMfaPendingToken → verifyMfaPendingToken roundtrip', () => {
  it('recovers the account id', async () => {
    const token = await signMfaPendingToken('acc-42');
    expect(await verifyMfaPendingToken(token)).toBe('acc-42');
  });

  it('throws when signing without a configured secret', async () => {
    delete process.env.AUTH_SECRET;
    await expect(signMfaPendingToken('acc-42')).rejects.toThrow(/AUTH_SECRET/);
  });

  it('null on empty/missing/garbage token', async () => {
    expect(await verifyMfaPendingToken(undefined)).toBeNull();
    expect(await verifyMfaPendingToken(null)).toBeNull();
    expect(await verifyMfaPendingToken('')).toBeNull();
    expect(await verifyMfaPendingToken('not-a-jwt')).toBeNull();
  });

  it('null when signed with a different secret', async () => {
    const foreign = new TextEncoder().encode('a-totally-different-secret-16+');
    const token = await new SignJWT({ typ: 'mfa_pending' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-42')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(foreign);
    expect(await verifyMfaPendingToken(token)).toBeNull();
  });

  it('null on an expired token', async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ typ: 'mfa_pending' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-42')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);
    expect(await verifyMfaPendingToken(token)).toBeNull();
  });

  it('null when the `typ` claim is missing or wrong — rejects a real account-session-shaped token', async () => {
    const secret = new TextEncoder().encode(SECRET);
    const noTyp = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-42')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);
    expect(await verifyMfaPendingToken(noTyp)).toBeNull();

    // A real signAccountSession token (no `typ` claim, carries `email` instead) must never be
    // accepted by the pending-MFA verifier — the two token kinds must not be interchangeable.
    const realSession = await signAccountSession({ sub: 'acc-42', email: 'a@example.com' });
    expect(await verifyMfaPendingToken(realSession)).toBeNull();
  });

  it('null when the token carries no subject', async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ typ: 'mfa_pending' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);
    expect(await verifyMfaPendingToken(token)).toBeNull();
  });
});
