// Per-tenant CONTENT data-export (TODO §8 "Per-tenant … export", GDPR Art. 20 portability at
// the workspace level). This is the complement to the account-level export (accountExport.ts):
// the account export covers the login identity, this one covers the actual WORKSPACE CONTENT —
// Items, Receipts, Statements, … — which lives in each tenant's isolated data database.
//
// Design mirror of accountExport.ts: everything here is a PURE function with no DB/import side
// effects (fully unit-testable, client-safe) EXCEPT `collectWorkspaceData`, which is the single
// node-only reader. It reads the tenant db through the raw Mongo driver (collection dumps),
// deliberately model-agnostic: it never imports a feature model, so it exports whatever the
// tenant db holds and stays fully decoupled from the feature territory. It is READ-ONLY — a
// data export never writes.
//
// OSS PARITY: this is SaaS-only. The reader refuses the implicit default tenant (self-hosted
// has its own JSON backup/restore already, Settings → Storage & data) and the route is
// SAAS-gated (404 when SAAS_MODE is off), so the self-hosted single-user app is untouched.
import type { Connection } from 'mongoose';
import type { TenantContext } from './context';
import { tenantDb } from './connection';

/** Default per-collection document cap. A scaffold guard against loading an unbounded dump into
 *  memory; overridable via `WORKSPACE_EXPORT_MAX_DOCS`. Collections beyond it are marked
 *  `truncated` so the export never silently claims completeness. */
export const WORKSPACE_EXPORT_MAX_DOCS_DEFAULT = 10000;

/** The whitelisted workspace display fields the envelope carries (never secrets). */
export type WorkspaceExportMeta = {
  slug: string;
  name?: string;
  plan?: string;
  status?: string;
};

/** One collection's dump within the export. */
export type ExportedCollection = {
  name: string;
  /** Documents included in this export (≤ the cap). */
  count: number;
  /** True when the collection held more docs than the cap and was cut. */
  truncated: boolean;
  docs: unknown[];
};

export type WorkspaceExport = {
  format: 'pharos.workspace-export';
  version: 1;
  generatedAt: string;
  notice: string;
  workspace: { slug: string; name: string; plan: string; status: string };
  maxDocsPerCollection: number;
  collections: ExportedCollection[];
};

const EXPORT_NOTICE =
  'This is a machine-readable copy of the content stored in this Pharos workspace (GDPR Art. 20 ' +
  'data portability). It dumps the workspace data collections as they are stored. Per-collection ' +
  'size is capped for this export; a collection cut at the cap is flagged `truncated`.';

/** ISO-8601 for a date, or the epoch for a missing/invalid one (so `generatedAt` is never blank). */
function iso(d: Date | string | null | undefined): string {
  if (!d) return new Date(0).toISOString();
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? new Date(0).toISOString() : t.toISOString();
}

/**
 * Whether a Mongo collection belongs in the export. Skips internal `system.*` namespaces
 * (indexes/profile/etc.) and anything without a real name. Everything else — the tenant's
 * feature data — is exportable.
 */
export function isExportableCollection(name: unknown): name is string {
  if (typeof name !== 'string' || !name) return false;
  return !name.startsWith('system.');
}

/**
 * Resolve the per-collection doc cap from an env string. Non-numeric / non-positive → the
 * default. Floored to a whole number. Pure so the route can read `process.env` and hand the
 * raw value in for deterministic tests.
 */
export function resolveMaxDocs(
  raw: string | undefined,
  fallback = WORKSPACE_EXPORT_MAX_DOCS_DEFAULT
): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Assemble the export envelope. Pure: pass the workspace display meta, the already-collected
 * collections, the generation time, and the cap that was applied. Only whitelisted workspace
 * fields are projected; the collection docs are passed through verbatim (they are the user's
 * own data being handed back to them).
 */
export function buildWorkspaceExport(
  meta: WorkspaceExportMeta,
  collections: readonly ExportedCollection[],
  generatedAt: Date | string,
  maxDocsPerCollection: number
): WorkspaceExport {
  return {
    format: 'pharos.workspace-export',
    version: 1,
    generatedAt: iso(generatedAt),
    notice: EXPORT_NOTICE,
    workspace: {
      slug: meta.slug || '',
      name: meta.name || meta.slug || '',
      plan: meta.plan || '',
      status: meta.status || '',
    },
    maxDocsPerCollection,
    collections: collections.map((c) => ({
      name: c.name,
      count: c.count,
      truncated: c.truncated,
      docs: c.docs,
    })),
  };
}

/**
 * Content-Disposition filename for the download. Derives from the workspace slug (already a
 * DNS-safe label), still stripped defensively to a safe charset with a non-empty fallback.
 */
export function workspaceExportFilename(slug: string): string {
  const safe = String(slug).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'workspace';
  return `pharos-workspace-${safe}.json`;
}

/**
 * READ-ONLY node reader: dump every exportable collection of a tenant's data database.
 *
 * Refuses the implicit default tenant (self-hosted) — it returns `[]` and never touches a
 * connection there, so this is a genuine no-op outside SaaS. For a real tenant it opens the
 * tenant-scoped connection (`tenantDb`, which shares the one pool), lists collections, and
 * reads each up to `maxDocs`. It reads `maxDocs + 1` to detect (and flag) truncation without
 * an extra count query. Never writes.
 */
export async function collectWorkspaceData(
  ctx: TenantContext,
  maxDocs: number
): Promise<ExportedCollection[]> {
  // Guard: the default/self-hosted tenant is out of scope for the SaaS content export.
  if (ctx.isDefault || !ctx.tenantId) return [];

  const conn: Connection = await tenantDb(ctx);
  const db = conn.db;
  if (!db) return [];

  const infos = await db.listCollections().toArray();
  const out: ExportedCollection[] = [];
  for (const info of infos) {
    const name = info?.name;
    if (!isExportableCollection(name)) continue;
    const docs = await db
      .collection(name)
      .find({})
      .limit(maxDocs + 1)
      .toArray();
    const truncated = docs.length > maxDocs;
    if (truncated) docs.length = maxDocs; // cut to the cap; the flag records that it happened
    out.push({ name, count: docs.length, truncated, docs });
  }
  // Stable ordering so exports diff cleanly.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
