// Per-tenant FILE-BINARY export manifest (TODO §8 "Per-tenant … export", GDPR Art. 20 at the
// workspace level — the binary-file complement to the collection dump). The content export
// (workspaceExport.ts) hands back the Mongo collections; but the receipt PDFs, statement PDFs
// and item photos do NOT live in Mongo — they live on disk under STORAGE_ROOT, referenced by
// the docs' `filePath`/`thumbPath`/`photos` fields. Without those binaries an export is
// incomplete. This module closes that gap with a REPORT-ONLY manifest: it lists exactly which
// files belong to a workspace (derived from that workspace's own doc references), whether each
// is present on disk, and the total byte size — so a human (or a later archiving increment) can
// see the full picture before any packaging.
//
// Report-only by design (mirrors erasurePurge.ts's dry-run scaffold): it never reads file
// CONTENT, never writes, and produces no archive. Building the actual tar/zip needs a streaming
// archive dependency and is deferred (see SAAS_PROGRESS.md "Needs Achilleas").
//
// Design mirror of workspaceExport.ts: everything is a PURE, side-effect-free function
// (unit-testable, client-safe) EXCEPT the two node-only readers at the bottom
// (`collectWorkspaceFileRefs` reads the tenant db; `statWorkspaceFiles` reads the filesystem) —
// both strictly READ-ONLY.
//
// OSS PARITY: SaaS-only. The reader refuses the implicit default tenant (self-hosted has its own
// file-preserving JSON backup/restore already) and the route is SAAS-gated, so the self-hosted
// single-user app is untouched.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import type { TenantContext } from './context';
import { tenantDb } from './connection';
import { isExportableCollection } from './workspaceExport';

/** Same resolution as lib/storage.ts (kept in-territory rather than importing feature plumbing,
 *  so this module owns its behaviour and adds zero edits to shared files). */
const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');

/** Doc fields that hold a single STORAGE_ROOT-relative file reference (Receipt/Statement/Expense). */
export const SINGLE_FILE_FIELDS = ['filePath', 'thumbPath'] as const;
/** Doc fields that hold an array of file references (Item.photos). */
export const ARRAY_FILE_FIELDS = ['photos'] as const;

/** One file's entry in the manifest. */
export type FileManifestEntry = {
  path: string;
  /** Top-level storage bucket the file sits in (receipts/statements/equipment/expenses/…). */
  bucket: string;
  /** True when the file is present on disk under STORAGE_ROOT. */
  exists: boolean;
  /** Size in bytes (0 when missing). */
  bytes: number;
};

export type WorkspaceFileManifest = {
  format: 'pharos.workspace-files-manifest';
  version: 1;
  generatedAt: string;
  notice: string;
  workspace: { slug: string; name: string; plan: string; status: string };
  totals: { files: number; present: number; missing: number; bytes: number };
  files: FileManifestEntry[];
};

const MANIFEST_NOTICE =
  'Manifest of the binary files (receipt/statement PDFs, item photos) referenced by this Pharos ' +
  'workspace (GDPR Art. 20 data portability). It lists which files belong to the workspace and ' +
  'whether each is present on disk. This is a report only — it contains no file contents and ' +
  'produces no archive; packaging the binaries is a separate step.';

/** ISO-8601 for a date, or the epoch for a missing/invalid one (so `generatedAt` is never blank). */
function iso(d: Date | string | null | undefined): string {
  if (!d) return new Date(0).toISOString();
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? new Date(0).toISOString() : t.toISOString();
}

/**
 * A file reference is usable only if it is a clean, non-empty, STORAGE_ROOT-relative path.
 * Rejects blanks, absolute paths, and `..` traversal — defence-in-depth mirroring
 * storage.ts's resolveWithinStorage, since these values come from DB docs that an import/
 * restore could have tampered with.
 */
