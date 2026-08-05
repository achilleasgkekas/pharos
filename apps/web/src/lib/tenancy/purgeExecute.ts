// THE DESTRUCTIVE HALF of the erasure lifecycle: this module actually drops a tenant's data.
// Everything else in the codebase stops short of this on purpose, so read the guards before the
// happy path — the guards ARE the feature.
//
// Achilleas armed this on 2026-08-05 (ASK pharos-saas-core-20260805-0840, option (a)): automatic,
// but behind a SECOND flag that is off by default. `SAAS_MODE` says "this deployment is a SaaS";
// `SAAS_PURGE_EXECUTE` says "and it may delete customer data without a human present". Two
// independent switches, because the day someone copies a production env file to a staging box,
// one of them being off is what stops that box from deleting real workspaces.
//
// WHAT IT DELETES, in this order, and why the order matters:
//   1. the audit row FIRST, while the tenant still exists — a deletion that leaves no record is
//      indistinguishable from data loss, and after step 4 there is nothing left to attach it to.
//   2. the tenant's FILES (receipts, statements, photos) — before the database, because the
//      database is what tells us which files belong to this tenant. Drop it first and the files
//      are orphaned on disk forever, which is the opposite of an erasure.
//   3. the isolated data DATABASE.
//   4. the control-plane rows: Memberships, then the Tenant itself.
// Audit events are deliberately KEPT. They hold no receipt data, and they are the only remaining
// proof that the deletion was requested, scheduled and carried out.
//
// FAILURE POLICY: each tenant is isolated, and a step that throws ABORTS that tenant rather than
// continuing to the next step. A half-purge that reports success is worse than a failure that
// retries tomorrow: the remaining steps are all idempotent, so retrying is safe, whereas a
// database dropped without its files removed leaves data nobody can find to delete.
import { isErasureDue } from './erasure';

/** The prefix `provision.dbNameForSlug` gives every tenant database. Duplicated here rather than
 *  imported so this module stays free of model/DB imports; a test asserts the two never drift. */
export const TENANT_DB_PREFIX = 'tenant_';

/** Databases that must never be dropped no matter what a Tenant row claims its dbName is. */
const FORBIDDEN_DB_NAMES = new Set(['admin', 'local', 'config', 'test', '']);

/** A workspace slug as this system mints them: lowercase alphanumerics and dashes, starting with
 *  an alphanumeric. Deliberately stricter than "what Mongo accepts" — the question here is not
 *  "is this a legal database name" but "is this unmistakably one of OUR tenant databases". */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,50}$/;

/**
 * May we drop this database? PURE, and the single most important predicate in the codebase.
 *
 * Returns true ONLY when the name is exactly `tenant_<slug>` for the slug of the tenant we are
 * purging. That equality is what makes a corrupted, mistyped or hostile `dbName` in a Tenant row
 * unable to point the drop at anything else: the registry database, `admin`, another tenant, or a
 * name with characters Mongo would interpret. If the two disagree, we refuse and the operator
 * looks at it by hand.
 */
export function isSafeTenantDbName(dbName: unknown, slug: unknown): boolean {
  if (typeof dbName !== 'string' || typeof slug !== 'string') return false;
  const db = dbName.trim();
  const s = slug.trim();
  if (!db || !s) return false;
  if (FORBIDDEN_DB_NAMES.has(db.toLowerCase())) return false;
  if (!SLUG_RE.test(s)) return false;
  if (db !== `${TENANT_DB_PREFIX}${s}`) return false;
  // Mongo's own limit; a name this long cannot have come from dbNameForSlug + a valid slug, but
  // the check costs nothing and a rejected purge is always recoverable.
  if (db.length > 63) return false;
  return true;
}

/** Is the automatic drop armed? Requires SaaS mode AND the explicit second opt-in. Anything other
 *  than an unambiguous truthy value is OFF: a flag that guards deletion must not be enabled by a
 *  typo, so "yes"/"on"/"maybe" do not count. */
