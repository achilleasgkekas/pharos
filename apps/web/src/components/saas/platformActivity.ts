// PURE + client-safe presentation helpers for the PLATFORM activity feed (/admin/audit) — the
// cross-tenant operator view of the audit trail. Builds on activityView (the workspace-scoped
// mapping) and only adds the one thing a cross-tenant feed needs and a single-workspace one does
// not: workspace attribution per row. Kept pure (no DB, no next/*, no React) so the mapping is
// unit-testable and identical wherever it renders. Only meaningful in SAAS_MODE.
import { toActivityRow, type ActivityInput, type ActivityRow } from './activityView';

/** The whitelisted platform-feed row this module consumes (structurally matches
 *  lib/tenancy/adminAudit.platformAuditEvent()'s return). Declared locally so this pure helper
 *  never pulls the node-only reader. */
export type PlatformActivityInput = ActivityInput & {
  workspaceSlug: string | null;
  workspaceName: string | null;
};

/** A display-ready platform activity row: everything the workspace view shows, plus which
 *  workspace it happened in. */
export type PlatformActivityRow = ActivityRow & {
  /** Slug for linking to /admin/tenants/<slug>; null when the workspace no longer exists. */
  workspaceSlug: string | null;
  /** Human label for the workspace column — always non-empty (see workspaceLabel). */
  workspaceLabel: string;
};

/** Copy for an event whose Tenant row is gone. The audit trail is append-only and outlives the
 *  workspaces it describes, so a purged tenant is expected, not a bug — say so plainly rather
 *  than rendering a blank cell that reads like a rendering fault. */
export const DELETED_WORKSPACE_LABEL = 'deleted workspace';

/**
 * Label for the workspace column: display name if set, else the slug, else the deleted-workspace
 * placeholder. Never returns an empty string, so the column always renders something meaningful.
 * PURE.
 */
export function workspaceLabel(
  row: Pick<PlatformActivityInput, 'workspaceName' | 'workspaceSlug'>
): string {
  const name = row.workspaceName?.trim();
  if (name) return name;
  const slug = row.workspaceSlug?.trim();
  if (slug) return slug;
  return DELETED_WORKSPACE_LABEL;
}

/** Map one platform-feed row to a display-ready row. PURE. */
export function toPlatformActivityRow(row: PlatformActivityInput): PlatformActivityRow {
  const slug = row.workspaceSlug?.trim();
  return {
    ...toActivityRow(row),
    workspaceSlug: slug || null,
    workspaceLabel: workspaceLabel(row),
  };
}

/** Map a batch of platform-feed rows, preserving order (the reader already sorts newest-first). */
export function toPlatformActivityRows(
  rows: readonly PlatformActivityInput[]
): PlatformActivityRow[] {
  return rows.map(toPlatformActivityRow);
}

/**
 * Distinct actor emails present in a page of platform events, normalised and sorted, for the
 * Actor filter's autocomplete.
 *
 * The Actor filter matches the FULL address exactly (it resolves email -> account id server-side),
 * which is precise but unforgiving: one typo renders "No account with email ..." rather than the
 * rows the operator just saw. Offering the addresses already on screen removes the retyping.
 *
 * Deliberately a SAMPLE, not a directory: this is what the current page shows, not the platform
 * roster, so it is derived from the rows instead of a new lookup endpoint. For the same reason it
 * is NOT capped — the feed page is already bounded (<= MAX_PLATFORM_AUDIT_PAGE), and truncating
 * would drop an address that is visibly on screen, which is the one failure this is meant to fix.
 *
 * Lowercased to match Account.email (declared `lowercase: true`), so a suggestion always resolves
 * the same way the server will match it. Entries without an "@" are dropped: they could never
 * resolve to an account, and a suggestion that guarantees an empty result is worse than none.
 * PURE.
 */
/** One workspace suggestion: the slug the filter actually matches, plus the human label the
 *  operator recognises. Kept as a pair because those are two different strings and the filter
 *  only accepts one of them. */
export type WorkspaceSuggestion = { slug: string; label: string };

/**
 * Distinct workspaces present in a page of platform events, for the Workspace filter's
 * autocomplete. Same problem and same shape as `actorEmailSuggestions`: the filter matches the
 * slug EXACTLY, so a typo answers "No workspace with slug ..." instead of the rows the operator
 * is looking straight at.
 *
 * The pair matters. The Workspace column shows the display NAME ("Acme Corp"), while the filter
 * takes the SLUG ("acme") — so an operator reading the column has, by construction, the wrong
 * string to type. The suggestion carries the slug as the value and the name as the label, which
 * is exactly what a <datalist> option is for.
 *
 * Rows whose workspace is gone (purged tenant → null slug) are dropped: the audit trail outlives
 * its workspaces, but filtering by a slug that no longer resolves is guaranteed to return
 * nothing, and a suggestion that guarantees an empty result is worse than no suggestion — an
 * empty result during an incident reads as a finding.
 *
 * A SAMPLE of the current page, not a directory: no new endpoint, no listing of every workspace
 * on the platform. Not capped, because the page is already bounded and truncating would hide a
 * workspace that is visibly on screen. Sorted by slug so the dropdown does not reshuffle with
 * the newest-first feed order between requests. PURE.
 */
export function workspaceSuggestions(
  rows: readonly Pick<PlatformActivityInput, 'workspaceSlug' | 'workspaceName'>[]
): WorkspaceSuggestion[] {
  const bySlug = new Map<string, WorkspaceSuggestion>();
  for (const row of rows) {
    const slug = row.workspaceSlug?.trim().toLowerCase();
    if (!slug) continue;
    // First occurrence wins. The feed is newest-first, so if a workspace was ever renamed the
    // most recent label is the one an operator will recognise.
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, label: workspaceLabel(row) });
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function actorEmailSuggestions(
  rows: readonly Pick<PlatformActivityInput, 'actorEmail'>[]
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const email = row.actorEmail?.trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    seen.add(email);
  }
  // Alphabetical, so the dropdown order does not shuffle with the feed order between requests.
  return [...seen].sort();
}
