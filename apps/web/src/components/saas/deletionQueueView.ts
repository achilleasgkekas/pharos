// PURE, client-safe view model for /admin/deletions — the queue of workspaces heading for
// permanent deletion. No DB, no fs, no next/*, no React: every judgement the screen makes about
// what an operator is entitled to conclude is unit-testable here.
//
// This screen exists because of a specific gap. `SAAS_PURGE_EXECUTE` is deliberately NOT armed in
// production (Needs Achilleas), which means today a workspace can pass its deadline and sit there
// forever with nothing deleting it, and the only trace is a cron response nobody reads. Arming a
// switch that drops customer databases while not knowing what it is pointed at is the wrong order,
// so this is the screen that has to exist first.
//
// Two rules it enforces, both learned from the firewall screen:
//   1. "nothing is due" and "deletion is off" are DIFFERENT answers, and an empty table renders
//      them identically. The status line is therefore never optional.
//   2. A row the purge will REFUSE (a dbName that does not match its own slug) is not a pending
//      deletion — it is a stuck one, and it silently consumes a per-run slot every single run.
//      It gets its own bucket and its own alarm, because as a normal-looking "due" row it would
//      just accumulate days-overdue while an operator waited for something that never happens.
import { graceDaysLeft, isErasureDue } from '@/lib/tenancy/erasure';
import { daysOverdue } from '@/lib/tenancy/erasurePurge';
import { isSafeTenantDbName } from '@/lib/tenancy/purgeExecute';
import { SUSPENSION_ERASURE_ACTOR, daysUntilSuspendedPurge } from '@/lib/tenancy/suspendedSweep';

/** A control-plane row as the loader hands it over (already serialized to strings). */
export type DeletionCandidate = {
  id: string;
  slug: string | null;
  name: string | null;
  plan: string | null;
  status: string | null;
  dbName: string | null;
  erasureRequestedAt: string | null;
  erasureScheduledAt: string | null;
  erasureRequestedBy: string | null;
};

/** A suspended workspace that has NOT yet been enrolled into the erasure lifecycle. */
export type SuspensionCandidate = {
  id: string;
  slug: string | null;
  name: string | null;
  plan: string | null;
  suspendedAt: string | null;
  suspendWarnEmailedAt: string | null;
};

/**
 * Where a row sits in the pipeline.
 *   scheduled — deadline in the future, still cancellable by its owner.
 *   due       — deadline passed; an armed run would drop it.
 *   refused   — deadline passed, but the purge will refuse it on the safety check. Stuck.
 */
export type DeletionStage = 'scheduled' | 'due' | 'refused';

export type DeletionEntry = {
  id: string;
  slug: string | null;
  name: string;
  plan: string | null;
  status: string | null;
  dbName: string | null;
  stage: DeletionStage;
  requestedAt: string | null;
  scheduledAt: string | null;
  /** Whole days until the deadline (stage 'scheduled'), else null. */
  daysLeft: number | null;
  /** Whole days past the deadline (stages 'due'/'refused'), else null. */
  daysOverdue: number | null;
  /** True when the erasure was enrolled by the suspension sweep, not asked for by a human. */
  systemInitiated: boolean;
  /** Account id that asked, or null. Never shown for a system-initiated row (there is no human). */
  requestedBy: string | null;
  /** Why the purge would refuse this row. Non-null exactly when stage is 'refused'. */
  refusedReason: string | null;
};

export type SuspensionEntry = {
  id: string;
  slug: string | null;
  name: string;
  plan: string | null;
  suspendedAt: string | null;
  /** Days until this workspace is enrolled into the erasure queue, or null when the clock is unset. */
  daysLeft: number | null;
  /** True once the pre-deletion warning email has gone out. */
  warned: boolean;
  /**
   * True when a suspended workspace has no `suspendedAt`. NOT an error: the sweep backfills it and
   * the 30 days start then. Shown because "no deadline yet" must not read as "deadline unknown,
   * might be tomorrow".
   */
  clockUnknown: boolean;
};

/** Display name that is never blank — a nameless row in a deletion queue is unidentifiable. */
function displayName(name: string | null, slug: string | null, id: string): string {
  const n = typeof name === 'string' ? name.trim() : '';
  if (n) return n;
  const s = typeof slug === 'string' ? slug.trim() : '';
  if (s) return s;
  return id;
}

/**
 * Classify one erasure-stamped row. Returns null when the row has no valid schedule at all — such
 * a row is not in the deletion pipeline and must not be listed as if it were.
 *
 * The `refused` branch mirrors `purgeOneWorkspace`'s own check EXACTLY (`isSafeTenantDbName`), on
 * purpose: a screen that predicts a deletion the executor would refuse is worse than no screen.
 */
