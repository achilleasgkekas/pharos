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

/**
 * Optional cookie `Domain`, from `SAAS_COOKIE_DOMAIN` (e.g. `.ph-aros.com`).
 *
 * Why this exists: tenants live on subdomains (`acme.ph-aros.com`) and the feature pages
 * resolve their tenant from the HOST, but a cookie set without a Domain is host-only. A
 * session established while signing up on the apex would therefore not be sent to the
 * workspace subdomain, and the product pages would answer "not authenticated" to a user who
 * just logged in. Setting the parent domain once makes the session span every subdomain.
 *
 * Empty/unset (ALWAYS, for self-hosted) → no Domain attribute → today's exact behaviour.
 * A leading dot is optional; browsers treat `ph-aros.com` and `.ph-aros.com` identically.
 * PURE (env injectable for tests).
 */
export function accountCookieDomain(env: Env = process.env): string | undefined {
  const d = (env.SAAS_COOKIE_DOMAIN || '').trim().toLowerCase();
  return d || undefined;
}

type Env = Record<string, string | undefined>;

export function accountCookieOptions(env: Env = process.env) {
  const domain = accountCookieDomain(env);
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: ACCOUNT_MAX_AGE,
    // Spread rather than `domain: undefined`, so the emitted cookie is byte-identical to the
    // pre-SaaS one when unset.
    ...(domain ? { domain } : {}),
  };
}

/**
 * Attributes identifying a cookie for DELETION. A cookie set with a Domain can only be
 * cleared by an expiry carrying the SAME Domain: `cookies().delete(name)` alone would leave a
 * domain-scoped session alive in the browser, i.e. a logout that silently does nothing.
 */
export function accountCookieDeleteOptions(name: string, env: Env = process.env) {
  const domain = accountCookieDomain(env);
  return { name, path: '/', ...(domain ? { domain } : {}) };
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
  store.delete(accountCookieDeleteOptions(ACCOUNT_COOKIE));
}

// --- MFA login-step-2 pending state (increment 83, TODO §9 "wiring MFA into login") ---------
//
// When `Account.mfaEnabled` is true, `POST /api/saas/auth/login` must NOT hand out a real
// session on a correct password alone — it needs a second factor first. This short-lived,
// SEPARATELY-COOKIED token carries "this password was just verified for this account id" across
// the two requests (login → mfa-verify) without granting any access itself: it is never accepted
// by `verifyAccountSession` (different cookie, and a distinct signed `typ` claim below rejects it
// even if a future route mistakenly tried to read it as a real session). Cleared as soon as the
// second factor succeeds (real cookie takes over) or the user backs out.

export const MFA_PENDING_COOKIE = 'pharos_account_mfa_pending';

// Only spans "user is mid-login, typing a 6-digit code" — a few minutes is generous. Own knob,
// independent of ACCOUNT_MAX_AGE.
const MFA_PENDING_MINUTES = Math.min(60, Math.max(1, Number(process.env.SAAS_MFA_PENDING_MINUTES) || 5));
export const MFA_PENDING_MAX_AGE = Math.round(MFA_PENDING_MINUTES * 60); // seconds

export function mfaPendingCookieOptions(env: Env = process.env) {
  const domain = accountCookieDomain(env);
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: MFA_PENDING_MAX_AGE,
    // Same reasoning as the session cookie: login can start on one host and finish on another.
    ...(domain ? { domain } : {}),
  };
}

/** Sign a pending-MFA token: only the account id (no email, no tenant data) + a `typ` marker
 *  that makes it structurally distinct from a real account session token. */
export async function signMfaPendingToken(accountId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET is not set (min 16 chars)');
  return await new SignJWT({ typ: 'mfa_pending' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(accountId)
    .setIssuedAt()
    .setExpirationTime(`${MFA_PENDING_MAX_AGE}s`)
    .sign(secret);
}

/** Verify a pending-MFA token → the account id it names, or null on any failure: bad signature,
 *  expired, missing subject, or a `typ` that isn't `mfa_pending` (rejects a real session token —
 *  or anything else — handed to this verifier by mistake). Never throws. */
export async function verifyMfaPendingToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (payload.typ !== 'mfa_pending') return null;
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function setMfaPendingCookie(accountId: string): Promise<void> {
  const token = await signMfaPendingToken(accountId);
  const store = await cookies();
  store.set(MFA_PENDING_COOKIE, token, mfaPendingCookieOptions());
}

export async function clearMfaPendingCookie(): Promise<void> {
  const store = await cookies();
  store.delete(accountCookieDeleteOptions(MFA_PENDING_COOKIE));
}

/** Read + verify the pending-MFA cookie → the account id it names, or null when absent/invalid. */
export async function getMfaPendingAccountId(): Promise<string | null> {
  const store = await cookies();
  return verifyMfaPendingToken(store.get(MFA_PENDING_COOKIE)?.value);
}
