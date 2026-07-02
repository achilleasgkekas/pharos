// SaaS CONTROL-PLANE — email-verification helpers. Only meaningful when SAAS_MODE is on;
// the self-hosted app uses the per-tenant User path and never verifies account email.
//
// The flow mirrors password-reset (passwordReset.ts): a high-entropy random token is handed
// to the user over email; the DB stores ONLY its SHA-256 hash + an expiry, so a leaked row
// cannot be replayed as a live verification token. Confirm re-hashes the presented token and
// looks it up by hash ("store the hash, never the secret").
//
// A verification link is longer-lived than a reset link (people click these late) — 24h by
// default. The pure helpers carry no imports and are unit-tested; the crypto helpers use
// node:crypto and are only reachable from the (node-runtime) verify routes.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** How long a freshly minted verification token stays valid. Generous by design (24 hours). */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** Expiry Date for a token minted at `nowMs` (defaults to now). */
export function verifyTokenExpiry(nowMs: number = Date.now()): Date {
  return new Date(nowMs + VERIFY_TTL_MS);
}

/**
 * True when a stored expiry is present and still in the future. A null/undefined expiry
 * (no outstanding verification) or a past one is invalid. `nowMs` is injectable for tests.
 */
export function isVerifyTokenValid(expires: Date | null | undefined, nowMs: number = Date.now()): boolean {
  if (!expires) return false;
  const t = expires instanceof Date ? expires.getTime() : new Date(expires).getTime();
  if (Number.isNaN(t)) return false;
  return t > nowMs;
}

/** SHA-256 hex of a verification token — what gets stored / looked up. */
export function hashVerifyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a fresh verification token: the plaintext `token` goes to the user, the `tokenHash` +
 * `expires` go to the Account row. 32 random bytes → base64url (no padding, URL-safe).
 */
export function mintVerifyToken(nowMs: number = Date.now()): { token: string; tokenHash: string; expires: Date } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashVerifyToken(token), expires: verifyTokenExpiry(nowMs) };
}

/** Constant-time compare of two stored hashes (hex strings of equal length). */
export function verifyHashMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
