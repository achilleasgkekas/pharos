// SaaS CONTROL-PLANE — password-reset (forgot-password) helpers. Only meaningful when
// SAAS_MODE is on; the self-hosted app uses the per-tenant User path.
//
// A reset token is a high-entropy random string handed to the user (over email, once a
// mailer exists). The DB stores ONLY its SHA-256 hash + an expiry — so a leaked database
// row cannot be replayed as a live token. Confirm re-hashes the presented token and looks
// it up by hash, mirroring the standard "store the hash, never the secret" pattern used
// elsewhere for API keys.
//
// The pure helpers (RESET_TTL_MS, resetTokenExpiry, isResetTokenValid, resetPasswordError)
// carry no imports and are unit-tested. The crypto helpers use node:crypto and are only
// reachable from the (node-runtime) reset routes.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { MIN_PASSWORD } from './accountProfile';
import { mailerCanDeliver } from './mailer';

/** How long a freshly minted reset token stays valid. Short by design (1 hour). */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Expiry Date for a token minted at `nowMs` (defaults to now). */
export function resetTokenExpiry(nowMs: number = Date.now()): Date {
  return new Date(nowMs + RESET_TTL_MS);
}

/**
 * True when a stored expiry is present and still in the future. A null/undefined expiry
 * (no outstanding reset) or a past one is invalid. `nowMs` is injectable for tests.
 */
export function isResetTokenValid(expires: Date | null | undefined, nowMs: number = Date.now()): boolean {
  if (!expires) return false;
  const t = expires instanceof Date ? expires.getTime() : new Date(expires).getTime();
  if (Number.isNaN(t)) return false;
  return t > nowMs;
}

/**
 * New-password policy for the reset flow. Unlike passwordChangeError there is no "current"
 * password to differ from (the user forgot it) — only the minimum-length rule applies.
 * Returns a human-readable error, or null when acceptable.
 */
export function resetPasswordError(next: string): string | null {
  if (typeof next !== 'string' || next.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters`;
  }
  return null;
}

/** SHA-256 hex of a reset token — what gets stored / looked up. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a fresh reset token: the plaintext `token` goes to the user, the `tokenHash` +
 * `expires` go to the Account row. 32 random bytes → base64url (no padding, URL-safe).
 */
export function mintResetToken(nowMs: number = Date.now()): { token: string; tokenHash: string; expires: Date } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashResetToken(token), expires: resetTokenExpiry(nowMs) };
}

/** Constant-time compare of two stored hashes (hex strings of equal length). */
export function resetHashMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Whether a working email delivery channel exists — delegated to the mailer so there is one
 * source of truth. Only a WIRED provider counts (today: Resend); an SMTP_URL alone is intent
 * but not yet deliverable. When this is false the request route may safely echo the token
 * back in NON-production for local testing.
 */
export function resetDeliveryConfigured(): boolean {
  return mailerCanDeliver();
}
