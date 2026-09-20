// SaaS ACCOUNT session — the httpOnly cookie that authenticates a global `Account`
// login in the managed SaaS (SAAS_MODE on). Deliberately SEPARATE from the per-tenant
// `User` session (lib/session.ts, cookie `pharos_session`): the two auth paths never
// entangle, so the self-hosted single-user app is byte-for-byte unaffected.
//
// Signing/verifying uses `jose` (Web Crypto) so the token half is edge-safe; the cookie
// set/clear/read helpers use next/headers and are NODE-ONLY (call them from SaaS route
// handlers only, never from middleware). Reuses the existing AUTH_SECRET — no new config.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import {
  ACCOUNT_COOKIE,
  ACCOUNT_MAX_AGE,
  ACCOUNT_ABSOLUTE_MAX_AGE,
  verifyAccountToken,
  signAccountToken,
  shouldRefreshAccount,
  accountCookieDomain,
  accountCookieOptions,
  accountCookieDeleteOptions,
  accountAuthConfigured,
  type AccountClaims,
} from './accountToken';

export {
  ACCOUNT_COOKIE,
  ACCOUNT_MAX_AGE,
  ACCOUNT_ABSOLUTE_MAX_AGE,
  verifyAccountToken,
  signAccountToken,
  shouldRefreshAccount,
  accountCookieDomain,
  accountCookieOptions,
  accountCookieDeleteOptions,
  accountAuthConfigured,
};
export type { AccountClaims } from './accountToken';

/** Verify an account token → claims, or null on any failure. Never throws.
 *  The implementation lives in the edge-safe ./accountToken so the middleware can run the
 *  SAME check without dragging next/headers onto the Edge runtime. */
export const verifyAccountSession = verifyAccountToken;

/** Sign an account session token. Edge-safe implementation in accountToken.ts. */
export const signAccountSession = signAccountToken;

/**
 * The account's current "sign out everywhere" counter (#182). Node-only: imported lazily so this
 * module's import graph — and the edge-safe token half above — stay as they were.
 *
 * `cache()` dedupes it within one render: the layout, the page and the tenant gate each ask who
 * is signed in, and without this that is three identical queries per page view.
 */
const currentAccountEpoch = cache(async function currentAccountEpoch(accountId: string): Promise<number> {
  const { connectDB } = await import('../db');
  const { Account } = await import('@/models/Account');
  // The retry lives INSIDE the cached function, not around it: `cache()` memoises the rejected
  // promise too, so a loop on the outside would be handed the same failure again and again
  // without ever reaching the database a second time.
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await connectDB();
      const doc = (await Account.findById(accountId).select('sessionEpoch').lean()) as { sessionEpoch?: number } | null;
      return Number(doc?.sessionEpoch) || 0;
    } catch (err) {
      last = err;
    }
  }
  throw last;
});

/**
 * Read + verify the account cookie. Null when logged out.
 *
 * The token is still the whole authentication; the one DB read is what makes a hosted session
 * REVOCABLE (#182, #193). Without it a password change or a password RESET — the thing you do
 * precisely because someone else may hold your session — left every stolen cookie working until
 * it expired on its own, which for the account cookie is days.
 *
 * A token minted before this shipped carries no epoch, which reads as 0 and matches the stored
 * default: those sessions keep working until something bumps the counter, and are revoked by the
 * first bump like any other. That is the point — the pre-existing sessions are exactly the ones a
 * reset is meant to kill.
 *
 * FAILS CLOSED, after one retry. This is deliberately the opposite of the self-hosted
 * `getCurrentUser`, which fails open so a local Mongo hiccup cannot lock the owner out of their
 * own house. Here the control plane is already load-bearing for the same request —
 * `saasSessionUser` resolves the workspace membership through it and denies after one retry too —
 * so failing open would not keep anyone working during an outage; it would only mean that during
 * one, revoked sessions come back to life.
 */
export async function getCurrentAccount(): Promise<AccountClaims | null> {
  const store = await cookies();
  const claims = await verifyAccountSession(store.get(ACCOUNT_COOKIE)?.value);
  if (!claims) return null;

  try {
    return (await currentAccountEpoch(claims.sub)) === (claims.epoch ?? 0) ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Mint the account cookie. When the caller does not state an epoch, the account's current one is
 * embedded, so every fresh session is bound to the counter as it stands — callers keep passing
 * just { sub, email }. A route that just bumped the counter passes the NEW value explicitly, which
 * is what keeps the device that changed the password signed in while every other one is dropped.
 *
 * A DB error here mints a token with no epoch rather than refusing the login. Such a token reads
 * as epoch 0, so it is valid only while the account has never revoked anything — and the very
 * next bump invalidates it. Failing the login instead would turn a control-plane blip into "no
 * one can sign in", for a token that is revocable either way.
 */
export async function setAccountCookie(claims: AccountClaims): Promise<void> {
  let epoch = claims.epoch;
  if (epoch === undefined) {
    try {
      epoch = await currentAccountEpoch(claims.sub);
    } catch {
      /* control-plane hiccup → mint without an epoch; still a valid, revocable session */
    }
  }
  const token = await signAccountSession({ ...claims, epoch });
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

type Env = Record<string, string | undefined>;

function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null; // fail closed without a real secret
  return new TextEncoder().encode(s);
}

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
