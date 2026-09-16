// EDGE-SAFE half of the SaaS account session: cookie name, token verification, signing,
// and refresh helpers.
//
// lib/tenancy/accountSession.ts imports `next/headers` for its cookie read/write helpers,
// which makes that module node-only. The middleware runs on the Edge runtime and cannot
// import next/headers, so edge-safe jose-only functions live here and accountSession
// re-exports them.
import { SignJWT, jwtVerify } from 'jose';

/** Distinct from the self-hosted `pharos_session` so both can coexist in one browser. */
export const ACCOUNT_COOKIE = 'pharos_account';

// Idle window for the SaaS account session (default 12h).
const IDLE_HOURS = Math.min(8760, Math.max(0.25, Number(process.env.SAAS_SESSION_IDLE_HOURS) || 12));
export const ACCOUNT_MAX_AGE = Math.round(IDLE_HOURS * 3600); // seconds

// Absolute maximum duration for a SaaS account session (default 30 days).
const MAX_DAYS = Math.min(365, Math.max(1, Number(process.env.SAAS_SESSION_MAX_DAYS) || 30));
export const ACCOUNT_ABSOLUTE_MAX_AGE = Math.round(MAX_DAYS * 86400); // seconds

export type AccountClaims = {
  sub: string;
  email: string;
  exp?: number;
  epoch?: number;
  iat?: number;
  auth_time?: number;
};

type Env = Record<string, string | undefined>;

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null; // fail closed without a real secret
  return new TextEncoder().encode(s);
}

/** True when AUTH_SECRET is configured — lets SaaS routes fail closed with a clear 500. */
export function accountAuthConfigured(): boolean {
  return getSecret() !== null;
}

/**
 * Optional cookie `Domain`, from `SAAS_COOKIE_DOMAIN` (e.g. `.ph-aros.com`).
 *
 * Why this exists: tenants live on subdomains (`acme.ph-aros.com`) and the feature pages
 * resolve their tenant from the HOST, but a cookie set without a Domain is host-only. A
 * session established while signing up on the apex would therefore not be sent to the
 * workspace subdomain. Setting the parent domain once makes the session span every subdomain.
 */
export function accountCookieDomain(env: Env = process.env): string | undefined {
  const d = (env.SAAS_COOKIE_DOMAIN || '').trim().toLowerCase();
  return d || undefined;
}

export function accountCookieOptions(env: Env = process.env) {
  const domain = accountCookieDomain(env);
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: ACCOUNT_MAX_AGE,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Attributes identifying a cookie for DELETION.
 */
export function accountCookieDeleteOptions(name: string, env: Env = process.env) {
  const domain = accountCookieDomain(env);
  return { name, path: '/', ...(domain ? { domain } : {}) };
}

export async function signAccountToken(claims: AccountClaims): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET is not set (min 16 chars)');
  const now = Math.floor(Date.now() / 1000);
  const authTime = claims.auth_time ?? claims.iat ?? now;

  // Sliding expiry cannot outlive authTime + ACCOUNT_ABSOLUTE_MAX_AGE
  const maxExp = authTime + ACCOUNT_ABSOLUTE_MAX_AGE;
  const targetExp = Math.min(now + ACCOUNT_MAX_AGE, maxExp);

  const payload: Record<string, unknown> = {
    email: claims.email,
    auth_time: authTime,
  };
  if (claims.epoch !== undefined) payload.epoch = claims.epoch;

  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt(now);

  jwt.setExpirationTime(targetExp > now ? targetExp : now);

  return await jwt.sign(secret);
}

/** Verify an account token → claims, or null on any failure. Never throws. */
export async function verifyAccountToken(token: string | undefined | null): Promise<AccountClaims | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) return null;
    const email = typeof payload.email === 'string' ? payload.email : '';
    const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
    const epoch = typeof payload.epoch === 'number' ? payload.epoch : undefined;
    const iat = typeof payload.iat === 'number' ? payload.iat : undefined;
    const auth_time = typeof payload.auth_time === 'number' ? payload.auth_time : (iat ?? undefined);

    // Hard ceiling check: reject if session age exceeds ACCOUNT_ABSOLUTE_MAX_AGE
    if (auth_time !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= auth_time + ACCOUNT_ABSOLUTE_MAX_AGE) {
        return null;
      }
    }

    return { sub, email, exp, epoch, iat, auth_time };
  } catch {
    return null;
  }
}

/** Should the account cookie be re-issued? True once past the first half of its idle window
 *  or when outliving the window (shrink on sight). */
export function shouldRefreshAccount(exp: number | undefined): boolean {
  if (!exp) return false;
  const remaining = exp - Math.floor(Date.now() / 1000);
  return remaining < ACCOUNT_MAX_AGE / 2 || remaining > ACCOUNT_MAX_AGE;
}
