// PURE + client-safe decision for the post-login account landing (/account). A signed-in
// Account can belong to zero, one, or several workspaces (accountTenants). The landing page
// wants a single, testable rule for what to render:
//   - zero memberships  → an informational empty state (nothing to route into).
//   - exactly one       → skip the chooser and go straight into that workspace's settings.
//   - two or more       → a workspace chooser (cards linking into each).
// Kept pure (no DB, no next/*) so the routing rule is unit-testable and stays consistent with
// how the settings pages resolve a workspace (default = first membership). Only meaningful in
// SAAS_MODE; the page that consumes it self-gates.

/** Minimal workspace shape the landing needs — a superset of `AccountTenant` (saasApi). */
export type LandingTenant = {
  slug: string;
  name: string;
  role: string;
  plan: string;
  status: string;
};

/** The three landing outcomes. `single.slug` is informational; the page routes to the
 *  workspace default (first membership, clean URL) regardless. */
export type AccountLandingDecision<T extends LandingTenant = LandingTenant> =
  | { kind: 'empty' }
  | { kind: 'single'; slug: string }
  | { kind: 'choose'; workspaces: T[] };

/**
 * Decide what /account should do for an account's membership list.
 *   - not an array / empty → { kind: 'empty' }
 *   - exactly one          → { kind: 'single', slug } (caller redirects into the workspace)
 *   - more than one        → { kind: 'choose', workspaces } (caller renders the chooser)
 * Defensive: a non-array input collapses to `empty` rather than throwing.
 */
export function accountLanding<T extends LandingTenant>(
  tenants: readonly T[]
): AccountLandingDecision<T> {
  if (!Array.isArray(tenants) || tenants.length === 0) return { kind: 'empty' };
  if (tenants.length === 1) {
    return { kind: 'single', slug: String(tenants[0]?.slug ?? '') };
  }
  return { kind: 'choose', workspaces: tenants.slice() };
}