export function purgeExecuteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.SAAS_PURGE_EXECUTE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Default ceiling on workspaces purged per run. A bug that makes everything look due deletes at
 *  most this many before someone notices, and the rest are still there tomorrow. */
export const DEFAULT_PURGE_MAX_PER_RUN = 5;

/** Per-run cap, overridable by env. A missing/garbage/negative value falls back to the default;
 *  0 is honoured as "purge nothing" so the cap can be used as a kill switch without a redeploy. */
export function purgeMaxPerRun(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.SAAS_PURGE_MAX_PER_RUN ?? '').trim();
  if (!raw) return DEFAULT_PURGE_MAX_PER_RUN;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PURGE_MAX_PER_RUN;
  return Math.floor(n);
}

export type PurgeOutcome = {
  id: string;
  slug: string | null;
  /** True only when every step completed. A false here with no `error` cannot happen. */
  purged: boolean;
  filesDeleted: number;
  fileErrors: number;
  membershipsDeleted: number;
  /** Why this workspace was skipped or failed. Null on success. */
  error: string | null;
};

export type PurgeExecuteResult = {
  /** False when SaaS mode is off, or the execute flag is not armed (the normal state). */
  executed: boolean;
  /** Why nothing ran, when `executed` is false. */
  reason: string | null;
  purged: number;
  failed: number;
  /** Due workspaces left for the next run because of the per-run cap. */
  deferred: number;
  outcomes: PurgeOutcome[];
};

const ZERO: PurgeExecuteResult = {
  executed: false,
  reason: null,
  purged: 0,
  failed: 0,
  deferred: 0,
  outcomes: [],
};

/**
 * Drop every workspace whose erasure grace window has elapsed. SaaS-only AND opt-in — returns
 * `executed:false` with a reason when either switch is off, which is the default state and the
 * only state the self-hosted app can ever be in.
 *
 * Each tenant is re-read and re-validated immediately before its own drop, not trusted from the
 * scan: an owner can cancel an erasure, or a workspace can be reactivated, in the seconds between
 * listing and deleting, and that cancellation must win. `now` is injectable for tests.
 */
export async function runErasurePurgeExecute(now: Date = new Date()): Promise<PurgeExecuteResult> {
  const { saasMode } = await import('@/lib/tenancy/saasMode');
  if (!saasMode()) return { ...ZERO, reason: 'SAAS_MODE is off' };
  if (!purgeExecuteEnabled()) return { ...ZERO, reason: 'SAAS_PURGE_EXECUTE is not armed' };

  const cap = purgeMaxPerRun();
  if (cap <= 0) return { ...ZERO, executed: true, reason: 'SAAS_PURGE_MAX_PER_RUN is 0' };

  const { runErasurePurgeScan } = await import('./erasurePurge');
  const scan = await runErasurePurgeScan(now);
  if (!scan.targets.length) return { ...ZERO, executed: true };

  const batch = scan.targets.slice(0, cap);
  const result: PurgeExecuteResult = {
    ...ZERO,
    executed: true,
    deferred: Math.max(0, scan.targets.length - batch.length),
    outcomes: [],
  };

  for (const target of batch) {
    const outcome = await purgeOneWorkspace(target.id, now);
    result.outcomes.push(outcome);
    if (outcome.purged) result.purged += 1;
    else result.failed += 1;
  }

  return result;
}

/**
 * Purge ONE workspace, re-verifying everything first. Never throws: a failure is returned as an
 * outcome so one bad workspace cannot abort the batch, and so the reason survives in the response
 * the scheduler logs.
 */