export function classifyDeletion(
  row: DeletionCandidate,
  now: Date = new Date()
): DeletionEntry | null {
  if (!row || typeof row.id !== 'string' || !row.id.trim()) return null;
  if (!row.erasureScheduledAt) return null;
  const scheduled = new Date(row.erasureScheduledAt);
  if (Number.isNaN(scheduled.getTime())) return null;

  const systemInitiated = row.erasureRequestedBy === SUSPENSION_ERASURE_ACTOR;
  const due = isErasureDue(row.erasureScheduledAt, now);
  const safe = isSafeTenantDbName(row.dbName, row.slug);

  const base = {
    id: row.id.trim(),
    slug: row.slug ?? null,
    name: displayName(row.name, row.slug, row.id),
    plan: row.plan ?? null,
    status: row.status ?? null,
    dbName: row.dbName ?? null,
    requestedAt: row.erasureRequestedAt ?? null,
    scheduledAt: row.erasureScheduledAt,
    systemInitiated,
    requestedBy: systemInitiated ? null : (row.erasureRequestedBy ?? null),
  };

  if (!due) {
    return {
      ...base,
      stage: 'scheduled',
      daysLeft: graceDaysLeft(row.erasureScheduledAt, now),
      daysOverdue: null,
      refusedReason: null,
    };
  }

  // Past the deadline. The safety check decides whether this is a deletion waiting to happen or a
  // deletion that will never happen. Only the second one needs an operator today.
  if (!safe) {
    return {
      ...base,
      stage: 'refused',
      daysLeft: null,
      daysOverdue: daysOverdue(row.erasureScheduledAt, now) ?? 0,
      refusedReason: refusalReason(row.dbName, row.slug),
    };
  }

  return {
    ...base,
    stage: 'due',
    daysLeft: null,
    daysOverdue: daysOverdue(row.erasureScheduledAt, now) ?? 0,
    refusedReason: null,
  };
}

/** Operator-readable reason the safety check fails. Says what is wrong, not just that it is. */
export function refusalReason(dbName: unknown, slug: unknown): string {
  const db = typeof dbName === 'string' ? dbName.trim() : '';
  const s = typeof slug === 'string' ? slug.trim() : '';
  if (!db) return 'this workspace has no database name, so the purge cannot name what to drop';
  if (!s) return 'this workspace has no slug, so its database name cannot be verified';
  return `the database name does not match this workspace: expected tenant_${s}, found ${db}`;
}

/** Classify a suspended-but-not-yet-enrolled workspace. Null when the row is unusable. */
export function classifySuspension(
  row: SuspensionCandidate,
  now: Date = new Date()
): SuspensionEntry | null {
  if (!row || typeof row.id !== 'string' || !row.id.trim()) return null;
  const daysLeft = daysUntilSuspendedPurge(row.suspendedAt, now);
  return {
    id: row.id.trim(),
    slug: row.slug ?? null,
    name: displayName(row.name, row.slug, row.id),
    plan: row.plan ?? null,
    suspendedAt: row.suspendedAt ?? null,
    daysLeft,
    warned: Boolean(row.suspendWarnEmailedAt),
    clockUnknown: daysLeft === null,
  };
}

export type QueueTone = 'idle' | 'armed' | 'waiting' | 'alarm';

export type DeletionQueueView = {
  /** Is the automatic drop armed on THIS deployment (SAAS_MODE + SAAS_PURGE_EXECUTE)? */
  armed: boolean;
  /** Ceiling on workspaces dropped per run. 0 means the cap is being used as a kill switch. */
  maxPerRun: number;
  tone: QueueTone;
  /** One line, always rendered, that says what is actually going to happen. */
  headline: string;
  detail: string | null;
  due: DeletionEntry[];
  refused: DeletionEntry[];
  scheduled: DeletionEntry[];
  suspensions: SuspensionEntry[];
  /** How many due rows the next armed run would attempt — refused rows included, see below. */
  nextRunCount: number;
  /** Due rows the cap defers to a later run. */
  deferredCount: number;
  /** Set when refused rows are eating cap slots and starving real deletions. */
  starvationWarning: string | null;
};

/** Sort helper: worst first. Most overdue at the top, then soonest deadline. */
function byUrgency(a: DeletionEntry, b: DeletionEntry): number {
  const ao = a.daysOverdue ?? -1;
  const bo = b.daysOverdue ?? -1;
  if (ao !== bo) return bo - ao;
  const al = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
  const bl = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
  return al - bl;
}

/**
 * Build the whole screen. `armed` and `maxPerRun` are passed in rather than read from env, so this
 * stays client-safe and so a test can render every combination.
 */
