// P31 — who is allowed to change things in a shared self-hosted instance.
//
// The app has always been shared-data: every logged-in user sees everything, which is the
// household model people actually want (one inventory, one set of expenses). What was
// missing is a role that can LOOK without being able to CHANGE, for the people you want to
// give the link to but not the keys.
//
// Pure and DB-free on purpose, so both enforcement points (the /api/v1 wrapper and the
// server actions) decide from the same table, and so the rules are unit-testable without
// standing up three logins.
//
// A note on why `viewer` was not simply added to the enum years ago: a read-only role that
// is not actually enforced is WORSE than no role at all, because it reads as a safety
// boundary while being none. So the enum and the enforcement land together.

export type Role = 'admin' | 'member' | 'viewer';

/** Ordered least → most privileged. The order is meaningful: see `atLeast`. */
export const ROLES: readonly Role[] = ['viewer', 'member', 'admin'] as const;

export function parseRole(x: unknown): Role | null {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x) ? (x as Role) : null;
}

/** Rank for comparisons. Unknown strings rank below viewer, so a corrupt value can only
 *  ever lose privileges, never gain them. */
function rank(role: string): number {
  const i = (ROLES as readonly string[]).indexOf(role);
  return i < 0 ? -1 : i;
}

export function atLeast(role: string, min: Role): boolean {
  return rank(role) >= rank(min);
}

/**
 * May this role create, edit or delete anything?
 *
 * Fail closed: anything that is not a role we know about is treated as read-only, so a
 * missing/renamed/corrupt value degrades to the safe side rather than granting writes.
 */
export function canWrite(role: string): boolean {
  return atLeast(role, 'member');
}

/** Settings, users, integrations, destructive maintenance. Admin only, unchanged. */
export function canAdmin(role: string): boolean {
  return atLeast(role, 'admin');
}

/** HTTP methods that only read. Everything else is treated as a mutation, so a new verb
 *  (or a typo) is blocked for viewers rather than silently allowed. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isReadMethod(method: string): boolean {
  return READ_METHODS.has((method || '').toUpperCase());
}

/** The message a blocked viewer sees. One wording everywhere. */
export const READ_ONLY_MESSAGE = 'Your account has read-only access';
