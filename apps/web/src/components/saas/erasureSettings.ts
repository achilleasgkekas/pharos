// PURE + client-safe helpers for the owner-only "Delete workspace" (GDPR Art. 17 right-to-erasure)
// danger-zone section (ErasurePanel.tsx). No DOM, no server bindings — safe to unit test and to
// import from a client component.
//
// Error mapping reuses describeWorkspaceSettingsError (workspaceSettings.ts) rather than a
// bespoke describer: the erasure route (src/app/api/saas/workspace/erasure/route.ts) returns the
// same shape of user-facing `error` strings on every failure path (401/403/404/500 + a
// server-provided message), so a separate ladder would just duplicate that fallback for no
// benefit — same reasoning as increment 74's export links reusing the account-export idiom.
export { describeWorkspaceSettingsError as describeErasureError } from './workspaceSettings';

/**
 * Human phrasing for the grace-window countdown shown next to a pending erasure request.
 * `null` (no schedule — should not be shown at all, but handled defensively) and `0`/negative
 * (due) get their own copy so the panel never claims a wrong pluralization or a stale "N days"
 * once the window has actually elapsed. Mirrors the rounding-up done server-side by
 * `graceDaysLeft` (lib/tenancy/erasure.ts) — this only formats the number, it never recomputes it.
 */
export function describeErasureCountdown(daysLeft: number | null): string {
  if (daysLeft === null) return '';
  if (daysLeft <= 0) return 'due for deletion now';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}
