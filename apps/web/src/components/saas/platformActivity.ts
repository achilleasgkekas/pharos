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
