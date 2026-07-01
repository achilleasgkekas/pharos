// SaaS ACCOUNT session — the httpOnly cookie that authenticates a global `Account`
// login in the managed SaaS (SAAS_MODE on). Deliberately SEPARATE from the per-tenant
// `User` session (lib/session.ts, cookie `pharos_session`): the two auth paths never
// entangle, so the self-hosted single-user app is byte-for-byte unaffected.
//
// Signing/verifying uses `jose` (Web Crypto) so the token half is edge-safe; the cookie
// set/clear/read helpers use next/headers and are NODE-ONLY (call them from SaaS route
// handlers only, never from middleware). Reuses the existing AUTH_SECRET — no new config.
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

// Distinct cookie name so an Account session and a per-tenant User session can coexist in
// the same browser without clobbering each other.
export const ACCOUNT_COOKIE = 'pharos_account';

export type AccountClaims = { sub: string; email: string; exp?: number };

// Idle window for the SaaS account session (its own knob, independent of the self-hosted
// SESSION_IDLE_HOURS). Clamped to a sane range; default 12h.
const IDLE_HOURS = Math.min(8760, Math.max(0.25, Number(process.env.SAAS_SESSION_IDLE_HOURS) || 12));
export const ACCOUNT_MAX_AGE = Math.round(IDLE_HOURS * 3600); // seconds

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null; // fail closed without a real secret
  return new TextEncoder().encode(s);
}

/** True when AUTH_SECRET is configured — lets SaaS routes fail closed with a clear 500. */
export function accountAuthConfigured(): boolean {
  return getSecret() !== null;
}

export function accountCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: ACCOUNT_MAX_AGE,
  };
}

export async function signAccountSession(claims: AccountClaims): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET is not set (min 16 chars)');
  return await new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCOUNT_MAX_AGE}s`)
    .sign(secret);
}

/** Verify an account token → claims, or null on any failure. Never throws. */
export async function verifyAccountSession(token: string | undefined | null): Promise<AccountClaims | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) return null;
    const email = typeof payload.email === 'string' ? payload.email : '';
    return { sub, email, exp: typeof payload.exp === 'number' ? payload.exp : undefined };
  } catch {
    return null;
  }
}

/** Read + verify the account cookie (token-only, no DB hit). Null when logged out. */
export async function getCurrentAccount(): Promise<AccountClaims | null> {
  const store = await cookies();
  return verifyAccountSession(store.get(ACCOUNT_COOKIE)?.value);
}

export async function setAccountCookie(claims: AccountClaims): Promise<void> {
  const token = await signAccountSession(claims);
  const store = await cookies();
  store.set(ACCOUNT_COOKIE, token, accountCookieOptions());
}

export async function clearAccountCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACCOUNT_COOKIE);
}
