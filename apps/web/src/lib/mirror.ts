import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getStorageConfig } from './storageConfig';
import { pushToRemote } from './remoteStorage';
import { uploadToOnedrive, downloadFromOnedrive, createShareLink } from './onedrive';
import { readFile } from './storage';
import { renderStoragePath } from './storagePath';

export type MirrorMeta = {
  kind: 'receipts' | 'statements' | 'expenses';
  store?: string; // store / card / vendor — whatever names the document
  date?: Date | string | null;
  total?: number;
  id?: unknown; // Mongo _id
};

function shortId(id: unknown): string {
  return String(id ?? '').slice(-8);
}
function extOf(p: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1].toLowerCase() : 'bin';
}
function baseNoExt(p: string): string {
  const base = p.split('/').pop() || p;
  return base.replace(/\.[a-z0-9]+$/i, '');
}

/** The remote path a local file mirrors to — the same folder/filename template the
 *  push path uses, so download/share resolve to exactly where the upload landed. */
function remoteRelPath(
  s: { folderTemplate: string; fileNameTemplate: string },
  meta: MirrorMeta,
  filePath: string
): string {
  const dateStr = meta.date ? new Date(meta.date).toISOString().slice(0, 10) : '';
  return renderStoragePath(s.folderTemplate, s.fileNameTemplate, {
    kind: meta.kind,
    store: String(meta.store || ''),
    date: dateStr,
    total: Number(meta.total || 0),
    id: shortId(meta.id),
    original: baseNoExt(filePath),
    ext: extOf(filePath),
  });
}

/**
 * Auto-mirror a just-saved/verified file to the remote backend (SMB/FTP), when the
 * "auto-mirror" toggle is on. Designed to be called fire-and-forget:
 *   void mirrorFileToRemote(meta, filePath);
 * Never throws and never blocks the caller — a NAS being offline must not break an
 * upload/verify. Failures are logged; "Sync now" in Settings catches up later.
 */
export async function mirrorFileToRemote(meta: MirrorMeta, filePath: string): Promise<void> {
  try {
    if (!filePath) return;
    const s = await getStorageConfig();
    if (s.backend === 'local' || !s.mirror) return;
    if (s.backend !== 'onedrive' && !s.remote.host) return;
    const data = await readFile(filePath);
    const rel = remoteRelPath(s, meta, filePath);
    const r = s.backend === 'onedrive' ? await uploadToOnedrive(rel, data) : await pushToRemote(s.remote, data, rel);
    if (!r.ok) console.warn(`[mirror] push failed for ${filePath}: ${r.error}`);
  } catch (err) {
    console.warn(`[mirror] ${filePath}: ${(err as Error).message}`);
  }
}

/**
 * On-demand re-cache: when a local file is missing (fresh host, restored DB) and the
 * OneDrive backend holds the mirror, pull it back to STORAGE_ROOT/<filePath> so future
 * reads hit local. Returns the bytes on success. No-op (null) for non-OneDrive backends.
 */
export async function recacheFromRemote(meta: MirrorMeta, filePath: string): Promise<Buffer | null> {
  try {
    if (!filePath) return null;
    const s = await getStorageConfig();
    if (s.backend !== 'onedrive') return null;
    const r = await downloadFromOnedrive(remoteRelPath(s, meta, filePath));
    if (!r.ok || !r.data) return null;
    const root = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');
    const dest = path.join(root, filePath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, r.data);
    return r.data;
  } catch (err) {
    console.warn(`[recache] ${filePath}: ${(err as Error).message}`);
    return null;
  }
}

/** An anonymous view-only OneDrive link for a mirrored file — powers "Open in OneDrive".
 *  Returns null for non-OneDrive backends or when the mirror is off. */
export async function shareLinkFor(meta: MirrorMeta, filePath: string): Promise<string | null> {
  try {
    if (!filePath) return null;
    const s = await getStorageConfig();
    if (s.backend !== 'onedrive') return null;
    const r = await createShareLink(remoteRelPath(s, meta, filePath));
    return r.ok ? r.url ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Find the document that owns a stored file and re-cache it from OneDrive. Lets the
 * file-serving route recover a missing local file without the caller knowing the
 * metadata. Only the main file is recoverable (thumbnails regenerate locally and are
 * not mirrored). Returns the bytes, or null if no owner / non-OneDrive / not on remote.
 */
export async function recacheByPath(relativePath: string): Promise<Buffer | null> {
  const { connectDB } = await import('./db');
  const { Receipt } = await import('@/models/Receipt');
  const { Statement } = await import('@/models/Statement');
  const { Expense } = await import('@/models/Expense');
  await connectDB();

  const rc = await Receipt.findOne({ filePath: relativePath }).select('store date total').lean();
  if (rc) return recacheFromRemote({ kind: 'receipts', store: rc.store, date: rc.date, total: rc.total, id: rc._id }, relativePath);

  const st = await Statement.findOne({ filePath: relativePath }).select('card statementDate totalAmount').lean();
  if (st) return recacheFromRemote({ kind: 'statements', store: st.card, date: st.statementDate, total: st.totalAmount, id: st._id }, relativePath);

  const ex = await Expense.findOne({ filePath: relativePath }).select('vendor date amount').lean();
  if (ex) return recacheFromRemote({ kind: 'expenses', store: ex.vendor, date: ex.date, total: ex.amount, id: ex._id }, relativePath);

  return null;
}

/** Reverse-look-up the owning document for a stored file and return an anonymous
 *  view-only OneDrive link. Counterpart to recacheByPath for the "Open in OneDrive"
 *  action. Null if no owner / non-OneDrive backend / link creation fails. */
export async function shareLinkByPath(relativePath: string): Promise<string | null> {
  const { connectDB } = await import('./db');
  const { Receipt } = await import('@/models/Receipt');
  const { Statement } = await import('@/models/Statement');
  const { Expense } = await import('@/models/Expense');
  await connectDB();

  const rc = await Receipt.findOne({ filePath: relativePath }).select('store date total').lean();
  if (rc) return shareLinkFor({ kind: 'receipts', store: rc.store, date: rc.date, total: rc.total, id: rc._id }, relativePath);

  const st = await Statement.findOne({ filePath: relativePath }).select('card statementDate totalAmount').lean();
  if (st) return shareLinkFor({ kind: 'statements', store: st.card, date: st.statementDate, total: st.totalAmount, id: st._id }, relativePath);

  const ex = await Expense.findOne({ filePath: relativePath }).select('vendor date amount').lean();
  if (ex) return shareLinkFor({ kind: 'expenses', store: ex.vendor, date: ex.date, total: ex.amount, id: ex._id }, relativePath);

  return null;
}
