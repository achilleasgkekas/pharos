// SaaS CONTROL-PLANE — pure helpers for account self-service (profile + password change).
// No imports, no DB, no env: unit-testable and reusable from the /api/saas/account routes.
// Only meaningful when SAAS_MODE is on; the self-hosted app uses the per-tenant User path.

/** Minimal password policy — mirrors the signup route (blocks empties/typos, not annoying). */
export const MIN_PASSWORD = 8;

/** Trim + cap a display name (the schema has no length cap; keep it sane). Empty stays empty. */
export function sanitizeName(x: unknown): string {
  return typeof x === 'string' ? x.trim().slice(0, 120) : '';
}

/**
 * Validate a password change given the plaintext current + next passwords. Returns a
 * human-readable error string, or null when the new password is acceptable. Does NOT
 * verify the current password against the stored hash (the route does that with
 * verifyPassword) — this only enforces the new-password policy + the must-differ rule.
 */
export function passwordChangeError(current: string, next: string): string | null {
  if (next.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (next === current) return 'New password must be different from the current password';
  return null;
}
