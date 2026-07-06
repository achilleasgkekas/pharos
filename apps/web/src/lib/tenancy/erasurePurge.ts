// GDPR Art. 17 erasure PURGE scaffold — the REPORT-ONLY half of the deletion lifecycle.
// Increment 44 gave the request/cancel lifecycle (lib/tenancy/erasure.ts: stamps the markers,
// `erasureDueFilter` selects workspaces past their grace window). This module finds those due
// workspaces and describes what WOULD be purged — but performs NO destructive action.
//
// Why report-only: dropping a tenant's isolated data database (`useDb(dbName).dropDatabase()`)
// plus its Tenant/Membership control-plane rows is irreversible. That drop is a manual/gated
// flow, NEVER performed by an automated routine. This scaffold gives the scheduler a safe way
// to SURFACE due workspaces (for a human to review and confirm) without ever deleting anything.
// The result is always `dryRun: true`.
//
// Split into PURE planners (unit-tested, no DB/imports beyond erasure.ts's pure helpers) and one
// impure `runErasurePurgeScan` (loads due tenants, projects them — read-only). A fixed `now` is
// injectable everywhere for deterministic tests.
//
// SaaS-only: `runErasurePurgeScan` is a no-op (`scanned:false`) when SAAS_MODE is off — the
// self-hosted (AGPL) app never creates Tenant docs, never schedules erasure. Zero effect on the
// single-user path.
import { isErasureDue, erasureDueFilter, graceDaysLeft } from './erasure';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A due-workspace row as loaded from the control-plane Tenant collection. */
export type PurgeCandidate = {
  id: string;
  slug?: string | null;
  dbName?: string | null;
  erasureRequestedAt?: Date | string | null;
  erasureScheduledAt?: Date | string | null;
  erasureRequestedBy?: string | null;
};

/** A workspace confirmed due for permanent deletion — what WOULD be dropped (no drop happens). */
export type PurgeTarget = {
  id: string;
  slug: string | null;
  /** Name of the isolated data database that a real purge would drop. Never blank in a target. */
  dbName: string;
  requestedAt: string | null;
  scheduledAt: string | null;
  requestedBy: string | null;
  /** Whole days the workspace is past its scheduled purge instant (floored, ≥0). */
  daysOverdue: number;
};

/** ISO-8601, or null for a missing/invalid date. Local so the module stays dependency-light. */
function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/**
 * Whole days a workspace is PAST its scheduled purge instant, from `now`. Rounded DOWN (a purge
 * that just came due reports 0 days overdue) and clamped at 0. Null when not yet due or when there
 * is no valid schedule — the mirror of `graceDaysLeft`, which counts the days remaining before.
 */
export function daysOverdue(
  scheduledAt: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!scheduledAt) return null;
  const t = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(t.getTime())) return null;
  const ms = now.getTime() - t.getTime();
  if (ms < 0) return null; // not yet due
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Project a single candidate into a purge TARGET, or null when it must not be purged. Returns null
 * when: the grace window has not elapsed (`isErasureDue` false), the id is blank, or the `dbName`
 * is blank — a real purge names the database to drop by `dbName`, so a target we cannot safely name
 * is refused (defence-in-depth, even though the loader filters on a set `erasureScheduledAt`).
 */
export function purgeTarget(candidate: PurgeCandidate, now: Date = new Date()): PurgeTarget | null {
  if (!candidate) return null;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  if (!id) return null;
  const dbName = typeof candidate.dbName === 'string' ? candidate.dbName.trim() : '';
  if (!dbName) return null;
  if (!isErasureDue(candidate.erasureScheduledAt, now)) return null;
  return {
    id,
    slug: candidate.slug ?? null,
    dbName,
    requestedAt: iso(candidate.erasureRequestedAt),
    scheduledAt: iso(candidate.erasureScheduledAt),
    requestedBy: candidate.erasureRequestedBy ?? null,
    daysOverdue: daysOverdue(candidate.erasureScheduledAt, now) ?? 0,
  };
}

/**
 * Batch planner: given due-workspace rows, return the purge targets. PURE — the caller does the DB
 * read; this never drops anything. Rows that are not genuinely due, or that lack an id/dbName, are
 * skipped defensively so a report never names an un-purgeable (or unsafe-to-name) workspace.
 */
export function planErasurePurge(candidates: PurgeCandidate[], now: Date = new Date()): PurgeTarget[] {
  if (!Array.isArray(candidates)) return [];
  const targets: PurgeTarget[] = [];
  for (const c of candidates) {
    const t = purgeTarget(c, now);
    if (t) targets.push(t);
  }
  return targets;
}

export type ErasurePurgeScanResult = {
  /** False when SAAS_MODE is off (the scan didn't run at all). */
  scanned: boolean;
  /** Always true — this scaffold NEVER drops a database; it only reports. */
  dryRun: true;
  /** Number of workspaces past their grace window and awaiting a (manual) purge. */
  due: number;
  /** The purge targets — what a confirmed drop WOULD remove. No side effects were taken. */
  targets: PurgeTarget[];
};

const ZERO_RESULT: ErasurePurgeScanResult = { scanned: false, dryRun: true, due: 0, targets: [] };

/**
 * Scan the control plane for workspaces due for permanent deletion and REPORT them. SaaS-only
 * (no-op + `scanned:false` when SAAS_MODE off). Read-only: loads the due Tenant rows via
 * `erasureDueFilter` and projects them with `planErasurePurge`. Performs NO destructive action —
 * `dryRun` is always true. Intended for a scheduler to surface due workspaces for human review;
 * the actual `dropDatabase()` remains a separate, manual/gated flow (Needs Achilleas). `now` is
 * injectable for tests.
 */
export async function runErasurePurgeScan(now: Date = new Date()): Promise<ErasurePurgeScanResult> {
  const { saasMode } = await import('@/lib/tenancy/saasMode');
  if (!saasMode()) return { ...ZERO_RESULT };

  const { connectDB } = await import('@/lib/db');
  const { Tenant } = await import('@/models/Tenant');
  await connectDB();

  const rows = await Tenant.find(erasureDueFilter(now))
    .select('slug dbName erasureRequestedAt erasureScheduledAt erasureRequestedBy')
    .lean();

  const candidates: PurgeCandidate[] = rows.map((t) => ({
    id: String(t._id),
    slug: t.slug ?? null,
    dbName: t.dbName ?? null,
    erasureRequestedAt: t.erasureRequestedAt ?? null,
    erasureScheduledAt: t.erasureScheduledAt ?? null,
    erasureRequestedBy: t.erasureRequestedBy ?? null,
  }));

  const targets = planErasurePurge(candidates, now);
  return { scanned: true, dryRun: true, due: targets.length, targets };
}

// graceDaysLeft is re-exported for symmetry with callers that want "N days left" vs "N overdue".
export { graceDaysLeft };
