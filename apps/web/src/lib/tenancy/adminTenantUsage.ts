// Superadmin READ-ONLY usage summary for a single tenant (TODO §8 "Superadmin console",
// increment 50). Sourced ENTIRELY from the CONTROL-PLANE `Usage` ledger, which lives in the
// central registry database (the default MONGO_URI connection) — NOT the tenant's own data
// database. This is the deliberately-safe form of the "per-tenant usage in detail" step noted
// in SAAS_PROGRESS.md: it exposes the figures that dbStats/aiMeter already sampled into the
// ledger, so the operator gets a footprint/AI-consumption view WITHOUT this module ever opening
// a per-tenant data db or running db.stats() itself. Read-only; never writes.
//
// Only meaningful when SAAS_MODE is on. The self-hosted DEFAULT_TENANT never writes Usage docs,
// so this reader returns an empty summary for it (no rows) — zero effect on the OSS app.
//
// Split as elsewhere in tenancy/: every function except `readTenantUsageForAdmin` is pure (no
// DB, no next/*) so the shaping/rollup logic is fully unit-testable.
import { connectDB } from '@/lib/db';
import { Usage, type UsageDoc } from '@/models/Usage';

/** Safe ISO serializer: valid Date/parseable → ISO string, everything else → null. */
function iso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Defensive non-negative integer: NaN/±Infinity/negative → 0, floored. */
function count(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export type AdminUsagePeriod = {
  /** Billing month "YYYY-MM". */
  period: string;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  /** Estimated AI spend this month, currency micros (millionths of one unit, integer). */
  aiCostMicros: number;
  /** Latest storage footprint snapshot for this period (gauge, bytes). */
  storageBytes: number;
  /** When storageBytes was last refreshed (ISO), or null if never sampled. */
  storageMeasuredAt: string | null;
};

/**
 * Project one Usage ledger doc to a display-safe operator view. All numeric fields are
 * defensively coerced to non-negative integers; a garbage/negative stored value can never
 * surface. PURE.
 */
export function summarizeUsagePeriod(
  doc: Partial<UsageDoc> & { period?: unknown; storageMeasuredAt?: unknown }
): AdminUsagePeriod {
  return {
    period: typeof doc.period === 'string' ? doc.period : '',
    aiCalls: count(doc.aiCalls),
    aiInputTokens: count(doc.aiInputTokens),
    aiOutputTokens: count(doc.aiOutputTokens),
    aiCostMicros: count(doc.aiCostMicros),
    storageBytes: count(doc.storageBytes),
    storageMeasuredAt: iso(doc.storageMeasuredAt),
  };
}

export type AdminUsageSummary = {
  /** Number of ledger rows (billing months) returned. */
  periodCount: number;
  /** Sums of the monotonic per-month counters across the returned window. */
  totals: {
    aiCalls: number;
    aiInputTokens: number;
    aiOutputTokens: number;
    aiCostMicros: number;
  };
  /** Most-recent period label present in the window, or null when empty. */
  latestPeriod: string | null;
  /** Storage is a GAUGE (not additive): the bytes from the most-recently-MEASURED period. */
  latestStorageBytes: number;
  latestStorageMeasuredAt: string | null;
  /** Per-month rows, most-recent period first. */
  periods: AdminUsagePeriod[];
};

/**
 * Roll up a set of Usage ledger docs into the operator summary. Sorts periods most-recent
 * first (string compare works for "YYYY-MM"), sums the monotonic AI counters, and picks the
 * storage gauge from the period with the newest `storageMeasuredAt` (storage is overwritten,
 * not accumulated, so summing it would be wrong). PURE — no DB, tally derived, never trusted.
 */
export function buildUsageSummary(docs: readonly (Partial<UsageDoc> | null | undefined)[]): AdminUsageSummary {
  const periods = (docs ?? [])
    .filter((d): d is Partial<UsageDoc> => d != null)
    .map((d) => summarizeUsagePeriod(d as Partial<UsageDoc>))
    .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));

  const totals = { aiCalls: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCostMicros: 0 };
  let latestStorageBytes = 0;
  let latestStorageMeasuredAt: string | null = null;
  for (const p of periods) {
    totals.aiCalls += p.aiCalls;
    totals.aiInputTokens += p.aiInputTokens;
    totals.aiOutputTokens += p.aiOutputTokens;
    totals.aiCostMicros += p.aiCostMicros;
    // Gauge: keep the storage snapshot with the newest measurement timestamp.
    if (
      p.storageMeasuredAt &&
      (latestStorageMeasuredAt === null || p.storageMeasuredAt > latestStorageMeasuredAt)
    ) {
      latestStorageMeasuredAt = p.storageMeasuredAt;
      latestStorageBytes = p.storageBytes;
    }
  }

  return {
    periodCount: periods.length,
    totals,
    latestPeriod: periods.length ? periods[0].period : null,
    latestStorageBytes,
    latestStorageMeasuredAt,
    periods,
  };
}

/**
 * READ-ONLY usage summary for a tenant by its registry id. The only impure function here.
 * Reads at most `limit` most-recent ledger rows from the CONTROL-PLANE Usage collection and
 * rolls them up. Touches ONLY the central registry; never a per-tenant data database, never
 * writes. `limit` is clamped to [1, 60] months (defensive; default 12).
 */
export async function readTenantUsageForAdmin(
  tenantId: string,
  limit: number = 12
): Promise<AdminUsageSummary> {
  const lim = Math.min(60, Math.max(1, Math.floor(Number(limit) || 12)));
  await connectDB();
  const docs = (await Usage.find({ tenant: tenantId })
    .select('period aiCalls aiInputTokens aiOutputTokens aiCostMicros storageBytes storageMeasuredAt')
    .sort({ period: -1 })
    .limit(lim)
    .lean()) as unknown as Partial<UsageDoc>[];
  return buildUsageSummary(docs);
}
