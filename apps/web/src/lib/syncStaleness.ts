// Deterministic "has the remote mirror fallen behind?" check for runAlertChecks (P48).
// No AI, no network — it only reads a stored timestamp.
//
// WHY: pushing to the remote backend (OneDrive/SMB/FTP) is manual ("Sync now" in
// Settings → File storage), and until now nothing recorded WHEN a push last succeeded.
// A user who set up a mirror months ago and stopped clicking it believes they have a
// 3-2-1 backup while the remote copy silently ages. That belief is the failure: the
// gap only becomes visible when the local disk is already gone.
//
// Pure + framework-free so it unit-tests without a DB, same shape as lib/budgetAlert.ts
// and lib/priceHike.ts.

export type SyncStalenessInput = {
  /** Configured storage backend; 'local' means there is no remote to fall behind. */
  backend: string;
  /** When a push to the remote last succeeded (any path: Sync now, or auto-mirror). */
  lastSyncAt: string | Date | null | undefined;
  /** Alert when this many days have passed with no successful push. 0 = check off. */
  thresholdDays: number;
  /** Epoch ms to measure against (injected so tests need no clock control). */
  now: number;
};

export type SyncStaleness = {
  /** Whole days since the last successful push, or null when there has never been one. */
  days: number | null;
  backend: string;
  /** ISO timestamp of the last successful push; null when there has never been one. */
  lastSyncAt: string | null;
  thresholdDays: number;
};

/**
 * Returns the staleness payload when the remote mirror deserves an alert, else null.
 *
 * Silent when the backend is 'local' (nothing is meant to be mirrored anywhere) or
 * thresholdDays <= 0 (the check is switched off). Nothing else suppresses it.
 *
 * NOT gated on the auto-mirror toggle, deliberately, even though the backlog item
 * proposed that. Auto-mirror OFF means every push is a manual "Sync now" click, which
 * is precisely the user this alert exists for; gating on the toggle would switch the
 * warning off for the only people who can forget. With auto-mirror ON, staleness still
 * means something worth hearing: either nothing has been filed in weeks, or the
 * fire-and-forget mirror has been failing quietly (it swallows its own errors by
 * design, so this is the only place that surfaces a long silence).
 *
 * A remote backend that has NEVER synced does fire (days: null). That is the single
 * most valuable case: a mirror configured once, tested, and never actually used looks
 * identical to a working one everywhere else in the UI.
 */
export function detectSyncStaleness(input: SyncStalenessInput): SyncStaleness | null {
  const { backend, thresholdDays, now } = input;
  if (!backend || backend === 'local') return null;
  if (!(thresholdDays > 0)) return null;

  const last = toDate(input.lastSyncAt);
  if (!last) {
    return { days: null, backend, lastSyncAt: null, thresholdDays };
  }
  // A timestamp in the future (clock skew, a restored backup from another machine)
  // is treated as "just synced" rather than as a negative age.
  const days = Math.floor((now - last.getTime()) / 86400000);
  if (days < thresholdDays) return null;
  return { days, backend, lastSyncAt: last.toISOString(), thresholdDays };
}

/** One-line human summary for the ntfy/notifier alert body. */
export function formatSyncStaleness(s: SyncStaleness): string {
  if (s.days === null) {
    return `Remote backup (${s.backend}) has never completed a sync`;
  }
  return `Remote backup (${s.backend}) last synced ${s.days} day${s.days === 1 ? '' : 's'} ago`;
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
