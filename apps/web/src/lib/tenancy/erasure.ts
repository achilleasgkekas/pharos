// GDPR Art. 17 (right-to-erasure) lifecycle — PURE helpers for scheduling, cancelling, and
// projecting a workspace's pending deletion. No imports, no DB, no env: fully unit-testable and
// client-safe. The route handler does the (node-only) DB reads/writes and hands lean docs in.
//
// Model (see Tenant.erasure* fields): an owner REQUESTS erasure → the workspace is stamped with
// `erasureRequestedAt`, a `erasureScheduledAt = requestedAt + grace`, and the requesting account.
// A purge job later drops the tenant's isolated data database once `erasureScheduledAt` passes —
// but that DESTRUCTIVE drop is a separate, manual/gated flow, NEVER performed by an automated
// routine (this module only plans the markers + the due-filter; there is no drop here).
//
// The request is REVERSIBLE any time before `erasureScheduledAt` by clearing the markers. Erasure
// is kept ORTHOGONAL to `status` (the access lifecycle): it is a scheduled purge, not an access
// flip, so the owner can keep using the workspace during the grace window and change their mind
// without a prior-status-restoration dance. Only meaningful when SAAS_MODE is on; the self-hosted
// app never creates Tenant docs, so none of this ever runs for the single-user path.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Grace window (days) between an erasure request and the workspace becoming due for permanent
 * deletion. PLACEHOLDER default (30d, mirrors GitHub/Google-style scheduled deletion); kept as a
 * named constant so a later product decision is one edit. Final value = Needs Achilleas.
 */
export const ERASURE_GRACE_DAYS = 30;

/** Only the workspace owner may request or cancel erasure — stricter than the owner/admin gate,
 * mirroring the owner-only cancel of a workspace. Admins/members are rejected. */
export function canEraseWorkspace(role: unknown): boolean {
  return role === 'owner';
}

/** The scheduled purge instant for a request made at `requestedAt`, `graceDays` in the future.
 * A non-finite/negative graceDays falls back to the default so a bad caller can't schedule a
 * purge in the past. */
export function erasureScheduledFor(requestedAt: Date, graceDays: number = ERASURE_GRACE_DAYS): Date {
  const g = Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : ERASURE_GRACE_DAYS;
  return new Date(requestedAt.getTime() + g * MS_PER_DAY);
}

/** True once an erasure request has been stamped (an `erasureRequestedAt` is present). */
export function isErasureRequested(requestedAt: Date | string | null | undefined): boolean {
  if (!requestedAt) return false;
  const t = requestedAt instanceof Date ? requestedAt : new Date(requestedAt);
  return !Number.isNaN(t.getTime());
}

/**
 * Whole days remaining in the grace window before the scheduled purge, from `now`. Rounded UP
 * (so "0 days left" means the purge is due now, never a premature 0 while time remains) and
 * clamped at 0. Null when there is no schedule (no pending erasure).
 */
export function graceDaysLeft(
  scheduledAt: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!scheduledAt) return null;
  const t = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(t.getTime())) return null;
  const ms = t.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

/** True when the grace window has elapsed and the workspace is due for permanent deletion. A
 * missing/invalid schedule is never due (a workspace with no pending erasure is never purged). */
export function isErasureDue(
  scheduledAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!scheduledAt) return false;
  const t = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(t.getTime())) return false;
  return t.getTime() <= now.getTime();
}

/**
 * Plan the `$set` that stamps an erasure request. Returns null (no-op) when the requesting
 * account id is blank — an erasure must be attributable to an owner. `now` and `graceDays` are
 * injectable for deterministic tests. Does NOT touch `status`: erasure is orthogonal to access.
 */
export function planErasureRequest(
  accountId: string,
  now: Date = new Date(),
  graceDays: number = ERASURE_GRACE_DAYS
): { $set: { erasureRequestedAt: Date; erasureScheduledAt: Date; erasureRequestedBy: string } } | null {
  const id = typeof accountId === 'string' ? accountId.trim() : '';
  if (!id) return null;
  return {
    $set: {
      erasureRequestedAt: now,
      erasureScheduledAt: erasureScheduledFor(now, graceDays),
      erasureRequestedBy: id,
    },
  };
}

/** Plan the `$set` that clears a pending erasure (owner changed their mind within the grace
 * window). Reverts all three markers to null; leaves `status` untouched (it was never changed). */
export function planErasureCancel(): {
  $set: { erasureRequestedAt: null; erasureScheduledAt: null; erasureRequestedBy: null };
} {
  return { $set: { erasureRequestedAt: null, erasureScheduledAt: null, erasureRequestedBy: null } };
}

/**
 * Mongo filter selecting workspaces whose grace window has elapsed and are due for permanent
 * deletion: an `erasureScheduledAt` that is set (`$ne: null`) and at/before `now`. Used by the
 * (deferred, gated) purge job. Workspaces without a pending erasure (null schedule) never match.
 */
export function erasureDueFilter(now: Date = new Date()): Record<string, unknown> {
  return { erasureScheduledAt: { $ne: null, $lte: now } };
}

/** ISO-8601, or null for a missing/invalid date. Local so the module stays dependency-free. */
function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export type ErasureView = {
  requested: boolean;
  requestedAt: string | null;
  scheduledAt: string | null;
  requestedBy: string | null;
  graceDaysLeft: number | null;
  due: boolean;
};

/**
 * Client-safe projection of a workspace's erasure state. By construction it only exposes the
 * whitelisted erasure markers (never a secret). `graceDaysLeft`/`due` are computed against `now`.
 */
export function erasureView(
  tenant: {
    erasureRequestedAt?: Date | string | null;
    erasureScheduledAt?: Date | string | null;
    erasureRequestedBy?: string | null;
  },
  now: Date = new Date()
): ErasureView {
  return {
    requested: isErasureRequested(tenant.erasureRequestedAt),
    requestedAt: iso(tenant.erasureRequestedAt),
    scheduledAt: iso(tenant.erasureScheduledAt),
    requestedBy: tenant.erasureRequestedBy ?? null,
    graceDaysLeft: graceDaysLeft(tenant.erasureScheduledAt, now),
    due: isErasureDue(tenant.erasureScheduledAt, now),
  };
}