async function purgeOneWorkspace(tenantId: string, now: Date): Promise<PurgeOutcome> {
  const base: PurgeOutcome = {
    id: tenantId,
    slug: null,
    purged: false,
    filesDeleted: 0,
    fileErrors: 0,
    membershipsDeleted: 0,
    error: null,
  };

  try {
    const { connectDB } = await import('@/lib/db');
    const { Tenant } = await import('@/models/Tenant');
    await connectDB();

    // Re-read FRESH. The scan's copy is seconds old, and "the owner cancelled the erasure in
    // those seconds" is exactly the case that must not be steamrolled.
    const tenant = await Tenant.findById(tenantId)
      .select('slug dbName status erasureScheduledAt erasureRequestedAt erasureRequestedBy')
      .lean();
    if (!tenant) return { ...base, error: 'tenant no longer exists' };

    const slug = typeof tenant.slug === 'string' ? tenant.slug : null;
    const dbName = typeof tenant.dbName === 'string' ? tenant.dbName : '';

    if (!isErasureDue(tenant.erasureScheduledAt, now)) {
      return { ...base, slug, error: 'no longer due (erasure cancelled or rescheduled)' };
    }
    if (!isSafeTenantDbName(dbName, slug)) {
      // Refusing is the correct outcome, not a fallback: a dbName that does not match its own
      // slug means something is wrong that a human needs to look at before anything is dropped.
      return { ...base, slug, error: `refusing to drop unsafe database name: ${JSON.stringify(dbName)}` };
    }

    const { recordAudit, auditCtx } = await import('./audit');
    const { collectWorkspaceFileRefs } = await import('./workspaceFiles');
    const { deleteFile } = await import('@/lib/storage');
    const { getTenantConnection } = await import('./connection');
    const { Membership } = await import('@/models/Membership');

    const ctx = { isDefault: false, tenantId, dbName, slug: slug ?? '' };

    // Collect file references BEFORE anything is destroyed — this reads the tenant's database.
    let refs: string[] = [];
    try {
      refs = await collectWorkspaceFileRefs(ctx as never);
    } catch (err) {
      return { ...base, slug, error: `could not enumerate files, aborting: ${(err as Error).message}` };
    }

    // 1. The record, while there is still something to attach it to.
    await recordAudit(auditCtx(tenantId), {
      action: 'workspace.purged',
      target: slug,
      meta: {
        dbName,
        files: refs.length,
        requestedAt: tenant.erasureRequestedAt ? new Date(tenant.erasureRequestedAt).toISOString() : null,
        requestedBy: tenant.erasureRequestedBy ?? null,
        purgedAt: now.toISOString(),
      },
    });

    // 2. Files. Counted, not assumed: a file that refuses to delete must not be reported as gone.
    let filesDeleted = 0;
    let fileErrors = 0;
    for (const ref of refs) {
      try {
        await deleteFile(ref);
        filesDeleted += 1;
      } catch {
        fileErrors += 1;
      }
    }
    if (fileErrors > 0) {
      // Stop before the database drop. The database is the only map back to these files; drop it
      // now and the leftovers are unfindable. Every step so far is idempotent, so tomorrow's run
      // retries cleanly.
      return {
        ...base,
        slug,
        filesDeleted,
        fileErrors,
        error: `${fileErrors} file(s) could not be deleted; database left intact for retry`,
      };
    }

    // 3. The isolated data database.
    const conn = await getTenantConnection(dbName);
    await conn.dropDatabase();

    // 4. Control plane. Memberships first: a Tenant row with no memberships is a visible orphan
    // in the console, whereas memberships pointing at a deleted tenant are invisible.
    const memberships = await Membership.deleteMany({ tenant: tenantId });
    await Tenant.deleteOne({ _id: tenantId });

    return {
      ...base,
      slug,
      purged: true,
      filesDeleted,
      fileErrors: 0,
      membershipsDeleted: memberships?.deletedCount ?? 0,
    };
  } catch (err) {
    console.error('[purgeExecute] failed', tenantId, err);
    return { ...base, error: (err as Error).message?.slice(0, 200) || 'unknown error' };
  }
}
