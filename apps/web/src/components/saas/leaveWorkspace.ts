// PURE + client-safe helpers for the "leave workspace" control on the /account chooser card
// (LeaveWorkspaceButton.tsx). A member self-removes from a workspace via
// DELETE /api/saas/account/workspaces; these mirror the server's own error shapes so the
// button gives a legible message before/without a full round-trip, same idiom as
// createWorkspace.ts / authValidation.ts.
//
// No imports, no DOM, no server bindings — safe to unit test and to import from a client
// component.

/**
 * Map a leave-workspace API failure to a human message. Prefers the server-provided `error`
 * string (already user-facing: "you are the last owner; promote another member to owner
 * before leaving", …) and falls back to a status-derived line.
 */
export function describeLeaveWorkspaceError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  if (status === 401) return 'Please sign in again';
  if (status === 404) return 'That workspace was not found';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Could not leave the workspace. Please try again';
}

/** True when the server's error code means "sole owner" (surfaced as a distinct disabled state,
 *  not just an error message, in the button UI). */
export function isLastOwnerError(code: unknown): boolean {
  return code === 'last_owner';
}
