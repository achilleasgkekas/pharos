// PURE + client-safe picker for the user-facing workspace-settings pages. An Account can
// belong to several workspaces (accountTenants); the settings pages select one by an optional
// `?w=<slug>` query, defaulting to the first membership. Kept pure (no DB, no next/*) so the
// selection rule is unit-testable and identical to how the usage/billing READ routes resolve a
// workspace (default = first, unknown slug = rejected). Only meaningful in SAAS_MODE.

/** The minimal shape a picker needs — a superset of `AccountTenant` (lib/tenancy/saasApi). */
export type PickableWorkspace = { slug: string };

/** Normalize a slug for comparison: string → trimmed lowercase; anything else → ''. */
export function normalizeSlug(x: unknown): string {
  return typeof x === 'string' ? x.trim().toLowerCase() : '';
}

/**
 * Choose which workspace the settings page should show.
 *   - no memberships            → null (caller renders the "no workspace" empty state)
 *   - no/blank `want` slug      → the first membership (stable default)
 *   - `want` matches a slug     → that workspace
 *   - `want` given but no match → null (caller 404s; the account is not a member of it)
 *
 * Matching is case-insensitive on the trimmed slug, mirroring the READ routes
 * (`/api/saas/usage`, `/api/saas/billing`) so the UI and API never disagree on which
 * workspace a `?w=` selects.
 */
export function pickWorkspace<T extends PickableWorkspace>(
  tenants: readonly T[],
  want: unknown
): T | null {
  if (!Array.isArray(tenants) || tenants.length === 0) return null;
  const wanted = normalizeSlug(want);
  if (!wanted) return tenants[0];
  return tenants.find((t) => normalizeSlug(t.slug) === wanted) ?? null;
}

/**
 * Build the `?w=` query suffix for a workspace-scoped settings link. Empty string for the
 * default (first) workspace so URLs stay clean; otherwise `?w=<slug>`. The slug is
 * URL-encoded defensively even though slugs are routing-safe by construction.
 */
export function workspaceQuery(slug: unknown, isDefault: boolean): string {
  const s = normalizeSlug(slug);
  if (!s || isDefault) return '';
  return `?w=${encodeURIComponent(s)}`;
}
