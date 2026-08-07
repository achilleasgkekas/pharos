// READ-ONLY loader behind /admin/deletions: every workspace currently heading for permanent
// deletion, plus the suspended ones about to join them. Reads ONLY the central registry `Tenant`
// collection — it never opens a per-tenant data database, and it writes nothing. The destructive
// counterpart lives in purgeExecute.ts and is armed by its own separate flag.
//
// Split like the rest of tenancy/: the pure classification/shaping is in
// components/saas/deletionQueueView.ts (client-safe, unit-tested); this file is the DB read and
// the two Mongo filters, kept here so the filters can be tested without a database.
import { connectDB } from '@/lib/db';
import { Tenant } from '@/models/Tenant';
import type { DeletionCandidate, SuspensionCandidate } from '@/components/saas/deletionQueueView';

/**
 * Ceiling on rows loaded per bucket. A deletion queue that has grown past this is itself the
 * finding, so the view reports the truncation instead of quietly showing a prefix.
 */
export const DELETION_QUEUE_LIMIT = 200;

/**
 * Every workspace with a pending erasure, due or not. Deliberately NOT filtered to the due ones:
 * the point of the screen is to see a deletion coming while its owner can still cancel it.
 */
export function erasurePendingFilter(): Record<string, unknown> {
  return { erasureScheduledAt: { $ne: null } };
}

/**
 * Suspended workspaces NOT yet enrolled into erasure — the feeder queue. Those already enrolled
 * are excluded because they appear in the erasure list above, and a workspace listed twice in a
 * deletion screen reads as two deletions.
 */
export function suspensionPendingFilter(): Record<string, unknown> {
  return { status: 'suspended', erasureScheduledAt: null };
}

/** Safe ISO serializer: valid Date/parseable → ISO string, everything else → null. */
function iso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Trimmed string, or null. Keeps a stray non-string out of the view model. */
function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s || null;
}

export type DeletionQueueData = {
  candidates: DeletionCandidate[];
  suspensions: SuspensionCandidate[];
  /** True when either bucket hit DELETION_QUEUE_LIMIT and the screen is showing a prefix. */
  truncated: boolean;
};

/**
 * Load both buckets. SaaS-only by nature (the self-hosted app has no Tenant docs, so this returns
 * empty), but the caller gates on SAAS_MODE first — this function does not decide who may see it.
 */
export async function loadDeletionQueue(): Promise<DeletionQueueData> {
  await connectDB();

  const [erasureRows, suspendedRows] = await Promise.all([
    Tenant.find(erasurePendingFilter())
      .select('slug name plan status dbName erasureRequestedAt erasureScheduledAt erasureRequestedBy')
      .sort({ erasureScheduledAt: 1 })
      .limit(DELETION_QUEUE_LIMIT)
      .lean(),
    Tenant.find(suspensionPendingFilter())
      .select('slug name plan suspendedAt suspendWarnEmailedAt')
      .sort({ suspendedAt: 1 })
      .limit(DELETION_QUEUE_LIMIT)
      .lean(),
  ]);

  const candidates: DeletionCandidate[] = erasureRows.map((t) => ({
    id: String(t._id),
    slug: str(t.slug),
    name: str(t.name),
    plan: str(t.plan),
    status: str(t.status),
    dbName: str(t.dbName),
    erasureRequestedAt: iso(t.erasureRequestedAt),
    erasureScheduledAt: iso(t.erasureScheduledAt),
    erasureRequestedBy: str(t.erasureRequestedBy),
  }));

  const suspensions: SuspensionCandidate[] = suspendedRows.map((t) => ({
    id: String(t._id),
    slug: str(t.slug),
    name: str(t.name),
    plan: str(t.plan),
    suspendedAt: iso(t.suspendedAt),
    suspendWarnEmailedAt: iso(t.suspendWarnEmailedAt),
  }));

  return {
    candidates,
    suspensions,
    truncated:
      erasureRows.length >= DELETION_QUEUE_LIMIT || suspendedRows.length >= DELETION_QUEUE_LIMIT,
  };
}
