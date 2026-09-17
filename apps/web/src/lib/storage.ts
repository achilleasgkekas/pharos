import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { currentTenant } from './tenancy/current';
import { tenantStorageRoot } from './billing/fileStorage';
import { assertStorageQuota, recordStorageDelta } from './billing/storageMeter';

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');

// 'share' is the staging bucket for files handed to us by the OS share sheet (#123): they live
// there only until the user picks a destination, then move into the real bucket.
export type StorageBucket = 'receipts' | 'statements' | 'equipment' | 'expenses' | 'share';

/**
 * The root this call should read/write under: the ambient tenant's own subtree
 * (STORAGE_ROOT/<dbName>) for a real SaaS tenant, or the flat STORAGE_ROOT for the self-hosted
 * default tenant — `tenantStorageRoot()` already returns null for that case, which is exactly
 * today's behavior, unchanged. Every caller of saveFile/readFile/deleteFile already runs inside
 * `withRequestTenant`/`withTenant` for the tenant that owns the file, same as `currentModel()`
 * scopes Mongo access — so re-deriving the root here from `currentTenant()` at call time is
 * always correct without threading it through 13+ call sites' signatures.
 */
function activeStorageRoot(): string {
  return tenantStorageRoot(currentTenant()) ?? STORAGE_ROOT;
}

/**
 * Resolve a caller-supplied relative path and guarantee it stays inside the active storage
 * root. Defends against `..` traversal and absolute paths reaching readFile/deleteFile from any
 * source (route params, DB-stored filePath that a restore/import could have tampered with).
 * Throws if it escapes the root.
 */
function resolveWithinStorage(relativePath: string): string {
  const root = path.resolve(activeStorageRoot());
  const full = path.resolve(root, relativePath || '');
  const rel = path.relative(root, full);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes storage root');
  }
  return full;
}

export async function saveFile(
  bucket: StorageBucket,
  buffer: Buffer,
  extension: string
): Promise<{ filePath: string; relativePath: string }> {
  // Gate BEFORE touching the filesystem — an over-quota tenant never gets a partial write.
  // No-op (zero DB access) for the self-hosted default tenant / SAAS_MODE off.
  await assertStorageQuota(buffer.length);

  const root = activeStorageRoot();
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dir = path.join(root, bucket, year, month);

  await fs.mkdir(dir, { recursive: true });

  const hash = crypto.randomBytes(8).toString('hex');
  const timestamp = now.toISOString().split('T')[0];
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const filename = `${timestamp}_${hash}${ext}`;

  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, buffer);
  await recordStorageDelta(buffer.length);

  // Bucket-relative, NOT prefixed with the tenant subtree — readFile/deleteFile re-derive the
  // tenant root from the ambient current tenant at call time, same convention as Mongo's
  // currentModel() (the tenant is ambient context, never encoded into the stored value).
  const relativePath = path.relative(root, filePath);
  return { filePath, relativePath };
}

export async function readFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveWithinStorage(relativePath));
}

export async function deleteFile(relativePath: string): Promise<void> {
  const full = resolveWithinStorage(relativePath);
  // Best-effort size lookup for the ledger — a stat failure (already gone, race with another
  // delete) must never block the actual unlink below.
  let size = 0;
  try {
    size = (await fs.stat(full)).size;
  } catch {
    /* unreadable/missing — proceed with the delete anyway, ledger delta stays 0 */
  }
  await fs.unlink(full);
  if (size > 0) await recordStorageDelta(-size);
}
