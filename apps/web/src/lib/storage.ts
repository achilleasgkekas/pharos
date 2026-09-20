import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');

// 'share' is the staging bucket for files handed to us by the OS share sheet (#123): they live
// there only until the user picks a destination, then move into the real bucket.
export type StorageBucket = 'receipts' | 'statements' | 'equipment' | 'expenses' | 'share';

/**
 * The root every read and write resolves under.
 *
 * This used to ask the ambient tenant for its own subtree and fall back to `STORAGE_ROOT`. With
 * the SaaS retired there is one installation and one root, so the question has one answer — but
 * the function stays, because `resolveWithinStorage` below is the traversal guard and it must
 * keep having a single, named thing to guard against.
 */
export function activeStorageRoot(): string {
  return STORAGE_ROOT;
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

  // Stored bucket-relative, never as an absolute path: `readFile`/`deleteFile` resolve it under
  // the root at call time, so moving the storage volume is a config change and not a migration.
  const relativePath = path.relative(root, filePath);
  return { filePath, relativePath };
}

export async function readFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveWithinStorage(relativePath));
}

export async function deleteFile(relativePath: string): Promise<void> {
  await fs.unlink(resolveWithinStorage(relativePath));
}

/**
 * Recursively sum the byte size of every regular file under `dir`. A missing directory → 0.
 * Symlinks are not followed (`Dirent.isFile` is false for them). A per-entry error is skipped so
 * one unreadable file does not abort the whole walk.
 *
 * Moved here from `lib/billing/fileStorage.ts` when the SaaS was retired: it was written to
 * measure a tenant's quota, but it is plain filesystem arithmetic and the self-hosted
 * Settings → System panel is now its only caller.
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
