// Per-tenant file-byte storage accounting (increment 9, TODO #10).
//
// db.stats() (dbStats.ts) only measures a tenant's MongoDB footprint. Binary files
// (receipt PDFs, statement PDFs, item photos) live on the local storage volume, NOT in
// Mongo. This module sums a tenant's on-disk file bytes so the storage quota reflects the
// TRUE footprint (db + files). The sum is folded into setStorageBytes alongside db bytes
// by dbStats.sampleTenantStorage.
//
// TENANT FILE LAYOUT (convention): a SaaS tenant's files live under a per-tenant subtree
// STORAGE_ROOT/<dbName> (dbName = "tenant_<slug>", already globally unique). The shared
// storage layer (lib/storage.ts saveFile) is NOT tenant-aware yet — today it writes to
// STORAGE_ROOT/<bucket> directly. Until saveFile is made tenant-aware (a future increment /
// feature-builder territory), a live tenant's subtree is empty and this measures 0. See
// SAAS_PROGRESS.md → Needs Achilleas. Backward-compatible: no self-hosted files are moved.
//
// OSS PARITY (critical): file metering is SaaS-only. When SAAS_MODE is off, or for the
// implicit self-hosted DEFAULT_TENANT, tenantFileBytes is a NO-OP returning 0 with zero
// filesystem access. The self-hosted app is never file-metered.
//
// NODE-ONLY (node:fs). Never import from the edge runtime.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { saasMode } from '@/lib/tenancy/saasMode';
import type { TenantContext } from '@/lib/tenancy/context';

// Mirror of lib/storage.ts STORAGE_ROOT (kept in sync deliberately; storage.ts does not
// export it). Same env + default so both resolve to the same volume.
const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');

// ---------------------------------------------------------------------------------------
// PURE helpers (no fs, unit-tested)
// ---------------------------------------------------------------------------------------

/** Sum a list of byte counts, flooring each entry at 0 (defensive against garbage sizes). */
export function sumBytes(sizes: number[]): number {
  return sizes.reduce((acc, n) => acc + Math.max(0, n || 0), 0);
}

/**
 * The on-disk subtree that holds a tenant's files: STORAGE_ROOT/<dbName> (falling back to
 * "tenant_<slug>" when dbName is absent). Returns null for the default tenant (the whole
 * STORAGE_ROOT is the self-hosted single tenant, never file-metered) or when the resolved
 * path would escape STORAGE_ROOT (dbName/slug are DNS-safe; guarded defensively anyway).
 */
export function tenantStorageRoot(ctx: TenantContext): string | null {
  if (ctx.isDefault) return null;
  const dir = ctx.dbName || (ctx.slug ? `tenant_${ctx.slug}` : '');
  if (!dir) return null;
  const root = path.resolve(STORAGE_ROOT);
  const full = path.resolve(root, dir);
  const rel = path.relative(root, full);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

// ---------------------------------------------------------------------------------------
// FS-touching functions (SaaS-only; no-op for the default tenant / SAAS_MODE off)
// ---------------------------------------------------------------------------------------

/**
 * Recursively sum the byte size of every regular file under `dir`. A missing directory → 0
 * (a tenant with no uploads yet). Symlinks are not followed (Dirent.isFile is false for
 * them). A per-entry error is skipped so one unreadable file does not abort the whole walk.
 */
export async function measureDir(dir: string): Promise<number> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // ENOENT or unreadable directory → treat as empty
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        total += await measureDir(full);
      } else if (entry.isFile()) {
        const st = await fs.stat(full);
        total += Math.max(0, st.size);
      }
    } catch {
      // skip an unreadable entry (permission / race with deletion)
    }
  }
  return total;
}

/**
 * Total on-disk file bytes for a tenant. NO-OP returning 0 for the default tenant /
 * SAAS_MODE off (zero fs access). Otherwise walks the tenant's storage subtree.
 */
export async function tenantFileBytes(ctx: TenantContext): Promise<number> {
  if (!saasMode() || ctx.isDefault || !ctx.tenantId) return 0;
  const root = tenantStorageRoot(ctx);
  if (!root) return 0;
  return measureDir(root);
}
