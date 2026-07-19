// PURE + client-safe option list for the workspace Activity tab's action filter dropdown
// ((saas)/account/workspace/activity). Built from the closed AUDIT_ACTIONS set (lib/tenancy/audit)
// so the dropdown can never offer a verb the backend would reject, and reuses activityView's
// actionLabel so the copy matches the pill text shown in the list itself. Kept pure (no DB, no
// next/*, no React) so it is unit-testable and identical wherever it renders. Only meaningful in
// SAAS_MODE; the self-hosted app never mounts the page that uses this.
import { AUDIT_ACTIONS } from '@/lib/tenancy/audit';
import { actionLabel } from './activityView';

export type ActivityFilterOption = { value: string; label: string };

/** Sentinel value for "no filter" — an empty `action` query param, matching parseAuditAction's
 *  behaviour of treating a blank/unknown string as "all actions". */
export const ALL_ACTIONS_VALUE = '';

/**
 * The Activity filter dropdown's options: "All actions" first, then one entry per known audit
 * verb in AUDIT_ACTIONS' declared order (already grouped by concern: membership, invites,
 * billing/plan, workspace), labelled with the same copy the activity list itself shows.
 */
export const ACTIVITY_FILTER_OPTIONS: ActivityFilterOption[] = [
  { value: ALL_ACTIONS_VALUE, label: 'All actions' },
  ...AUDIT_ACTIONS.map((action) => ({ value: action, label: actionLabel(action) })),
];
