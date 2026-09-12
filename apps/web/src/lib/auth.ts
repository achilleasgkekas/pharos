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
  SESSION_MFA_PENDING_COOKIE,
  mfaPendingCookieOptions,
  signMfaPendingToken,
  verifyMfaPendingToken,
  type Role,
  type SessionClaims,
} from './session';
import { canWrite, READ_ONLY_MESSAGE } from './roles';
import { saasMode } from './tenancy/saasMode';

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

/** The user's current "sign out everywhere" epoch (P91). Lazily imports db/model so the
 *  auth.ts import graph (and every test that imports it) is unchanged. */
async function currentSessionEpoch(userId: string): Promise<number> {
  const { connectDB } = await import('./db');
  const { User } = await import('@/models/User');
  await connectDB();
  const doc = (await User.findById(userId).select('sessionEpoch').lean()) as { sessionEpoch?: number } | null;
  return Number(doc?.sessionEpoch) || 0;
}

/** Bump a user's session epoch → invalidates every existing token for them (P91). Returns
 *  the new epoch so the caller can re-mint the CURRENT device's cookie and stay signed in. */
export async function bumpSessionEpoch(userId: string): Promise<number> {
  const { connectDB } = await import('./db');
  const { User } = await import('@/models/User');
  await connectDB();
  const doc = (await User.findByIdAndUpdate(
    userId,
    { $inc: { sessionEpoch: 1 } },
    { new: true, projection: { sessionEpoch: 1 } }
  ).lean()) as { sessionEpoch?: number } | null;
  return Number(doc?.sessionEpoch) || 0;
}

/** Read + verify the session cookie. Null when logged out. Token-only EXCEPT when the token
 *  carries a P91 epoch, in which case it is compared to the user's current sessionEpoch (one
 *  indexed lookup) so a "sign out everywhere" takes effect. Fails OPEN on a DB error — a
 *  transient outage must never lock out a validly-signed session — but a real mismatch (or a
 *  deleted user) invalidates. Pre-P91 tokens carry no epoch and skip the check entirely. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  if (claims.epoch !== undefined) {
    try {
      if ((await currentSessionEpoch(claims.sub)) !== claims.epoch) return null;
    } catch {
      /* DB hiccup → fail open; the signature + expiry were already checked */
    }
  }
  return { id: claims.sub, role: claims.role, name: claims.name };
}

/**
 * Who is signed in, in EITHER shape: a self-hosted `User` session, or a hosted `Account` with a
 * membership in the workspace named by the host.
 *
 * This is the one function the app should ask. Without the second half, a paying customer who was
 * correctly signed in looked like nobody: every gate redirected to /login, /login found zero
 * `User` documents and redirected to /setup, and the customer was handed the self-hosted
 * "create your admin account" wizard. The navbar disappeared for the same reason.
 *
 * The SaaS half is imported DYNAMICALLY, for two reasons: lib/tenancy/recoveryCodes imports back
 * into this module, so a static import would close a cycle, and a self-hosted deployment must not
 * load the tenancy graph at all.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const self = await getCurrentUser();
  if (self) return self;
  if (!saasMode()) return null;
  const { saasSessionUser } = await import('./tenancy/saasIdentity');
  return saasSessionUser();
}

/** For server components/actions that must have a user. Redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/login');
  return u;
}

/**
 * P31 write guard for server actions. Throws for a read-only (viewer) session, otherwise
 * returns silently.
 *
 * Two deliberate pass-throughs, both about NOT breaking paths that were never a user
 * pressing a button:
 *
 *  - **Outside a request** (`cookies()` throws in the background job runner and in cron
 *    work), there is no session to judge, and the work was authorised when it was
 *    enqueued. Same reason `safeRevalidate` exists.
 *  - **No session at all** is already handled upstream by the middleware, which sends the
 *    request to /login. Redirecting again from deep inside an action would only turn a
 *    clean 302 into a confusing thrown digest.
 *
 * So the one thing this adds is: a logged-in viewer cannot write. Everything else behaves
 * exactly as before.
 */
export async function assertCanWrite(): Promise<void> {
  let user: SessionUser | null;
  try {
    user = await getSessionUser();
  } catch {
    return; // background job / cron: no request scope, nothing to authorise against
  }
  if (!user) return;
  if (!canWrite(user.role)) throw new Error(READ_ONLY_MESSAGE);
}

/** Admin-only guard. Redirects to /login when logged out, throws when a non-admin calls. */
export async function requireAdmin(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/login');
  if (u.role !== 'admin') throw new Error('Forbidden: admin access required');
  return u;
}

/** Mint a session JWT and set the httpOnly cookie. Call from a server action / route handler.
 *  Enriches the claims with the user's current session epoch (P91) when the caller didn't set
 *  one, so every freshly-minted self-host session is bound to the current epoch — callers keep
 *  passing just { sub, role, name }. Fails open on a DB error (mints without an epoch rather
 *  than refusing to log the user in). */
export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  let epoch = claims.epoch;
  if (epoch === undefined) {
    try {
      epoch = await currentSessionEpoch(claims.sub);
    } catch {
      /* DB hiccup → mint a pre-P91-shaped token; still a valid session */
    }
  }
  const token = await signSession({ ...claims, epoch });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// --- MFA login-step-2 pending state (P79) — cookie plumbing over lib/session.ts's edge-safe
// token sign/verify. See the doc comment there for why this is a separate cookie/claim shape.

export async function setMfaPendingCookie(userId: string): Promise<void> {
  const token = await signMfaPendingToken(userId);
  const store = await cookies();
  store.set(SESSION_MFA_PENDING_COOKIE, token, mfaPendingCookieOptions());
}

export async function clearMfaPendingCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_MFA_PENDING_COOKIE);
}

/** Read + verify the pending-MFA cookie → the user id it names, or null when absent/invalid. */
export async function getMfaPendingUserId(): Promise<string | null> {
  const store = await cookies();
  return verifyMfaPendingToken(store.get(SESSION_MFA_PENDING_COOKIE)?.value);
}
