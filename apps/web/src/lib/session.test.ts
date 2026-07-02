import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
  authConfigured,
  signSession,
  verifySession,
  shouldRefresh,
  type SessionClaims,
} from './session';

// Edge-safe session helpers: no DB, no next/headers, jose (Web Crypto) only. The env
// vars AUTH_SECRET / AUTH_COOKIE_SECURE are read at call time (not module load), so we
// can toggle them per test with a save/restore. SESSION_MAX_AGE / IDLE_HOURS are frozen
// at module load, so we assert against the exported SESSION_MAX_AGE constant rather than
// hardcoding a number — that keeps the tests correct if SESSION_IDLE_HOURS is set in CI.

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

describe('SESSION_COOKIE / SESSION_MAX_AGE constants', () => {
  it('cookie name is the shared pharos_session key', () => {
    expect(SESSION_COOKIE).toBe('pharos_session');
  });

  it('max age is a positive integer number of seconds', () => {
    expect(Number.isInteger(SESSION_MAX_AGE)).toBe(true);
    expect(SESSION_MAX_AGE).toBeGreaterThan(0);
  });
});

describe('sessionCookieOptions', () => {
  it('sets the hardening attributes every setter shares', () => {
    delete process.env.AUTH_COOKIE_SECURE;
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBe(SESSION_MAX_AGE);
  });

  it('secure is false by default (plain-HTTP LAN/WireGuard)', () => {
    delete process.env.AUTH_COOKIE_SECURE;
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it('secure only when AUTH_COOKIE_SECURE is exactly "true"', () => {
    process.env.AUTH_COOKIE_SECURE = 'true';
    expect(sessionCookieOptions().secure).toBe(true);
    process.env.AUTH_COOKIE_SECURE = 'yes';
    expect(sessionCookieOptions().secure).toBe(false);
    process.env.AUTH_COOKIE_SECURE = '1';
    expect(sessionCookieOptions().secure).toBe(false);
  });
});

describe('authConfigured', () => {
  it('true when AUTH_SECRET is at least 16 chars', () => {
    process.env.AUTH_SECRET = 'x'.repeat(16);
    expect(authConfigured()).toBe(true);
  });

  it('false when AUTH_SECRET is unset', () => {
    delete process.env.AUTH_SECRET;
    expect(authConfigured()).toBe(false);
  });

  it('false when AUTH_SECRET is shorter than 16 chars (fail closed)', () => {
    process.env.AUTH_SECRET = 'x'.repeat(15);
    expect(authConfigured()).toBe(false);
  });
});

describe('signSession', () => {
  it('throws when no secret is configured', async () => {
    delete process.env.AUTH_SECRET;
    await expect(signSession({ sub: 'u1', role: 'admin', name: 'A' })).rejects.toThrow(/AUTH_SECRET/);
  });

  it('produces a compact JWT (three dot-separated segments)', async () => {
    const token = await signSession({ sub: 'u1', role: 'admin', name: 'Achilleas' });
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('sign → verify roundtrip', () => {
  it('recovers sub, role, name and a numeric exp', async () => {
    const claims: SessionClaims = { sub: 'user-123', role: 'admin', name: 'Achilleas' };
    const token = await signSession(claims);
    const out = await verifySession(token);
    expect(out).not.toBeNull();
    expect(out!.sub).toBe('user-123');
    expect(out!.role).toBe('admin');
    expect(out!.name).toBe('Achilleas');
    expect(typeof out!.exp).toBe('number');
  });

  it('exp is roughly SESSION_MAX_AGE seconds ahead of now', async () => {
    const token = await signSession({ sub: 'u', role: 'member', name: 'M' });
    const out = await verifySession(token);
    const now = Math.floor(Date.now() / 1000);
    // Allow a few seconds of jitter for signing/verifying latency.
    expect(out!.exp! - now).toBeGreaterThan(SESSION_MAX_AGE - 5);
    expect(out!.exp! - now).toBeLessThanOrEqual(SESSION_MAX_AGE + 1);
  });
});

describe('verifySession', () => {
  it('null on empty / missing token', async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession(null)).toBeNull();
    expect(await verifySession('')).toBeNull();
  });

  it('null when no secret is configured, even for a well-formed token', async () => {
    const token = await signSession({ sub: 'u', role: 'admin', name: 'A' });
    delete process.env.AUTH_SECRET;
    expect(await verifySession(token)).toBeNull();
  });

  it('null on a garbage / non-JWT string', async () => {
    expect(await verifySession('not-a-jwt')).toBeNull();
    expect(await verifySession('a.b.c')).toBeNull();
  });

  it('null when the token was signed with a different secret', async () => {
    const foreign = new TextEncoder().encode('a-totally-different-secret-16+');
    const token = await new SignJWT({ role: 'admin', name: 'A' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(foreign);
    expect(await verifySession(token)).toBeNull();
  });

  it('null on an expired token', async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ role: 'admin', name: 'A' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);
    expect(await verifySession(token)).toBeNull();
  });

  it('null when the token carries no subject', async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ role: 'admin', name: 'A' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secret);
    expect(await verifySession(token)).toBeNull();
  });

  it('defaults an unknown / missing role to member (never silently admin)', async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ role: 'superuser', name: 'A' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secret);
    const out = await verifySession(token);
    expect(out!.role).toBe('member');
  });

  it('tolerates a missing name (empty string, not undefined)', async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ role: 'member' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secret);
    const out = await verifySession(token);
    expect(out!.name).toBe('');
  });
});

describe('shouldRefresh', () => {
  const now = () => Math.floor(Date.now() / 1000);

  it('false when exp is undefined', () => {
    expect(shouldRefresh(undefined)).toBe(false);
  });

  it('false for a fresh token still in the first half of its window', () => {
    // remaining just under full window → past first half only if < MAX/2; here it is well above.
    expect(shouldRefresh(now() + SESSION_MAX_AGE - 10)).toBe(false);
  });

  it('true once past the first half of the idle window (sliding refresh)', () => {
    expect(shouldRefresh(now() + Math.floor(SESSION_MAX_AGE / 2) - 100)).toBe(true);
  });

  it('true for an already-expired / near-expired token', () => {
    expect(shouldRefresh(now() - 100)).toBe(true);
  });

  it('true for a long-lived cookie outliving the current window (shrink on sight)', () => {
    expect(shouldRefresh(now() + SESSION_MAX_AGE + 5000)).toBe(true);
  });
});
