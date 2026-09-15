import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import {
  ACCOUNT_COOKIE,
  ACCOUNT_MAX_AGE,
  ACCOUNT_ABSOLUTE_MAX_AGE,
  accountCookieOptions,
  accountCookieDomain,
  accountCookieDeleteOptions,
  accountAuthConfigured,
  signAccountSession,
  signAccountToken,
  verifyAccountSession,
  verifyAccountToken,
  shouldRefreshAccount,
  MFA_PENDING_COOKIE,
  MFA_PENDING_MAX_AGE,
  mfaPendingCookieOptions,
  signMfaPendingToken,
  verifyMfaPendingToken,
} from './accountSession';

// Edge-safe half of this module (sign/verify, no next/headers) — same convention as
// lib/session.test.ts.

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

describe('cookie name & max age constants', () => {
  it('the account and pending-MFA cookies are distinct names', () => {
    expect(ACCOUNT_COOKIE).toBe('pharos_account');
    expect(MFA_PENDING_COOKIE).toBe('pharos_account_mfa_pending');
    expect(MFA_PENDING_COOKIE).not.toBe(ACCOUNT_COOKIE);
  });

  it('both max-ages are positive integer seconds, pending shorter than the real session', () => {
    expect(Number.isInteger(ACCOUNT_MAX_AGE)).toBe(true);
    expect(Number.isInteger(MFA_PENDING_MAX_AGE)).toBe(true);
    expect(Number.isInteger(ACCOUNT_ABSOLUTE_MAX_AGE)).toBe(true);
    expect(ACCOUNT_MAX_AGE).toBeGreaterThan(0);
    expect(MFA_PENDING_MAX_AGE).toBeGreaterThan(0);
    expect(ACCOUNT_ABSOLUTE_MAX_AGE).toBeGreaterThan(ACCOUNT_MAX_AGE);
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

describe('signAccountSession / signAccountToken → verifyAccountSession roundtrip', () => {
  it('recovers sub, email, auth_time, and epoch', async () => {
    const claims = { sub: 'acc-1', email: 'a@example.com', epoch: 3 };
    const token = await signAccountSession(claims);
    const out = await verifyAccountSession(token);
    expect(out).not.toBeNull();
    expect(out!.sub).toBe('acc-1');
    expect(out!.email).toBe('a@example.com');
    expect(out!.epoch).toBe(3);
    expect(typeof out!.auth_time).toBe('number');
    expect(typeof out!.exp).toBe('number');
  });

  it('preserves existing auth_time on re-issuance', async () => {
    const now = Math.floor(Date.now() / 1000);
    const originalAuthTime = now - 3600; // 1 hour ago
    const initialToken = await signAccountToken({
      sub: 'acc-1',
      email: 'a@example.com',
      auth_time: originalAuthTime,
    });

    const verified = await verifyAccountToken(initialToken);
    expect(verified!.auth_time).toBe(originalAuthTime);

    // Re-issue with verified claims (sliding refresh)
    const refreshedToken = await signAccountToken(verified!);
    const refreshedVerified = await verifyAccountToken(refreshedToken);

    expect(refreshedVerified!.auth_time).toBe(originalAuthTime);
  });

  it('clamps expiration time to auth_time + ACCOUNT_ABSOLUTE_MAX_AGE', async () => {
    const now = Math.floor(Date.now() / 1000);
    // auth_time is 29 days and 20 hours ago (near 30 day limit = 2592000s)
    const authTime = now - (ACCOUNT_ABSOLUTE_MAX_AGE - 14400); // 4 hours remaining until absolute max
    const token = await signAccountToken({
      sub: 'acc-1',
      email: 'a@example.com',
      auth_time: authTime,
    });

    const verified = await verifyAccountToken(token);
    expect(verified).not.toBeNull();
    // exp should be capped at authTime + ACCOUNT_ABSOLUTE_MAX_AGE, NOT now + ACCOUNT_MAX_AGE (12h)
    expect(verified!.exp).toBe(authTime + ACCOUNT_ABSOLUTE_MAX_AGE);
  });

  it('returns null when session age exceeds ACCOUNT_ABSOLUTE_MAX_AGE', async () => {
    const now = Math.floor(Date.now() / 1000);
    // auth_time is 31 days ago (past 30 days)
    const authTime = now - (ACCOUNT_ABSOLUTE_MAX_AGE + 86400);
    const secret = new TextEncoder().encode(SECRET);

    const expiredToken = await new SignJWT({ email: 'a@example.com', auth_time: authTime })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600) // exp is in the future, but auth_time is past 30 days
      .sign(secret);

    expect(await verifyAccountToken(expiredToken)).toBeNull();
  });

  it('throws when signing without a configured secret', async () => {
    delete process.env.AUTH_SECRET;
    await expect(signAccountSession({ sub: 'acc-1', email: 'a@example.com' })).rejects.toThrow(/AUTH_SECRET/);
  });

  it('null on empty/missing/garbage token or revoked signature', async () => {
    expect(await verifyAccountSession(undefined)).toBeNull();
    expect(await verifyAccountSession(null)).toBeNull();
    expect(await verifyAccountSession('not-a-jwt')).toBeNull();

    // Revoked token signed with a different secret
    const foreignSecret = new TextEncoder().encode('different-secret-that-is-16-chars');
    const revokedToken = await new SignJWT({ email: 'a@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(foreignSecret);
    expect(await verifyAccountToken(revokedToken)).toBeNull();
  });
});

describe('shouldRefreshAccount', () => {
  const now = () => Math.floor(Date.now() / 1000);

  it('false when exp is undefined', () => {
    expect(shouldRefreshAccount(undefined)).toBe(false);
  });

  it('false for a fresh token still in the first half of its window', () => {
    expect(shouldRefreshAccount(now() + ACCOUNT_MAX_AGE - 10)).toBe(false);
  });

  it('true once past the first half of the idle window (sliding refresh)', () => {
    expect(shouldRefreshAccount(now() + Math.floor(ACCOUNT_MAX_AGE / 2) - 100)).toBe(true);
  });

  it('true for an already-expired / near-expired token', () => {
    expect(shouldRefreshAccount(now() - 100)).toBe(true);
  });

  it('true for a long-lived cookie outliving the current window (shrink on sight)', () => {
    expect(shouldRefreshAccount(now() + ACCOUNT_MAX_AGE + 5000)).toBe(true);
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

describe('accountCookieDomain', () => {
  it('is undefined when unset — the self-hosted app emits a host-only cookie, unchanged', () => {
    expect(accountCookieDomain({})).toBeUndefined();
    expect(accountCookieDomain({ SAAS_COOKIE_DOMAIN: '   ' })).toBeUndefined();
  });

  it('returns the configured parent domain, normalised', () => {
    expect(accountCookieDomain({ SAAS_COOKIE_DOMAIN: ' .PH-Aros.com ' })).toBe('.ph-aros.com');
  });
});

describe('accountCookieOptions', () => {
  it('omits the domain key entirely when unset, not domain:undefined', () => {
    expect('domain' in accountCookieOptions({})).toBe(false);
  });

  it('carries the domain so the session spans tenant subdomains', () => {
    expect(accountCookieOptions({ SAAS_COOKIE_DOMAIN: '.ph-aros.com' })).toMatchObject({
      domain: '.ph-aros.com',
      httpOnly: true,
      path: '/',
    });
  });

  it('keeps secure driven by AUTH_COOKIE_SECURE, independently of the domain', () => {
    expect(accountCookieOptions({ AUTH_COOKIE_SECURE: 'true' }).secure).toBe(true);
    expect(accountCookieOptions({ SAAS_COOKIE_DOMAIN: '.ph-aros.com' }).secure).toBe(false);
  });
});

describe('mfaPendingCookieOptions', () => {
  it('follows the same domain rule — login can start on one host and finish on another', () => {
    expect('domain' in mfaPendingCookieOptions({})).toBe(false);
    expect(mfaPendingCookieOptions({ SAAS_COOKIE_DOMAIN: '.ph-aros.com' })).toMatchObject({
      domain: '.ph-aros.com',
    });
  });
});

describe('accountCookieDeleteOptions', () => {
  it('names the cookie and path when there is no domain', () => {
    expect(accountCookieDeleteOptions(ACCOUNT_COOKIE, {})).toEqual({
      name: ACCOUNT_COOKIE,
      path: '/',
    });
  });

  it('repeats the domain, or the browser keeps the cookie and logout does nothing', () => {
    expect(accountCookieDeleteOptions(ACCOUNT_COOKIE, { SAAS_COOKIE_DOMAIN: '.ph-aros.com' })).toEqual(
      { name: ACCOUNT_COOKIE, path: '/', domain: '.ph-aros.com' }
    );
  });

  it('matches what the setter emitted, for both cookies', () => {
    const env = { SAAS_COOKIE_DOMAIN: '.ph-aros.com' };
    expect(accountCookieDeleteOptions(ACCOUNT_COOKIE, env).domain).toBe(
      accountCookieOptions(env).domain
    );
    expect(accountCookieDeleteOptions(MFA_PENDING_COOKIE, env).domain).toBe(
      mfaPendingCookieOptions(env).domain
    );
  });
});
