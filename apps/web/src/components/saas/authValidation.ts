// PURE + client-safe helpers shared by the SaaS auth forms (LoginForm/SignupForm) and their
// tests. No imports, no DOM, no server bindings — so the same rules run in the browser (instant
// inline feedback) and in unit tests, and stay in lockstep with the server-side policy in
// api/saas/auth/signup (MIN_PASSWORD=8, same email shape).
//
// These are a FIRST-PASS UX guard only: the API re-validates authoritatively (a hand-crafted
// request bypassing the form still hits the same checks server-side). The forms never trust
// these to be security boundaries.

// Mirror of the server EMAIL_RE in api/saas/auth/signup/route.ts. Intentionally loose: block
// obvious typos (missing @, missing dot) without rejecting valid-but-unusual addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirror of the server MIN_PASSWORD.
export const MIN_PASSWORD = 8;

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test((raw || '').trim());
}

/** Login only needs both fields present; the API returns a single 401 for any bad combo. */
export function loginReady(email: string, password: string): boolean {
  return isValidEmail(email) && (password || '').length > 0;
}

/** Signup enforces the shared min-length policy up front so the 400 round-trip is rare. */
export function signupReady(email: string, password: string): boolean {
  return isValidEmail(email) && (password || '').length >= MIN_PASSWORD;
}

/**
 * Map an auth API failure to a human message. Prefers the server-provided `error` string
 * (already user-facing: "Invalid credentials", "An account with this email already exists",
 * …) and falls back to a status-code-derived line so a blank/opaque failure never surfaces a
 * bare "undefined" in the form.
 */
export function describeAuthError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  if (status === 401) return 'Invalid email or password';
  if (status === 409) return 'An account with this email already exists';
  if (status === 400) return 'Please check the details and try again';
  if (status === 404) return 'Sign-in is not available on this server';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Sign-in failed. Please try again';
}

/**
 * Sanitize a post-auth redirect target to a SAME-ORIGIN path, defeating open-redirect via the
 * `?next=` param. Accepts only a leading single "/" (a relative in-app path); rejects "//host",
 * "/\\host" (backslash trick), scheme-bearing ("http:", "javascript:") and empty values →
 * falls back to "/". Never returns an absolute URL.
 */
export function safeNextPath(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim();
  if (!v || v[0] !== '/') return fallback; // must be an app-relative path
  if (v[1] === '/' || v[1] === '\\') return fallback; // //evil.com or /\evil.com
  if (v.includes('\\')) return fallback; // backslashes never appear in a clean path
  return v;
}
