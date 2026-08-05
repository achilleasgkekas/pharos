// PURE mapping from a Tenant lifecycle status transition to (a) the audit action that records it
// and (b) the fields that must change WITH it. No DB / env, so it is fully unit-testable and is
// reused by every code path that mutates Tenant.status: the Stripe webhook, the owner-facing
// cancel/reactivate routes, the superadmin patch, and the trial-lapse sweep.
//
// Why (b) exists: a status is never just a status. Entering `suspended` starts the 30-day keep
// window, leaving it must STOP that clock, and entering `canceled` owes the owner a deletion date.
// Four call sites each remembering three side effects is four chances to forget one, and the
// forgetting is invisible until a workspace is deleted early. Two of those bugs were live before
// this planner existed: nothing cleared `suspendedAt` on reactivation (so a re-suspended workspace
// computed its deadline from the PREVIOUS suspension and could be due for deletion the same day,
// with no warning email), and `canceled` stamped no deletion path at all, so a canceled workspace
// lived forever.
//
// Only meaningful in SaaS mode; the recorder it feeds is a no-op for the default tenant.
import type { AuditAction } from '@/lib/tenancy/audit';
import { ERASURE_GRACE_DAYS, erasureScheduledFor } from '@/lib/tenancy/erasure';

/** Normalize a status value the way the Tenant enum stores it (lowercase/trim); non-string → ''. */
function normStatus(x: unknown): string {
  return typeof x === 'string' ? x.trim().toLowerCase() : '';
}

/**
 * The auditable action for a `prev → next` status change, or null when nothing should be
 * logged. Focuses on the billing lifecycle transitions that matter for the activity trail:
 *
 *   - → suspended                    ⇒ 'workspace.suspended'   (dunning / payment failed)
 *   - → canceled                     ⇒ 'workspace.canceled'    (subscription deleted)
 *   - suspended|canceled → active|trialing ⇒ 'workspace.reactivated' (payment recovered / resubscribe)
 *
 * Everything else is null: a no-op change (prev === next), the initial go-live
 * (pending|trialing → active is normal onboarding, already captured by plan.changed), and
 * benign trialing↔active flips. Fail-closed on unknown/blank next status.
 */
export function statusAuditAction(prev: unknown, next: unknown): AuditAction | null {
  const p = normStatus(prev);
  const n = normStatus(next);
  if (!n || p === n) return null;
  if (n === 'suspended') return 'workspace.suspended';
  if (n === 'canceled') return 'workspace.canceled';
  if (n === 'active' || n === 'trialing') {
    // Only a recovery from a blocked state is a "reactivation"; a fresh activation isn't.
    return p === 'suspended' || p === 'canceled' ? 'workspace.reactivated' : null;
  }
  return null;
}

/**
 * Marker written to `erasureRequestedBy` for the deletion a CANCEL implies. Deliberately a system
 * marker even when a human clicked cancel: it is what lets a later reactivation tell "the deletion
 * that came with the cancel" (clear it) from "the deletion this owner explicitly asked for" (leave
 * it alone — erasure is documented as orthogonal to status). The human actor is recorded on the
 * audit row instead, which is where attribution belongs.
 */
export const CANCEL_ERASURE_ACTOR = 'system:workspace-canceled';

export type StatusChangeInput = {
  prev: unknown;
  next: unknown;
  /** The current erasure schedule, so a pending erasure is never overwritten or pushed later. */
  erasureScheduledAt?: Date | string | null;
  /** Who owns the current erasure, so only a cancel-implied one is cleared on reactivation. */
  erasureRequestedBy?: string | null;
};

/** The fields a status change writes. Shaped as a flat map so a caller can use it either as a
 * `$set` payload (`updateOne`) or with `Object.assign` onto a loaded document. */
export type StatusChangeFields = Record<string, unknown>;

/**
 * Everything a `prev → next` status change must write, in one place. Returns `{}` for a no-op
 * (blank/unknown next, or prev === next) so a caller can skip the write entirely.
 *
 *   → suspended        status, `suspendedAt = now` (starts the 30-day keep window) and
 *                      `suspendWarnEmailedAt = null`, so a workspace suspended a second time is
 *                      warned again instead of inheriting the first suspension's "already warned".
 *   suspended → …      status, and BOTH of those cleared. Without this the old clock survives a
 *                      reactivation and the next suspension inherits an expired deadline.
 *   → canceled         status, plus an erasure scheduled `ERASURE_GRACE_DAYS` out — but only when
 *                      no erasure is pending, so an owner's earlier (possibly sooner) request is
 *                      never pushed back.
 *   canceled → …       status, and the CANCEL-implied erasure cleared, so a reactivated workspace
 *                      is not still queued for deletion. An owner-requested erasure survives.
 *
 * `now` is injectable for deterministic tests.
 */
export function planStatusChange(input: StatusChangeInput, now: Date = new Date()): StatusChangeFields {
  const p = normStatus(input?.prev);
  const n = normStatus(input?.next);
  if (!n || p === n) return {};

  const fields: StatusChangeFields = { status: n };

  if (n === 'suspended') {
    fields.suspendedAt = now;
    fields.suspendWarnEmailedAt = null;
  } else if (p === 'suspended') {
    fields.suspendedAt = null;
    fields.suspendWarnEmailedAt = null;
  }

  const erasurePending = !!parseDate(input?.erasureScheduledAt);
  if (n === 'canceled') {
    if (!erasurePending) {
      fields.erasureRequestedAt = now;
      fields.erasureScheduledAt = erasureScheduledFor(now, ERASURE_GRACE_DAYS);
      fields.erasureRequestedBy = CANCEL_ERASURE_ACTOR;
    }
  } else if (p === 'canceled' && input?.erasureRequestedBy === CANCEL_ERASURE_ACTOR) {
    fields.erasureRequestedAt = null;
    fields.erasureScheduledAt = null;
    fields.erasureRequestedBy = null;
  }

  return fields;
}

/** Parse to a valid Date, or null. Local so this module keeps its no-DB, no-env promise. */
function parseDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}
