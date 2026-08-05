// SUSPENDED-WORKSPACE EXPIRY — the 30-day clock Achilleas fixed on 2026-08-04, and the one thing
// the public Terms/Privacy already promise that no job enforced yet.
//
// The promise (Terms §9, Privacy §5, landing FAQ): a suspended workspace is kept for 30 days —
// the SAME window as Trash and as an account-deletion request, deliberately one number for the
// user to remember — reactivate inside it and nothing is lost; after it, the workspace is deleted.
// Until this module there was no path at all: `statusAudit.ts` described the transition INTO
// suspended and nothing described what happens next, so an abandoned workspace lived forever.
//
// WHAT THIS DOES, and the one thing it deliberately does NOT do:
//   1. BACKFILL — a suspended tenant with no `suspendedAt` gets one (from its newest
//      `workspace.suspended` audit row when present, else `now`). Without this, every workspace
//      suspended before this increment would have no clock. Fail-safe by construction: an
//      un-stamped tenant starts its 30 days at the first sweep, so nobody is ever surprise-deleted
//      by a clock they never had.
//   2. WARN — one email, WARN_BEFORE_DAYS before the deadline, idempotent via
//      `Tenant.suspendWarnEmailedAt`. This is the "προειδοποιητικό email πριν τη διαγραφή".
//   3. ENROLL — at the deadline the workspace is stamped into the EXISTING erasure lifecycle
//      (`erasureRequestedAt/ScheduledAt/RequestedBy`, scheduled for `now` = due immediately), so it
//      shows up as a target of the erasure-purge scan that already runs.
//
// It does NOT drop a database. That is not timidity, it is the single-deletion-path rule this
// codebase already follows: `erasurePurge.ts` is report-only precisely because dropping a tenant's
// data is irreversible, and a second, independent destructive path is exactly how a bug in one of
// them deletes a paying customer. Enrolling into the one existing path means the day the drop is
// armed (Needs Achilleas), it is armed ONCE, for both routes, with one audit trail. The 30-day
// promise is enforced here — the workspace IS scheduled at day 30, not at some human's convenience.
//
// SaaS-only: `runSuspendedSweep` is a no-op when SAAS_MODE is off. The self-hosted (AGPL) app never
// creates Tenant docs, never suspends, never expires. Zero effect on the single-user path.
//
// Split (as with trialSweep) into PURE helpers — window math, filters, email copy, the erasure
// `$set` — and one impure runner. A fixed `now` is injectable everywhere for deterministic tests.
import { erasureScheduledFor } from './erasure';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days a suspended workspace is kept before it is scheduled for deletion. DECIDED by Achilleas
 * (2026-08-04, ASK inbox): 30 days, the same window as Trash auto-purge and as an account-erasure
 * request, so the product teaches ONE number. The public Terms/Privacy state this value — changing
 * it here without changing them makes the site lie.
 */
export const SUSPENDED_GRACE_DAYS = 30;

/**
 * How many days before the deadline the single warning email goes out. 7 (not the trial sweep's 3):
 * a trial ending is expected and the user just clicked through onboarding, while a suspension
 * deadline lands on someone who has already stopped paying attention — and the consequence is
 * deletion, not a pause. A week gives time to notice, reactivate, or export.
 */
export const SUSPEND_WARN_BEFORE_DAYS = 7;

/** The shape the pure helpers reason about — a lean Tenant row, or anything tenant-like. */
export type SuspendedInput = {
  status?: unknown;
  suspendedAt?: Date | string | null;
  /** A pending erasure (owner-requested) means this sweep keeps its hands off. */
  erasureScheduledAt?: Date | string | null;
};

