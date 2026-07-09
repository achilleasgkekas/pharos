// Superadmin LIVE on-demand db.stats() reader for ONE tenant (TODO §8 "dbStats() size
// metering", increment 52).
//
// Increments 48-51 built the superadmin console as read endpoints sourced ENTIRELY from the
// central registry (Tenant/Membership/Account/Usage). The tenant DETAIL usage rollup (#50)
// deliberately showed only the LAST SAMPLED storage figure from the control-plane Usage
// ledger, and noted the missing piece: a LIVE, on-demand footprint reader that queries a
// tenant's own data database right now, instead of waiting for the periodic `sampleAllTenants`
// cron. This module closes that gap — the operator can pull a fresh footprint for one
// workspace on request.
//
// SAFETY / read-only: this is the FIRST on-demand consumer of `readDbStats` (previously only
// the cron sampler called it). `db.stats()` is a diagnostic command — it reads collection/
// index size metadata, NOT the documents themselves — and this reader NEVER writes: unlike
// `sampleTenantStorage`, it does not push a sample into the Usage ledger, so an operator
// merely VIEWING a workspace's footprint has zero side effects. Read-only on the data plane,
// zero writes anywhere.
//
// BACKWARD-COMPATIBILITY / OSS PARITY: only reachable through the SaaS + superadmin gated
// route. When SAAS_MODE is off the route is 404 and this never runs. Resolution is by a
// registry `Tenant` row, which the implicit self-hosted DEFAULT_TENANT never has, so there is
// no path here that ever runs db.stats() against the default (self-hosted) database.
//
// Split as elsewhere in tenancy/: every function except `readLiveDbStatsForAdmin` is pure (no
// DB, no next/*) so the shaping/envelope logic is fully unit-testable. NODE-ONLY (Mongoose +
// native driver via readDbStats) — never import from the edge runtime.
import { connectDB } from '@/lib/db';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { readDbStats, billedBytes, type RawDbStats } from '@/lib/billing/dbStats';
import { tenantFileBytes } from '@/lib/billing/fileStorage';
import type { TenantContext, TenantPlan, TenantStatus } from '@/lib/tenancy/context';

/** Defensive non-negative integer: NaN/±Infinity/negative → 0, floored. */
function bytes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export type AdminLiveDbStats = {
  /** Uncompressed logical size of all documents (bytes). */
  dataSize: number;
  /** Physical on-disk collection storage (compressed) (bytes). */
  storageSize: number;
  /** Physical on-disk index storage (bytes). */
  indexSize: number;
  /** Document count across the tenant's data database. */
  objects: number;
  /** Billed MongoDB footprint (storageSize + indexSize) — same definition the sampler bills. */
  dbBytes: number;
  /** On-disk binary-file footprint for the tenant (0 until the storage layer is tenant-aware). */
  fileBytes: number;
  /** Total billed footprint (dbBytes + fileBytes) — what a storage quota is checked against. */
  totalBytes: number;
};

/**
 * Project a raw MongoDB `db.stats()` document + a file-byte figure into a display-safe,
 * fully-coerced operator view. A null `raw` (no live db handle) yields an all-zero db footprint
 * while still counting file bytes. All numeric fields are floored at 0; a garbage/negative
 * stored value can never surface. PURE.
 */
export function summarizeLiveDbStats(
  raw: RawDbStats | null,
  fileBytes: unknown
): AdminLiveDbStats {
  const dataSize = bytes(raw?.dataSize);
  const storageSize = bytes(raw?.storageSize);
  const indexSize = bytes(raw?.indexSize);
  const objects = bytes(raw?.objects);
  // Single source of truth for "billed db bytes" — call billedBytes with the COERCED values
  // so a negative/NaN raw field can't slip into the total.
  const dbBytes = billedBytes({ storageSize, indexSize });
  const fb = bytes(fileBytes);
  return {
    dataSize,
    storageSize,
    indexSize,
    objects,
    dbBytes,
    fileBytes: fb,
    totalBytes: dbBytes + fb,
  };
}

export type AdminDbStatsEnvelope = {
  format: 'pharos.admin-tenant-dbstats';
  version: 1;
  /** When this live read was taken (ISO). */
  generatedAt: string;
  slug: string;
  dbName: string;
  /** True when a live db.stats() actually ran; false when the connection had no db handle. */
  measured: boolean;
  live: AdminLiveDbStats;
};

/**
 * Build the stable on-the-wire envelope for a live db-stats read. `raw === null` means the
 * live read could not run (no native db handle) → `measured:false` with a zero db footprint.
 * PURE: an invalid/absent `generatedAt` collapses to the epoch, non-string slug/dbName to ''.
 */
export function buildLiveDbStats(args: {
  slug: unknown;
  dbName: unknown;
  raw: RawDbStats | null;
  fileBytes: unknown;
  generatedAt?: Date;
}): AdminDbStatsEnvelope {
  const gen =
    args.generatedAt instanceof Date && !Number.isNaN(args.generatedAt.getTime())
      ? args.generatedAt
      : new Date(0);
  return {
    format: 'pharos.admin-tenant-dbstats',
    version: 1,
    generatedAt: gen.toISOString(),
    slug: typeof args.slug === 'string' ? args.slug : '',
    dbName: typeof args.dbName === 'string' ? args.dbName : '',
    measured: args.raw != null,
    live: summarizeLiveDbStats(args.raw, args.fileBytes),
  };
}

/**
 * The ONLY impure reader: resolve a tenant by slug from the central registry, then take a LIVE,
 * read-only footprint of its data database (db.stats + on-disk file bytes). Returns null for an
 * unknown slug so the caller can 404. Never writes; never runs against the default tenant (it
 * has no registry row). SaaS + superadmin gated by the route.
 */
export async function readLiveDbStatsForAdmin(
  slug: string,
  now: Date = new Date()
): Promise<AdminDbStatsEnvelope | null> {
  await connectDB();
  const t = (await Tenant.findOne({ slug })
    .select('slug dbName plan status')
    .lean()) as unknown as TenantDoc | null;
  if (!t) return null;

  const ctx: TenantContext = {
    tenantId: String(t._id),
    slug: t.slug,
    dbName: t.dbName,
    plan: (t.plan as TenantPlan) ?? 'free',
    status: (t.status as TenantStatus) ?? 'trialing',
    isDefault: false,
  };

  // A single failing tenant db must not throw an unhandled 500 with a stack; the route's
  // saasGuard already maps thrown errors to a uniform { error }. We surface a not-measured
  // envelope instead so the operator sees "which workspace couldn't be read" rather than a
  // generic failure, mirroring how sampleAllTenants isolates a bad database.
  let raw: RawDbStats | null = null;
  try {
    raw = await readDbStats(ctx);
  } catch {
    raw = null;
  }
  let fileBytes = 0;
  try {
    fileBytes = await tenantFileBytes(ctx);
  } catch {
    fileBytes = 0;
  }

  return buildLiveDbStats({ slug: t.slug, dbName: t.dbName, raw, fileBytes, generatedAt: now });
}
