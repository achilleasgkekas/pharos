// PURE + client-safe helpers for the "create another workspace" flow (account/page.tsx +
// CreateWorkspaceForm.tsx). An already-signed-in Account can provision a second (or Nth)
// Tenant of its own via POST /api/saas/account/workspaces; these mirror the server's own
// validation so the inline form gives instant feedback before the round-trip, exactly like
// authValidation.ts does for login/signup.
//
// No imports, no DOM, no server bindings — safe to unit test and to import from a client
// component.

// Mirror of the server MAX_WORKSPACE_NAME in api/saas/account/workspaces/route.ts.
export const MAX_WORKSPACE_NAME = 80;

/** A workspace name is ready to submit when it is non-blank and within the length cap. */
export function workspaceNameReady(name: string): boolean {
  const trimmed = (name || '').trim();
  return trimmed.length > 0 && trimmed.length <= MAX_WORKSPACE_NAME;
}

/**
 * Map a create-workspace API failure to a human message. Prefers the server-provided `error`
 * string (already user-facing: "A workspace name is required", "Workspace limit reached for
 * this account", …) and falls back to a status-derived line, same idiom as
 * authValidation.describeAuthError.
 */
export function describeCreateWorkspaceError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  if (status === 401) return 'Please sign in again';
  if (status === 400) return 'Please check the workspace name and try again';
  if (status === 404) return 'Workspaces are not available on this server';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Could not create the workspace. Please try again';
}
