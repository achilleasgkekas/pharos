// Node-runtime auth helpers: password hashing (node:crypto scrypt — no native
// dep, Alpine-safe) + current-user accessors for server components/actions.
// NEVER import this from middleware (it pulls node:crypto into the edge bundle).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
  type Role,
  type SessionClaims,
} from './session';

export type SessionUser = { id: string; role: Role; name: string };

// scrypt cost. 128*N*r ≈ 16 MB per hash (under Node's 32 MB maxmem default).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

/** Hash a plaintext password into a self-describing "scrypt$N$r$p$salt$hash" string. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Constant-time verify. Never throws — returns false on any malformed input. */
export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (!n || !r || !p || expected.length === 0) return false;
    const actual = scryptSync(plain, salt, expected.length, { N: n, r, p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Read + verify the session cookie. Token-only (no DB hit). Null when logged out. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  return { id: claims.sub, role: claims.role, name: claims.name };
}

/** For server components/actions that must have a user. Redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

/** Admin-only guard. Redirects to /login when logged out, throws when a non-admin calls. */
export async function requireAdmin(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  if (u.role !== 'admin') throw new Error('Forbidden: admin access required');
  return u;
}

/** Mint a session JWT and set the httpOnly cookie. Call from a server action / route handler. */
export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await signSession(claims);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
