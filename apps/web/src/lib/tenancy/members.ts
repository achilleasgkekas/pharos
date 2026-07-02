// SaaS CONTROL-PLANE — pure helpers for workspace membership management. NO imports,
// no DB, no env: safe to unit-test and to reuse from route handlers. Only meaningful
// when SAAS_MODE is on; the self-hosted single-user app never mints memberships.
//
// The org-role ladder (see models/Membership.ts):
//   owner  → billing + delete tenant + manage members (at least one required, always)
//   admin  → manage members + tenant settings
//   member → use the app; no member/billing management

export type OrgRole = 'owner' | 'admin' | 'member';

export const ORG_ROLES: readonly OrgRole[] = ['owner', 'admin', 'member'] as const;

/** Validate an untrusted role string; returns the typed role or null. */
export function parseRole(x: unknown): OrgRole | null {
  return typeof x === 'string' && (ORG_ROLES as readonly string[]).includes(x)
    ? (x as OrgRole)
    : null;
}

/** Owners and admins may list/add/update/remove members; plain members may not. */
export function canManageMembers(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Only an owner may grant or keep the `owner` role. An admin can create/keep admins and
 * members but cannot mint another owner (that would be a privilege escalation).
 */
export function canAssignRole(actorRole: string, targetRole: OrgRole): boolean {
  if (targetRole === 'owner') return actorRole === 'owner';
  return canManageMembers(actorRole);
}

/** Minimal member shape the guard math needs — decoupled from the Mongoose doc. */
export type MemberLite = { accountId: string; role: OrgRole; status: string };

/** The set of active owners in a workspace. */
export function activeOwners(members: MemberLite[]): MemberLite[] {
  return members.filter((m) => m.status === 'active' && m.role === 'owner');
}

/**
 * Would removing (or demoting away from owner) this account leave the workspace with
 * zero active owners? A workspace must always keep at least one owner.
 */
export function wouldOrphanOwners(members: MemberLite[], accountId: string): boolean {
  const owners = activeOwners(members);
  return owners.length <= 1 && owners.some((m) => m.accountId === accountId);
}

/** Normalize an email for lookup (lowercase + trim), matching the Account schema. */
export function normalizeEmail(x: unknown): string {
  return typeof x === 'string' ? x.trim().toLowerCase() : '';
}

/** RFC-lite email shape check (mirrors the signup route's guard). */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