/** Parse to a valid Date, or null. Local so the module stays dependency-light. */
function date(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** Normalize a status the way the Tenant enum stores it; non-string → ''. */
function normStatus(x: unknown): string {
  return typeof x === 'string' ? x.trim().toLowerCase() : '';
}

/**
 * The instant a workspace suspended at `suspendedAt` becomes due for deletion, or null when there
 * is no valid suspension stamp. A non-finite/negative `graceDays` falls back to the default, so a
 * bad caller can never bring a deletion forward.
 */
export function suspendedDeadline(
  suspendedAt: Date | string | null | undefined,
  graceDays: number = SUSPENDED_GRACE_DAYS
): Date | null {
  const t = date(suspendedAt);
  if (!t) return null;
  const g = Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : SUSPENDED_GRACE_DAYS;
  return new Date(t.getTime() + g * MS_PER_DAY);
}

/**
 * Whole days left before the deletion deadline, from `now`. Rounded UP and clamped at 0 (mirrors
 * `graceDaysLeft` in erasure.ts, so "0 days left" means due now and never a premature 0 while time
 * remains). Null when there is no valid suspension stamp.
 */
export function daysUntilSuspendedPurge(
  suspendedAt: Date | string | null | undefined,
  now: Date = new Date(),
  graceDays: number = SUSPENDED_GRACE_DAYS
): number | null {
  const deadline = suspendedDeadline(suspendedAt, graceDays);
  if (!deadline) return null;
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

/**
 * Is this workspace past its keep-window and due to be scheduled for deletion? True ONLY for a
 * `suspended` tenant with a valid `suspendedAt` whose deadline has arrived AND with no erasure
 * already pending — an owner-requested erasure owns its own (possibly later) schedule and this
 * sweep must not overwrite it. A tenant with no stamp is never due (the backfill gives it one
 * first, which restarts the clock rather than ending it).
 */
export function isSuspendedPurgeDue(
  input: SuspendedInput,
  now: Date = new Date(),
  graceDays: number = SUSPENDED_GRACE_DAYS
): boolean {
  if (!input || normStatus(input.status) !== 'suspended') return false;
  if (date(input.erasureScheduledAt)) return false;
  const deadline = suspendedDeadline(input.suspendedAt, graceDays);
  if (!deadline) return false;
  return deadline.getTime() <= now.getTime();
}

/**
 * Is this workspace inside the pre-deletion warning window? True only for a `suspended` tenant with
 * a valid stamp, no pending erasure, whose deadline is still in the FUTURE and at most
 * `SUSPEND_WARN_BEFORE_DAYS` away. Warning and deletion are mutually exclusive by construction, so
 * a workspace is never warned and scheduled in the same run. Idempotency (already-warned) is NOT
 * handled here — this is pure window math; the `suspendWarnEmailedAt: null` guard lives in the
 * filter and the runner.
 */
export function shouldWarnSuspended(
  input: SuspendedInput,
  now: Date = new Date(),
  graceDays: number = SUSPENDED_GRACE_DAYS
): boolean {
  if (!input || normStatus(input.status) !== 'suspended') return false;
  if (date(input.erasureScheduledAt)) return false;
  const deadline = suspendedDeadline(input.suspendedAt, graceDays);
  if (!deadline) return false;
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return false; // already due → that path schedules, it doesn't warn
  return Math.ceil(ms / MS_PER_DAY) <= SUSPEND_WARN_BEFORE_DAYS;
}

/**
 * Is this `suspendedAt` stale — i.e. did a REACTIVATION happen after it? A stamp that predates a
 * reactivation belongs to a suspension the workspace already recovered from, so measuring the
 * keep-window from it would delete a workspace that was suspended again only yesterday.
 *
 * `planStatusChange` now clears the stamp on every exit from `suspended`, so this should never
 * fire. It stays because it is the cheap half of the defence: the write path can be bypassed by
 * the next person who adds a status writer, whereas the audit trail records what actually
 * happened. Belt for the braces, on the one code path whose failure mode is deleting data.
 */
export function isStaleSuspension(
  suspendedAt: Date | string | null | undefined,
  lastReactivatedAt: Date | string | null | undefined
): boolean {
  const s = date(suspendedAt);
  const r = date(lastReactivatedAt);
  if (!s || !r) return false;
  return r.getTime() > s.getTime();
}

export type SuspendedCandidate = SuspendedInput & { id: string };

/**
 * Batch planner: the ids that should receive the warning now. PURE — the caller does the DB read
 * and the mail send. Rows with a missing/blank id are skipped defensively.
 */
export function planSuspendedWarnings(
  candidates: SuspendedCandidate[],
  now: Date = new Date()
): string[] {
  if (!Array.isArray(candidates)) return [];
  const ids: string[] = [];
  for (const c of candidates) {
    if (c && typeof c.id === 'string' && c.id && shouldWarnSuspended(c, now)) ids.push(c.id);
  }
  return ids;
}

/** Batch planner mirroring the above for the deletion side. PURE. */
export function planSuspendedPurges(
  candidates: SuspendedCandidate[],
  now: Date = new Date()
): string[] {
  if (!Array.isArray(candidates)) return [];
  const ids: string[] = [];
  for (const c of candidates) {
    if (c && typeof c.id === 'string' && c.id && isSuspendedPurgeDue(c, now)) ids.push(c.id);
  }
  return ids;
}

/**
 * Mongo filter for suspended workspaces missing their clock — the backfill target. Deliberately
 * does NOT exclude tenants with a pending erasure: stamping `suspendedAt` is informational and
 * the due/warn filters exclude those anyway.
 */
export function unstampedSuspendedFilter(): Record<string, unknown> {
  return { status: 'suspended', suspendedAt: null };
}

/**
 * Mongo filter narrowing a Tenant scan to un-warned suspended workspaces inside the warning
 * window: suspended, not yet warned, no pending erasure, and a `suspendedAt` late enough that the
 * deadline has not passed (`> now - grace`) but early enough that it lands within the warn window
 * (`<= now - (grace - warnBefore)`). Tenants with a null `suspendedAt` do not match a Date range,
 * matching `shouldWarnSuspended`'s "no stamp → no warning".
 */
export function suspendedWarningFilter(now: Date = new Date()): Record<string, unknown> {
  const floor = new Date(now.getTime() - SUSPENDED_GRACE_DAYS * MS_PER_DAY);
  const ceiling = new Date(
    now.getTime() - (SUSPENDED_GRACE_DAYS - SUSPEND_WARN_BEFORE_DAYS) * MS_PER_DAY
  );
  return {
    status: 'suspended',
    suspendWarnEmailedAt: null,
    erasureScheduledAt: null,
    suspendedAt: { $ne: null, $gt: floor, $lte: ceiling },
  };
}

/**
 * Mongo filter selecting suspended workspaces past their keep-window and due to be scheduled for
 * deletion: suspended, no erasure already pending, with a `suspendedAt` at/before `now - grace`.
 */
export function suspendedPurgeFilter(now: Date = new Date()): Record<string, unknown> {
  const floor = new Date(now.getTime() - SUSPENDED_GRACE_DAYS * MS_PER_DAY);
  return {
    status: 'suspended',
    erasureScheduledAt: null,
    suspendedAt: { $ne: null, $lte: floor },
  };
}

/**
 * Build the pre-deletion warning email. PURE — no send. `daysLeft` is clamped to the sensible range
 * so a garbage value never produces "-2 days" or "in 900 days". The copy states the two exits that
 * actually exist (reactivate, or export and self-host free), because a warning that only says
 * "you will be deleted" is a threat, not a notice.
 */
export function suspendedWarningEmail(
  workspaceName: string,
  daysLeft: number
): { subject: string; html: string } {
  const name = (workspaceName || 'your Pharos workspace').trim() || 'your Pharos workspace';
  const d = Number.isFinite(daysLeft)
    ? Math.min(SUSPEND_WARN_BEFORE_DAYS, Math.max(1, Math.round(daysLeft)))
    : SUSPEND_WARN_BEFORE_DAYS;
  const when = d === 1 ? 'tomorrow' : `in ${d} days`;
  return {
    subject: `${name} will be deleted ${when}`,
    html:
      `<p><strong>${name}</strong> has been paused for nearly ${SUSPENDED_GRACE_DAYS} days ` +
      `and is scheduled for deletion ${when}.</p>` +
      `<p>Reactivate it before then and nothing is lost: your receipts, files and settings are ` +
      `still there, exactly as you left them.</p>` +
      `<p>If you would rather not continue, you can reactivate and export everything as JSON ` +
      `first, then run Pharos yourself for free. After the ${SUSPENDED_GRACE_DAYS} days the ` +
      `workspace and its data are deleted and cannot be recovered.</p>`,
  };
}

/**
 * Plan the `$set` that enrolls an expired suspended workspace into the existing erasure lifecycle.
 * `erasureRequestedAt` is the moment the keep-window ran out and `erasureScheduledAt` is the SAME
 * instant (`graceDays: 0`) — the 30 days were the grace, and adding the erasure grace on top would
 * silently turn the promised 30 into 60. `requestedBy` is a system marker, not an account id: no
 * human requested this, and attributing it to the owner would be a lie in the audit trail.
 */
export function planSuspendedErasure(now: Date = new Date()): {
  $set: { erasureRequestedAt: Date; erasureScheduledAt: Date; erasureRequestedBy: string };
} {
  return {
    $set: {
      erasureRequestedAt: now,
      erasureScheduledAt: erasureScheduledFor(now, 0),
      erasureRequestedBy: SUSPENSION_ERASURE_ACTOR,
    },
  };
}

/** Marker written to `erasureRequestedBy` for a system-initiated (suspension-expiry) erasure. */
export const SUSPENSION_ERASURE_ACTOR = 'system:suspension-expired';

export type SuspendedSweepResult = {
  /** False when SAAS_MODE is off (the sweep didn't run at all). */
  swept: boolean;
  /** Suspended workspaces that were missing a clock and got one this run. */
  backfilled: number;
  /** Workspaces warned this run (email delivered + stamp written). */
  warned: number;
  /** Warn candidates whose email failed to deliver (not stamped, retried next run). */
  warnFailed: number;
  /** Workspaces scheduled for erasure this run (keep-window elapsed). */
  scheduled: number;
  /** Purge candidates whose scheduling threw (isolated, retried next run). */
  scheduleFailed: number;
};

const ZERO_RESULT: SuspendedSweepResult = {
  swept: false,
  backfilled: 0,
  warned: 0,
  warnFailed: 0,
  scheduled: 0,
  scheduleFailed: 0,
};

/**
 * When did this tenant actually get suspended? Best-effort archaeology for the backfill: the newest
 * `workspace.suspended` audit row, which every suspension path records (statusAudit maps the
 * transition, the webhook and the trial sweep write it). Falls back to null so the caller can use
 * `now` — restarting the clock is the safe direction to be wrong in.
 */
async function suspendedAtFromAudit(tenantId: string): Promise<Date | null> {
  return newestAuditAt(tenantId, 'workspace.suspended');
}

/** Timestamp of the newest audit row of `action` for a tenant, or null. Best-effort. */
async function newestAuditAt(tenantId: string, action: string): Promise<Date | null> {
  try {
    const { AuditEvent } = await import('@/models/AuditEvent');
    const row = await AuditEvent.findOne({ tenant: tenantId, action })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();
    return date((row as { createdAt?: Date } | null)?.createdAt ?? null);
  } catch {
    return null;
  }
}

/**
 * The suspension instant to actually measure from, or null when this workspace must be skipped
 * this run. Trusts the stored stamp unless the audit trail shows a reactivation AFTER it, in which
 * case the stamp belongs to a suspension already recovered from: fall back to the newest
 * `workspace.suspended` row, and if that is somehow also stale, return null rather than guess.
 * Skipping costs a day; guessing costs someone's data.
 */
async function effectiveSuspendedAt(
  tenantId: string,
  stored: Date | string | null | undefined
): Promise<Date | null> {
  const reactivated = await newestAuditAt(tenantId, 'workspace.reactivated');
  if (!isStaleSuspension(stored, reactivated)) return date(stored);
  const fromAudit = await suspendedAtFromAudit(tenantId);
  if (fromAudit && !isStaleSuspension(fromAudit, reactivated)) return fromAudit;
  return null;
}

/**
 * Run the suspended-workspace expiry sweep once. SaaS-only (no-op + `swept:false` when SAAS_MODE
 * off). Intended for the scheduler (daily is plenty for a 30-day window). Each tenant is isolated
 * in try/catch so one bad row never aborts the batch. Warnings are skipped wholesale when no mail
 * provider can deliver — a self-hoster with no mail has nothing to send, and warning nobody before
 * scheduling a deletion would be worse than not sweeping at all, so the ENROLL step is skipped too
 * in that case. `now` is injectable for tests.
 */
export async function runSuspendedSweep(now: Date = new Date()): Promise<SuspendedSweepResult> {
  const { saasMode } = await import('@/lib/tenancy/saasMode');
  if (!saasMode()) return { ...ZERO_RESULT };

  const { connectDB } = await import('@/lib/db');
  const { Tenant } = await import('@/models/Tenant');
  const { recordAudit, auditCtx } = await import('@/lib/tenancy/audit');
  const { sendEmail, mailerCanDeliver } = await import('@/lib/tenancy/mailer');
  const { htmlToText } = await import('@/lib/tenancy/mailer');
  const { ownerEmails } = await import('@/lib/billing/trialSweep');
  await connectDB();

  const result: SuspendedSweepResult = { ...ZERO_RESULT, swept: true };

  // 0. BACKFILL — give every un-stamped suspended workspace a clock before anything reads one.
  const unstamped = await Tenant.find(unstampedSuspendedFilter()).select('slug status').lean();
  for (const t of unstamped) {
    try {
      const id = String(t._id);
      const at = (await suspendedAtFromAudit(id)) ?? now;
      // Guards make the stamp race-safe: only stamp a still-suspended, still-unstamped row.
      const res = await Tenant.updateOne(
        { _id: id, status: 'suspended', suspendedAt: null },
        { $set: { suspendedAt: at } }
      );
      if (res.modifiedCount > 0) result.backfilled += 1;
    } catch (err) {
      console.error('[suspendedSweep] backfill failed', t?._id, err);
    }
  }

  // No delivery channel ⇒ nobody can be warned, so nothing is scheduled for deletion either.
  // Deleting data whose owner was never told is the one failure mode worth stopping the job for.
  if (!mailerCanDeliver()) return result;

  // 1. WARN — one email, WARN_BEFORE_DAYS out, stamped so it is never sent twice.
  const warnCandidates = await Tenant.find(suspendedWarningFilter(now))
    .select('slug name status suspendedAt erasureScheduledAt')
    .lean();
  for (const t of warnCandidates) {
    try {
      const id = String(t._id);
      const at = await effectiveSuspendedAt(id, t.suspendedAt);
      if (!at) continue; // stamp belongs to a recovered-from suspension; re-checked next run
      const emails = await ownerEmails(id);
      if (!emails.length) continue; // nobody to warn; leave un-stamped (an owner may be added)
      const daysLeft = daysUntilSuspendedPurge(at, now) ?? SUSPEND_WARN_BEFORE_DAYS;
      const body = suspendedWarningEmail(t.name, daysLeft);
      let delivered = false;
      for (const email of emails) {
        const r = await sendEmail({
          to: email,
          subject: body.subject,
          html: body.html,
          text: htmlToText(body.html),
        });
        delivered = delivered || r.delivered;
      }
      if (delivered) {
        await Tenant.updateOne(
          { _id: id, status: 'suspended' },
          { $set: { suspendWarnEmailedAt: now } }
        );
        result.warned += 1;
      } else {
        result.warnFailed += 1; // transient provider failure → retry next run (not stamped)
      }
    } catch (err) {
      result.warnFailed += 1;
      console.error('[suspendedSweep] warn failed', t?._id, err);
    }
  }

  // 2. ENROLL — keep-window elapsed → stamp into the erasure lifecycle, due immediately.
  const dueCandidates = await Tenant.find(suspendedPurgeFilter(now))
    .select('slug status suspendedAt erasureScheduledAt')
    .lean();
  for (const t of dueCandidates) {
    try {
      const id = String(t._id);
      // The stored stamp is not trusted for a DELETION decision: if the audit trail shows a
      // reactivation after it, this workspace recovered from that suspension and the window must
      // be measured from the later one (or the run skipped).
      const at = await effectiveSuspendedAt(id, t.suspendedAt);
      if (!at) continue;
      // Re-check purely (belt + braces vs the filter) before writing an erasure schedule.
      if (!isSuspendedPurgeDue({ status: t.status, suspendedAt: at, erasureScheduledAt: t.erasureScheduledAt }, now)) {
        continue;
      }
      // Guards: still suspended AND still without an erasure — an owner-requested erasure or a
      // reactivation between the read and the write wins.
      const res = await Tenant.updateOne(
        { _id: id, status: 'suspended', erasureScheduledAt: null },
        planSuspendedErasure(now)
      );
      if (res.modifiedCount > 0) {
        await recordAudit(auditCtx(id), {
          action: 'workspace.erasure_requested',
          target: t.slug ?? null,
          meta: {
            reason: 'suspension-expired',
            graceDays: SUSPENDED_GRACE_DAYS,
            suspendedAt: at.toISOString(),
            system: true,
          },
        });
        result.scheduled += 1;
      }
    } catch (err) {
      result.scheduleFailed += 1;
      console.error('[suspendedSweep] schedule failed', t?._id, err);
    }
  }

  return result;
}
