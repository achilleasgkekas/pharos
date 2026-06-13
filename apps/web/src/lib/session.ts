// Edge-safe session token helpers. ONLY depends on `jose` (Web Crypto) so this
// module can be imported by middleware (which runs on the Edge runtime where
// node:crypto and Mongoose are unavailable). No next/headers, no DB.
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'member';
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
