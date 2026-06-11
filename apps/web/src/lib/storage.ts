import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');

export type StorageBucket = 'receipts' | 'statements' | 'equipment' | 'expenses';

/**
 * Resolve a caller-supplied relative path and guarantee it stays inside
 * STORAGE_ROOT. Defends against `..` traversal and absolute paths reaching
 * readFile/deleteFile from any source (route params, DB-stored filePath that a
 * restore/import could have tampered with). Throws if it escapes the root.
 */
function resolveWithinStorage(relativePath: string): string {
  const root = path.resolve(STORAGE_ROOT);
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
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dir = path.join(STORAGE_ROOT, bucket, year, month);

  await fs.mkdir(dir, { recursive: true });

  const hash = crypto.randomBytes(8).toString('hex');
  const timestamp = now.toISOString().split('T')[0];
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const filename = `${timestamp}_${hash}${ext}`;

  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, buffer);

  const relativePath = path.relative(STORAGE_ROOT, filePath);
  return { filePath, relativePath };
}

export async function readFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveWithinStorage(relativePath));
}

export async function deleteFile(relativePath: string): Promise<void> {
  await fs.unlink(resolveWithinStorage(relativePath));
}