export function isStorageRelative(ref: unknown): ref is string {
  if (typeof ref !== 'string') return false;
  const r = ref.trim();
  if (!r) return false;
  if (path.isAbsolute(r) || r.startsWith('/') || r.startsWith('\\')) return false;
  // Normalize and re-check it stays inside the root (no `..` climbs out).
  const rel = path.relative(STORAGE_ROOT, path.resolve(STORAGE_ROOT, r));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The storage bucket (first path segment) for grouping, or '' if indeterminable. */
export function fileBucket(ref: string): string {
  const first = String(ref).replace(/\\/g, '/').split('/').filter(Boolean)[0];
  return first || '';
}

/**
 * Pull every non-empty, storage-relative file reference out of a single document, across both
 * the single-value fields and the array field. Pure; tolerant of missing/typed-wrong fields.
 */
export function extractFileRefs(doc: unknown): string[] {
  if (!doc || typeof doc !== 'object') return [];
  const d = doc as Record<string, unknown>;
  const out: string[] = [];
  for (const f of SINGLE_FILE_FIELDS) {
    const v = d[f];
    if (isStorageRelative(v)) out.push(v.trim());
  }
  for (const f of ARRAY_FILE_FIELDS) {
    const v = d[f];
    if (Array.isArray(v)) for (const item of v) if (isStorageRelative(item)) out.push(item.trim());
  }
  return out;
}

/**
 * Dedupe + stable-sort file references gathered from many docs. Pure — the impure reader hands
 * its raw refs here (also directly unit-testable).
 */
export function dedupeFileRefs(refs: readonly string[]): string[] {
  const set = new Set<string>();
  for (const r of refs) if (isStorageRelative(r)) set.add(r.trim());
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Assemble the manifest envelope. Pure: pass the workspace display meta, the stat'd file
 * entries, and the generation time. Only whitelisted workspace fields are projected. Totals are
 * computed from the entries so the header never disagrees with the list.
 */
export function buildFileManifest(
  meta: { slug: string; name?: string; plan?: string; status?: string },
  entries: readonly FileManifestEntry[],
  generatedAt: Date | string
): WorkspaceFileManifest {
  let present = 0;
  let bytes = 0;
  for (const e of entries) {
    if (e.exists) present += 1;
    bytes += e.bytes > 0 ? e.bytes : 0;
  }
  return {
    format: 'pharos.workspace-files-manifest',
    version: 1,
    generatedAt: iso(generatedAt),
    notice: MANIFEST_NOTICE,
    workspace: {
      slug: meta.slug || '',
      name: meta.name || meta.slug || '',
      plan: meta.plan || '',
      status: meta.status || '',
    },
    totals: {
      files: entries.length,
      present,
      missing: entries.length - present,
      bytes,
    },
    files: entries.map((e) => ({ path: e.path, bucket: e.bucket, exists: e.exists, bytes: e.bytes })),
  };
}

/** Content-Disposition filename for the manifest download. Same safe derivation as the export. */
export function workspaceFilesManifestFilename(slug: string): string {
  const safe = String(slug).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'workspace';
  return `pharos-workspace-${safe}-files.json`;
}

/**
 * READ-ONLY node reader: gather the storage-relative file references from a tenant's data
 * database. Model-agnostic — it queries each exportable collection with a projection of only
 * the known file-reference fields (never loads full docs), so it stays decoupled from the
 * feature models. Refuses the implicit default tenant (self-hosted, out of SaaS scope) → `[]`,
 * never opening a connection there. Never writes.
 */
export async function collectWorkspaceFileRefs(ctx: TenantContext): Promise<string[]> {
  if (ctx.isDefault || !ctx.tenantId) return [];

  const conn: Connection = await tenantDb(ctx);
  const db = conn.db;
  if (!db) return [];

  const projection: Record<string, 0 | 1> = { _id: 0 };
  for (const f of SINGLE_FILE_FIELDS) projection[f] = 1;
  for (const f of ARRAY_FILE_FIELDS) projection[f] = 1;

  const infos = await db.listCollections().toArray();
  const refs: string[] = [];
  for (const info of infos) {
    const name = info?.name;
    if (!isExportableCollection(name)) continue;
    const docs = await db.collection(name).find({}, { projection }).toArray();
    for (const doc of docs) refs.push(...extractFileRefs(doc));
  }
  return dedupeFileRefs(refs);
}

/**
 * READ-ONLY filesystem pass: stat each file reference under STORAGE_ROOT. Never reads content.
 * A ref that escapes the root, is missing, or errors is reported `exists:false, bytes:0` rather
 * than throwing, so one bad reference can't sink the whole manifest. Refs arrive pre-validated
 * by `isStorageRelative`; the resolve+relative re-check here is defence-in-depth.
 */
export async function statWorkspaceFiles(
  refs: readonly string[]
): Promise<FileManifestEntry[]> {
  const root = path.resolve(STORAGE_ROOT);
  const out: FileManifestEntry[] = [];
  for (const ref of refs) {
    const entry: FileManifestEntry = { path: ref, bucket: fileBucket(ref), exists: false, bytes: 0 };
    const full = path.resolve(root, ref);
    const rel = path.relative(root, full);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      out.push(entry); // escapes the root → treated as missing, never stat'd
      continue;
    }
    try {
      const st = await fs.stat(full);
      if (st.isFile()) {
        entry.exists = true;
        entry.bytes = st.size;
      }
    } catch {
      // ENOENT / permission / etc. → leave as missing
    }
    out.push(entry);
  }
  return out;
}
