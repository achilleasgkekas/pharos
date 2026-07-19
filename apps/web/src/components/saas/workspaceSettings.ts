// PURE + client-safe helpers for the workspace "Settings" panel
// ((saas)/account/workspace/settings + WorkspaceSettingsPanel.tsx). Mirrors the server's own
// validation/error shapes for rename (PATCH /api/saas/workspace), cancel
// (DELETE /api/saas/workspace) and reactivate (POST /api/saas/workspace/reactivate) so the
// panel gives instant feedback, same idiom as createWorkspace.ts / leaveWorkspace.ts.
//
// No DOM, no server bindings — safe to unit test and to import from a client component. The
// only import is the pure MAX_WORKSPACE_NAME constant (no DB/env in that module either).
import { MAX_WORKSPACE_NAME } from '@/lib/tenancy/workspace';

/**
 * A proposed rename is submittable when non-blank, within the cap, and actually different
 * from the current name (trimmed comparison) — matches the server's own no-op short-circuit,
 * so the Save button naturally disables once nothing would change.
 */
export function workspaceRenameReady(name: string, currentName: string): boolean {
  const trimmed = (name || '').trim();
  if (trimmed.length === 0 || trimmed.length > MAX_WORKSPACE_NAME) return false;
  return trimmed !== (currentName || '').trim();
}

/**
 * Map a workspace-settings API failure (rename/cancel/reactivate) to a human message.
 * Prefers the server-provided `error` string (already user-facing: "A workspace name is
 * required", "only the workspace owner can cancel it", …) and falls back to a status-derived
 * line, same idiom as createWorkspace.describeCreateWorkspaceError.
 */
export function describeWorkspaceSettingsError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  if (status === 401) return 'Please sign in again';
  if (status === 403) return 'You do not have permission to do that';
  if (status === 404) return 'That workspace was not found';
  if (status === 409) return 'This workspace cannot be changed right now';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Could not update the workspace. Please try again';
}
