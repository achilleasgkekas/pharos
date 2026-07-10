// PURE + client-safe view model for the superadmin LIVE db-stats footprint panel
// (LiveDbStatsPanel). Projects the on-the-wire envelope returned by
//   GET /api/saas/admin/tenants/[slug]/dbstats
// (shape: `pharos.admin-tenant-dbstats` v1 — see lib/tenancy/adminTenantDbStats.ts) into a
// fully-coerced display model. Kept separate from the client component (no React, no next/*,
// no DB) so the shaping is unit-testable in isolation, mirroring quota.ts / billingView.ts.
//
// Every numeric field is floored at 0: this feeds an operator dashboard where a stray "NaN" or
// "-1 B" reads as a real (alarming) value. A malformed / missing body collapses to an all-zero,
// not-measured view rather than throwing in render.

/** Defensive non-negative integer: NaN/±Infinity/negative → 0, floored. */
function bytes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export type DbStatsView = {
  /** True only when the API reported a live db.stats() actually ran. */
  measured: boolean;
  /** Data-plane database name the footprint was read from (''-safe). */
  dbName: string;
  /** ISO timestamp of the read, or '' when absent/invalid (render layer maps to "—"). */
  generatedAt: string;
  /** Total billed footprint (db + files) — what a storage quota is checked against. */
  total: number;
  /** Billed MongoDB footprint (storageSize + indexSize). */
  db: number;
  /** On-disk binary-file footprint for the tenant. */
  files: number;
  /** Document count across the tenant's data database. */
  objects: number;
  /** Uncompressed logical size of all documents. */
  data: number;
  /** Physical on-disk collection storage (compressed). */
  storage: number;
  /** Physical on-disk index storage. */
  index: number;
};

const EMPTY: DbStatsView = {
  measured: false,
  dbName: '',
  generatedAt: '',
  total: 0,
  db: 0,
  files: 0,
  objects: 0,
  data: 0,
  storage: 0,
  index: 0,
};

/**
 * Coerce an unknown API body into a safe DbStatsView. A non-object, or a body missing the
 * `live` block, yields the all-zero not-measured view. `measured` is only ever true when the
 * body says so AND the value is a real boolean. PURE.
 */
export function dbStatsView(input: unknown): DbStatsView {
  if (!input || typeof input !== 'object') return { ...EMPTY };
  const body = input as Record<string, unknown>;
  const live =
    body.live && typeof body.live === 'object'
      ? (body.live as Record<string, unknown>)
      : {};
  return {
    measured: body.measured === true,
    dbName: typeof body.dbName === 'string' ? body.dbName : '',
    generatedAt: typeof body.generatedAt === 'string' ? body.generatedAt : '',
    total: bytes(live.totalBytes),
    db: bytes(live.dbBytes),
    files: bytes(live.fileBytes),
    objects: bytes(live.objects),
    data: bytes(live.dataSize),
    storage: bytes(live.storageSize),
    index: bytes(live.indexSize),
  };
}
