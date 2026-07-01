// Per-tenant storage sampling (increment 8, TODO #10).
//
// The storage quota (entitlements.storageBytes) needs a real number to check against.
// This module measures a tenant's MongoDB data-plane footprint via the native driver's
// `db.stats()` and feeds it into the control-plane Usage ledger (setStorageBytes). A
// scheduler (cron route below the helper's callers) runs `sampleAllTenants` periodically
// so `checkStorageQuota` has fresh figures.
//
// BACKWARD-COMPATIBILITY / OSS PARITY (critical): sampling is a SaaS-only concern. When
// SAAS_MODE is off, or for the implicit self-hosted DEFAULT_TENANT, every DB-touching
// function here is a NO-OP that writes nothing. The self-hosted app never runs db.stats(),
// never writes a Usage doc. Read-only on the data plane; the only WRITE is to the
// control-plane Usage collection (via setStorageBytes).
//
// SCOPE LIMITATION (documented, see SAAS_PROGRESS.md → Needs Achilleas): db.stats() only
// measures the tenant's Mongo footprint (documents + indexes). Binary files (receipt PDFs,
// item photos) live on disk / a remote backend, NOT in Mongo, so they are NOT counted here
// yet. A future increment must add on-disk/remote file-byte accounting to setStorageBytes
// for the storage quota to reflect the true footprint.
//
// This module is NODE-ONLY (Mongoose + native driver). Never import from the edge runtime.
import { connectDB } from '@/lib/db';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { tenantDb } from '@/lib/tenancy/connection';
import { saasMode } from '@/lib/tenancy/saasMode';
import type { TenantContext, TenantPlan, TenantStatus } from '@/lib/tenancy/context';
import { setStorageBytes } from './usage';

// ---------------------------------------------------------------------------------------
// PURE helper (no DB, unit-tested)
// ---------------------------------------------------------------------------------------

/** The raw fields we read off a MongoDB `db.stats()` document (all optional/defensive). */
export type RawDbStats = {
  dataSize?: number;
  storageSize?: number;
  indexSize?: number;
  objects?: number;
};

/**
 * The billed storage footprint from a db.stats() document. We bill the PHYSICAL on-disk
 * footprint (compressed collection storage + indexes), not the uncompressed `dataSize`,
 * because that is what actually consumes the tenant's storage allowance on the server.
 * Missing fields default to 0; the result is floored at 0.
 */
export function billedBytes(stats: RawDbStats): number {
  return Math.max(0, (stats.storageSize ?? 0) + (stats.indexSize ?? 0));
}

// ---------------------------------------------------------------------------------------
// DB-touching functions (SaaS-only; no-op for the default tenant / SAAS_MODE off)
// ---------------------------------------------------------------------------------------

/** True when this context should be sampled at all (SaaS on + a real, non-default tenant). */
function isSampleable(ctx: TenantContext): boolean {
  return saasMode() && !ctx.isDefault && !!ctx.tenantId;
}

export type StorageSample = {
  slug: string;
  /** Billed bytes written to the Usage ledger (storageSize + indexSize). */
  bytes: number;
  dataSize: number;
  objects: number;
};

/**
 * Read a tenant's raw MongoDB stats from its data database. Read-only. Returns null when
 * the connection has no live native `db` handle (should not happen after connectDB, but
 * guarded defensively). SaaS-only tenants; the default tenant is never sampled by callers.
 */
export async function readDbStats(ctx: TenantContext): Promise<RawDbStats | null> {
  const conn = await tenantDb(ctx);
  const db = conn.db;
  if (!db) return null;
  const raw = (await db.stats()) as RawDbStats;
  return {
    dataSize: raw.dataSize ?? 0,
    storageSize: raw.storageSize ?? 0,
    indexSize: raw.indexSize ?? 0,
    objects: raw.objects ?? 0,
  };
}

/**
 * Sample ONE tenant: measure its Mongo footprint and write the billed bytes to the Usage
 * ledger for the current period. No-op returning null for the default tenant / SAAS_MODE
 * off. Returns the sample on success.
 */
export async function sampleTenantStorage(
  ctx: TenantContext,
  at: Date = new Date()
): Promise<StorageSample | null> {
  if (!isSampleable(ctx)) return null;
  const stats = await readDbStats(ctx);
  if (!stats) return null;
  const bytes = billedBytes(stats);
  await setStorageBytes(ctx, bytes, at);
  return { slug: ctx.slug, bytes, dataSize: stats.dataSize ?? 0, objects: stats.objects ?? 0 };
}

/** Build a minimal TenantContext straight from a registry doc (avoids a re-lookup). */
function ctxFromTenant(t: TenantDoc): TenantContext {
  return {
    tenantId: String(t._id),
    slug: t.slug,
    dbName: t.dbName,
    plan: (t.plan as TenantPlan) ?? 'free',
    status: (t.status as TenantStatus) ?? 'trialing',
    isDefault: false,
  };
}

export type SampleAllResult = {
  sampled: number;
  errors: number;
  totalBytes: number;
  samples: StorageSample[];
};

/**
 * Sample every live tenant (trialing/active) and update their storage figures. Intended to
 * be driven by a scheduler. A per-tenant failure is isolated (counted, not fatal) so one
 * bad database does not abort the whole run. No-op (empty result) when SAAS_MODE is off.
 */
export async function sampleAllTenants(at: Date = new Date()): Promise<SampleAllResult> {
  const empty: SampleAllResult = { sampled: 0, errors: 0, totalBytes: 0, samples: [] };
  if (!saasMode()) return empty;

  await connectDB();
  const tenants = (await Tenant.find({ status: { $in: ['trialing', 'active'] } })
    .select('slug dbName plan status')
    .lean()) as unknown as TenantDoc[];

  const out: SampleAllResult = { ...empty, samples: [] };
  for (const t of tenants) {
    try {
      const sample = await sampleTenantStorage(ctxFromTenant(t), at);
      if (sample) {
        out.sampled += 1;
        out.totalBytes += sample.bytes;
        out.samples.push(sample);
      }
    } catch {
      out.errors += 1;
    }
  }
  return out;
}
