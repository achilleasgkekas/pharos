import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { middleware, isSaasPublicPath, SAAS_LOGIN_PATH } from './middleware';
import {
  ACCOUNT_COOKIE,
  ACCOUNT_MAX_AGE,
  ACCOUNT_ABSOLUTE_MAX_AGE,
  signAccountToken,
  verifyAccountToken,
} from '@/lib/tenancy/accountToken';

// The SaaS front door. Before this, `if (saasMode()) return pass()` let EVERY request
// through on the reasoning that authorization happened one layer in.
//
// This list is the whole security boundary now, so it is pinned deny-by-default.

const SECRET = 'test-secret-at-least-16-chars-long';

let savedSaasMode: string | undefined;
let savedSecret: string | undefined;
let savedDomain: string | undefined;

beforeEach(() => {
  savedSaasMode = process.env.SAAS_MODE;
  savedSecret = process.env.AUTH_SECRET;
  savedDomain = process.env.SAAS_COOKIE_DOMAIN;
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  if (savedSaasMode === undefined) delete process.env.SAAS_MODE;
  else process.env.SAAS_MODE = savedSaasMode;
  if (savedSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = savedSecret;
  if (savedDomain === undefined) delete process.env.SAAS_COOKIE_DOMAIN;
  else process.env.SAAS_COOKIE_DOMAIN = savedDomain;
});

describe('isSaasPublicPath — what a signed-out visitor may still reach', () => {
  it('lets the auth pages through, or there is no way in at all', () => {
    expect(isSaasPublicPath(SAAS_LOGIN_PATH)).toBe(true);
    expect(isSaasPublicPath('/account/signup')).toBe(true);
    expect(isSaasPublicPath('/account/reset')).toBe(true);
    expect(isSaasPublicPath('/account/reset/confirm')).toBe(true);
    expect(isSaasPublicPath('/account/verify')).toBe(true);
  });

  it('lets /api/* through, because those routes answer with a status, not a redirect', () => {
    expect(isSaasPublicPath('/api/saas/invites/accept')).toBe(true);
    expect(isSaasPublicPath('/api/v1/items')).toBe(true);
    expect(isSaasPublicPath('/api/cron/alerts')).toBe(true);
    expect(isSaasPublicPath('/api/files/receipt.pdf')).toBe(false);
  });

  it('gates the product itself — the actual reported hole', () => {
    expect(isSaasPublicPath('/')).toBe(false);
    expect(isSaasPublicPath('/items')).toBe(false);
    expect(isSaasPublicPath('/receipts')).toBe(false);
    expect(isSaasPublicPath('/settings')).toBe(false);
    expect(isSaasPublicPath('/reports')).toBe(false);
  });

  it('gates the signed-in account area and the operator console', () => {
    expect(isSaasPublicPath('/account')).toBe(false);
    expect(isSaasPublicPath('/account/settings')).toBe(false);
    expect(isSaasPublicPath('/account/workspace/billing')).toBe(false);
    expect(isSaasPublicPath('/admin')).toBe(false);
    expect(isSaasPublicPath('/admin/tenants')).toBe(false);
  });

  it('gates the self-hosted first-run wizard, which no hosted visitor should ever be offered', () => {
    expect(isSaasPublicPath('/setup')).toBe(false);
    expect(isSaasPublicPath('/login')).toBe(false);
  });

  it('does not open a gated path because it merely starts like a public one', () => {
    expect(isSaasPublicPath('/account/signup/../workspace')).toBe(false);
    expect(isSaasPublicPath('/account/verifying-something')).toBe(false);
    expect(isSaasPublicPath('/account/loginx')).toBe(false);
    expect(isSaasPublicPath('/apiv1/items')).toBe(false);
  });
});

describe('SaaS middleware sliding refresh & revocation checks', () => {
  beforeEach(() => {
    process.env.SAAS_MODE = 'true';
  });

  it('re-issues cookie when past halfway through idle window and preserves domain', async () => {
    process.env.SAAS_COOKIE_DOMAIN = '.ph-aros.com';
    const now = Math.floor(Date.now() / 1000);
    // exp is in 2 hours (less than half of 12h idle window remaining → needs refresh)
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ email: 'user@example.com', auth_time: now - 3600 * 10 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt(now - 3600 * 10)
      .setExpirationTime(now + 7200)
      .sign(secret);

    const req = new NextRequest('https://app.ph-aros.com/dashboard', {
      headers: { cookie: `${ACCOUNT_COOKIE}=${token}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain(ACCOUNT_COOKIE);
    expect(setCookie).toContain('Domain=.ph-aros.com');

    // Verify re-issued token
    const cookieValue = res.cookies.get(ACCOUNT_COOKIE)?.value;
    expect(cookieValue).toBeDefined();
    const verified = await verifyAccountToken(cookieValue);
    expect(verified).not.toBeNull();
    expect(verified!.sub).toBe('acc-1');
    expect(verified!.email).toBe('user@example.com');
    expect(verified!.auth_time).toBe(now - 3600 * 10);
    expect(verified!.exp).toBeGreaterThan(now + 7200);
  });

  it('does NOT re-issue cookie when before halfway point in idle window', async () => {
    const now = Math.floor(Date.now() / 1000);
    // exp is in 10 hours (well above half of 12h remaining → no refresh needed)
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ email: 'user@example.com', auth_time: now - 3600 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt(now - 3600)
      .setExpirationTime(now + 36000)
      .sign(secret);

    const req = new NextRequest('https://app.ph-aros.com/dashboard', {
      headers: { cookie: `${ACCOUNT_COOKIE}=${token}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('allows API clients with Bearer tokens to reach /api/files/ in SaaS mode without an account cookie', async () => {
    const req = new NextRequest('https://app.ph-aros.com/api/files/test.pdf', {
      headers: { authorization: 'Bearer some-api-token' },
    });
    // This goes through the middleware, and since it's an API path it should just pass
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('does NOT re-issue and redirects to login when token is revoked / invalid signature', async () => {
    const foreignSecret = new TextEncoder().encode('different-secret-that-is-16-chars');
    const token = await new SignJWT({ email: 'user@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(foreignSecret);

    const req = new NextRequest('https://app.ph-aros.com/dashboard', {
      headers: { cookie: `${ACCOUNT_COOKIE}=${token}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307); // redirect
    expect(res.headers.get('location')).toContain(SAAS_LOGIN_PATH);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('does NOT re-issue and rejects when session age exceeds absolute maximum duration (30 days)', async () => {
    const now = Math.floor(Date.now() / 1000);
    // auth_time is 31 days ago
    const authTime = now - (ACCOUNT_ABSOLUTE_MAX_AGE + 86400);
    const secret = new TextEncoder().encode(SECRET);
    const expiredByAgeToken = await new SignJWT({ email: 'user@example.com', auth_time: authTime })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(secret);

    const req = new NextRequest('https://app.ph-aros.com/dashboard', {
      headers: { cookie: `${ACCOUNT_COOKIE}=${expiredByAgeToken}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307); // redirect
    expect(res.headers.get('location')).toContain(SAAS_LOGIN_PATH);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
