// SaaS CONTROL-PLANE — pure helpers for workspace self-service (read + rename the display
// name). No imports, no DB, no env: unit-testable and reusable from the /api/saas/workspace
// route. Only meaningful when SAAS_MODE is on; the self-hosted app never has a Tenant doc.
//
// Scope note: only the display `name` is mutable here. `slug`/`dbName` are immutable routing
// keys (renaming a slug would break subdomain routing and orphan the tenant's data database),
// and `customDomain`/`plan`/`status` are managed by their own flows (DNS/certs, billing).

/** Display-name length cap. The Tenant schema has no cap; keep it sane for UI + DNS-adjacent use. */
export const MAX_WORKSPACE_NAME = 80;

/** Trim + collapse internal whitespace + cap length. Non-string / empty → ''. */
export function sanitizeWorkspaceName(x: unknown): string {
  if (typeof x !== 'string') return '';
  return x.trim().replace(/\s+/g, ' ').slice(0, MAX_WORKSPACE_NAME);
}

/**
 * Validate a proposed workspace display name (already sanitized by the caller). Returns a
 * human-readable error string, or null when acceptable. A name is required (empty rejected);
 * the length cap is enforced by sanitize, so this only guards emptiness.
 */
export function workspaceNameError(name: string): string | null {
  if (!name) return 'A workspace name is required';
  return null;
}

/**
 * Only the workspace owner may cancel it (soft-delete → `status:'canceled'`). Cancelling
 * blocks access for everyone and is a billing-adjacent, destructive-in-intent action, so it
 * is stricter than the owner/admin rename gate. Admins/members are rejected. The actual drop
 * of the tenant's data database is a separate, manual flow (never done by a routine).
 */
export function canCancelWorkspace(role: string): boolean {
  return role === 'owner';
}

/** Client-safe projection of a workspace for the read/rename responses. */
export type WorkspaceView = {
  tenantId: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  tier: string;
  customDomain: string | null;
  role: string;
  memberCount: number;
  createdAt: string | null;
};

/**
 * Build a WorkspaceView from a Tenant row + the caller's role + active member count. By
 * construction it only exposes whitelisted display fields — billing ids and other control
 * columns can never leak through it. `role` is the requesting account's role in this workspace.
 */
export function workspaceView(
  tenant: {
    _id: unknown;
    slug?: string | null;
    name?: string | null;
    plan?: string | null;
    status?: string | null;
    tier?: string | null;
    customDomain?: string | null;
    createdAt?: Date | string | null;
  },
  role: string,
  memberCount: number
): WorkspaceView {
  const created = tenant.createdAt;
  const iso = created
    ? (created instanceof Date ? created : new Date(created))
    : null;
  return {
    tenantId: String(tenant._id),
    slug: tenant.slug ?? '',
    name: tenant.name ?? '',
    plan: String(tenant.plan ?? 'free'),
    status: String(tenant.status ?? 'trialing'),
    tier: String(tenant.tier ?? 'shared'),
    customDomain: tenant.customDomain ?? null,
    role,
    memberCount: Number.isFinite(memberCount) ? Math.max(0, memberCount) : 0,
    createdAt: iso && !Number.isNaN(iso.getTime()) ? iso.toISOString() : null,
  };
}
