// PURE + client-safe helpers for the SaaS account-recovery + email-verification forms
// (ResetRequestForm / ResetConfirmForm / VerifyEmail) and their tests. No imports beyond the
// sibling authValidation policy constants, no DOM, no server bindings — so the same rules run
// in the browser (instant inline feedback) and in unit tests, and stay in lockstep with the
// server routes under api/saas/account/{reset,verify}/*.
//
// FIRST-PASS UX guard only: every route re-validates authoritatively (a hand-crafted request
// bypassing the form still hits the same checks server-side). The forms never treat these as
// security boundaries.
import { isValidEmail, MIN_PASSWORD } from './authValidation';

export { MIN_PASSWORD };

/**
 * Reset-request only needs a syntactically valid email. The API always answers { ok: true }
 * regardless of whether the address is registered (anti-enumeration, D6 constant-time), so this
 * guard never reveals account existence — it only front-stops an obvious typo.
 */
export function resetRequestReady(email: string): boolean {
  return isValidEmail(email);
}

/**
 * Validate the new-password pair for the reset-confirm form. Mirrors the server
 * resetPasswordError (MIN_PASSWORD) and additionally requires the confirmation field to match,
 * so a typo is caught before the round-trip. Returns a human message, or null when acceptable.
 */
export function newPasswordError(password: string, confirm: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters`;
  }
  if (password !== confirm) return 'Passwords do not match';
  return null;
}

/** Confirm-form submit-enabled guard: a token is present AND the password pair is valid. */
export function resetConfirmReady(token: string, password: string, confirm: string): boolean {
  return (token || '').trim().length > 0 && newPasswordError(password, confirm) === null;
}

/**
 * Map a recovery/verification API failure to a human message, preferring the server-provided
 * `error` string (already user-facing) and falling back to a status-derived line so an opaque
 * failure never surfaces a bare "undefined".
 */
export function describeRecoveryError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  if (status === 400) return 'This link is invalid or has expired';
  if (status === 401) return 'Please sign in and try again';
  if (status === 404) return 'This feature is not available on this server';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Request failed. Please try again';
}

/**
 * Build a same-origin confirm link for a dev-echoed token (the reset/verify request routes echo
 * `devToken` only in non-production when no mailer is wired). Relative path only — never an
 * absolute URL, so it cannot become an open redirect.
 */
export function tokenLink(base: string, token: string): string {
  return `${base}?token=${encodeURIComponent((token || '').trim())}`;
}
