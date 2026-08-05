// Edge-safe session token helpers. ONLY depends on `jose` (Web Crypto) so this
// module can be imported by middleware (which runs on the Edge runtime where
// node:crypto and Mongoose are unavailable). No next/headers, no DB.
import { SignJWT, jwtVerify } from 'jose';

// One role table for the whole app (lib/roles.ts is pure, so importing it keeps this
// module edge-safe). Re-exported because middleware and auth already import Role here.
export type { Role } from './roles';
import type { Role } from './roles';
export type SessionClaims = { sub: string; role: Role; name: string; exp?: number };

// Cookie shared by middleware (read/refresh) + auth.ts (set/clear).
export const SESSION_COOKIE = 'pharos_session';

// Idle window: the session expires after this long WITHOUT activity. The middleware
// slides it forward on each request, so an actively-used session stays alive but an
// idle one (overnight, a long downtime) logs out. Tune with SESSION_IDLE_HOURS.
const IDLE_HOURS = Math.min(8760, Math.max(0.25, Number(process.env.SESSION_IDLE_HOURS) || 12));
export const SESSION_MAX_AGE = Math.round(IDLE_HOURS * 3600); // seconds

/** Cookie attributes shared by every place that sets the session cookie. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // App is often reached over plain-HTTP LAN/WireGuard → opt-in secure behind TLS.
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  // Fail closed: without a real secret we refuse to mint/accept sessions.
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

/** True when AUTH_SECRET is configured. Lets callers fail closed with a clear message. */
export function authConfigured(): boolean {
  return getSecret() !== null;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET is not set (min 16 chars)');
  return await new SignJWT({ role: claims.role, name: claims.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

/** Verify a token → claims (incl. exp), or null on any failure. Never throws. */
export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) return null;
    const role: Role = payload.role === 'admin' ? 'admin' : 'member';
    const name = typeof payload.name === 'string' ? payload.name : '';
    return { sub, role, name, exp: typeof payload.exp === 'number' ? payload.exp : undefined };
  } catch {
    return null;
  }
}

/** Should the cookie be re-issued? True once the token is past the first half of its
 *  idle window (sliding refresh), OR when it outlives the current window — e.g. an old
 *  long-lived cookie after SESSION_IDLE_HOURS was shortened, which we shrink on sight. */
export function shouldRefresh(exp: number | undefined): boolean {
  if (!exp) return false;
  const remaining = exp - Math.floor(Date.now() / 1000);
  return remaining < SESSION_MAX_AGE / 2 || remaining > SESSION_MAX_AGE;
}

// --- MFA login-step-2 pending state (P79) ---------------------------------------------------
//
// Mirrors lib/tenancy/accountSession.ts's SaaS pending-MFA cookie exactly, for the self-hosted
// `pharos_session` login instead of the SaaS `Account` one. When `User.mfaEnabled` is true, the
// password check alone must NOT hand out a real session — this short-lived, SEPARATELY-COOKIED
// token carries "this password was just verified for this user id" across the two requests
// (submit password → submit code) without granting any access itself: a distinct signed `typ`
// claim means it is never mistaken for a real session token even if a route reads the wrong
// cookie by accident. Edge-safe (jose only) so it lives next to signSession/verifySession; the
// cookie get/set/clear (next/headers) live in lib/auth.ts, same split as session vs auth there.

export const SESSION_MFA_PENDING_COOKIE = 'pharos_session_mfa_pending';

// Only spans "mid-login, typing a 6-digit code" — a few minutes is generous. Own knob,
// independent of SESSION_MAX_AGE.
const MFA_PENDING_MINUTES = Math.min(60, Math.max(1, Number(process.env.SESSION_MFA_PENDING_MINUTES) || 5));
export const MFA_PENDING_MAX_AGE = Math.round(MFA_PENDING_MINUTES * 60); // seconds

export function mfaPendingCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: MFA_PENDING_MAX_AGE,
  };
}

/** Sign a pending-MFA token: only the user id (no role, no name — those are re-derived from
 *  `User` once the second factor succeeds) + a `typ` marker that makes it structurally distinct
 *  from a real session token. */
export async function signMfaPendingToken(userId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET is not set (min 16 chars)');
  return await new SignJWT({ typ: 'mfa_pending' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MFA_PENDING_MAX_AGE}s`)
    .sign(secret);
}

/** Verify a pending-MFA token → the user id it names, or null on any failure: bad signature,
 *  expired, missing subject, or a `typ` that isn't `mfa_pending` (rejects a real session token,
 *  or anything else, handed to this verifier by mistake). Never throws. */
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
