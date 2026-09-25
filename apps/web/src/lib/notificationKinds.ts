/**
 * The one list of bell notification kinds. It lives here, with no Mongoose import, so the
 * model's `enum`, the reconcile sweep in app/notifications/actions.ts and the tests all read
 * the same array. When the three were separate literals they drifted: `claim` reached the
 * sweep but never the enum, and because the bell's `insertMany` is ordered, one stale claim
 * failed validation and took every other fresh alert down with it.
 */

/** Kinds the reconcile sweep owns: it inserts them, refreshes them and auto-expires them. */
export const AUTO_NOTIF_KINDS = [
  'deal',
  'installment',
  'warranty',
  'pricehike',
  'trialend',
  'subreview',
  'bill',
  'maintenance',
  'lending',
  'claim',
  'document',
  'vehicle',
  'specialdate',
] as const;

/** Every kind a stored notification may carry. `system` is written by hand, never swept. */
export const NOTIF_KINDS = [...AUTO_NOTIF_KINDS, 'system'] as const;

export type NotifKind = (typeof NOTIF_KINDS)[number];