export function deletionQueueView(
  candidates: DeletionCandidate[],
  suspensions: SuspensionCandidate[],
  opts: { armed: boolean; maxPerRun: number; now?: Date }
): DeletionQueueView {
  const now = opts.now ?? new Date();
  const entries: DeletionEntry[] = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const e = classifyDeletion(c, now);
    if (e) entries.push(e);
  }
  const susp: SuspensionEntry[] = [];
  for (const s of Array.isArray(suspensions) ? suspensions : []) {
    const e = classifySuspension(s, now);
    if (e) susp.push(e);
  }

  const due = entries.filter((e) => e.stage === 'due').sort(byUrgency);
  const refused = entries.filter((e) => e.stage === 'refused').sort(byUrgency);
  const scheduled = entries.filter((e) => e.stage === 'scheduled').sort(byUrgency);
  susp.sort((a, b) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER));

  const cap = Number.isFinite(opts.maxPerRun) && opts.maxPerRun > 0 ? Math.floor(opts.maxPerRun) : 0;
  // The executor slices the SCAN's targets, and a refused row is a target: it is attempted, it
  // fails, and it has already spent its slot. So the batch is drawn from due + refused together.
  const attemptable = due.length + refused.length;
  const nextRunCount = opts.armed ? Math.min(attemptable, cap) : 0;
  const deferredCount = opts.armed ? Math.max(0, attemptable - nextRunCount) : 0;

  return {
    armed: opts.armed,
    maxPerRun: cap,
    tone: tone(opts.armed, due.length, refused.length),
    headline: headline(opts.armed, cap, due.length, refused.length, nextRunCount, deferredCount),
    detail: detail(opts.armed, cap, due.length, refused.length),
    due,
    refused,
    scheduled,
    suspensions: susp,
    nextRunCount,
    deferredCount,
    starvationWarning: starvation(refused.length, due.length, cap, opts.armed),
  };
}

function tone(armed: boolean, dueCount: number, refusedCount: number): QueueTone {
  if (refusedCount > 0) return 'alarm';
  if (!armed) return dueCount > 0 ? 'waiting' : 'idle';
  return dueCount > 0 ? 'armed' : 'idle';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function headline(
  armed: boolean,
  cap: number,
  dueCount: number,
  refusedCount: number,
  nextRunCount: number,
  deferredCount: number
): string {
  if (!armed) {
    if (dueCount === 0 && refusedCount === 0) {
      return 'Automatic deletion is off. Nothing is past its deadline.';
    }
    return `Automatic deletion is off — ${plural(
      dueCount + refusedCount,
      'workspace is',
      'workspaces are'
    )} past the deadline and nothing is deleting them.`;
  }
  if (cap === 0) {
    return 'Automatic deletion is armed but the per-run cap is 0 — nothing will be deleted.';
  }
  if (dueCount === 0 && refusedCount === 0) {
    return 'Automatic deletion is armed. Nothing is past its deadline.';
  }
  const tail = deferredCount > 0 ? `, ${deferredCount} wait for a later run` : '';
  return `Automatic deletion is armed — the next run attempts ${plural(
    nextRunCount,
    'workspace',
    'workspaces'
  )}${tail}.`;
}

function detail(armed: boolean, cap: number, dueCount: number, refusedCount: number): string | null {
  if (!armed) {
    const why =
      'The deletion itself needs SAAS_PURGE_EXECUTE=1 in the environment, separately from SAAS_MODE. Until it is set, the cron run scans and reports and deletes nothing.';
    if (dueCount === 0 && refusedCount === 0) return why;
    return `${why} These workspaces stay exactly as they are, including their data, until it is armed or their owners cancel.`;
  }
  if (cap === 0) {
    return 'SAAS_PURGE_MAX_PER_RUN is 0, which the executor honours as a kill switch. Deletions resume when it is raised, without a redeploy.';
  }
  return `At most ${plural(
    cap,
    'workspace',
    'workspaces'
  )} is dropped per run. Which ones go first is not fixed, so treat this as the queue, not the running order.`;
}

/**
 * Refused rows are attempted, fail, and spend their slot anyway. With enough of them the cap is
 * consumed before a real deletion is reached and the queue stops draining while looking busy —
 * the failure mode this screen exists to make impossible to miss.
 */
function starvation(
  refusedCount: number,
  dueCount: number,
  cap: number,
  armed: boolean
): string | null {
  if (refusedCount === 0) return null;
  const stuck = `${plural(refusedCount, 'workspace', 'workspaces')} past the deadline cannot be deleted: the safety check refuses the database name. This never resolves on its own.`;
  if (!armed) return stuck;
  if (cap > 0 && refusedCount >= cap && dueCount > 0) {
    return `${stuck} They also fill every one of the ${cap} slots in each run, so the ${plural(
      dueCount,
      'workspace',
      'workspaces'
    )} genuinely waiting to be deleted may never be reached.`;
  }
  return `${stuck} Each one still spends a slot in every run.`;
}
