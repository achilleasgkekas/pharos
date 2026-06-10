import 'server-only';
import { getStorageConfig } from './storageConfig';
import { pushToRemote } from './remoteStorage';
import { uploadToOnedrive } from './onedrive';
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
    const dateStr = meta.date ? new Date(meta.date).toISOString().slice(0, 10) : '';
    const rel = renderStoragePath(s.folderTemplate, s.fileNameTemplate, {
      kind: meta.kind,
      store: String(meta.store || ''),
      date: dateStr,
      total: Number(meta.total || 0),
      id: shortId(meta.id),
      original: baseNoExt(filePath),
      ext: extOf(filePath),
    });
    const r = s.backend === 'onedrive' ? await uploadToOnedrive(rel, data) : await pushToRemote(s.remote, data, rel);
    if (!r.ok) console.warn(`[mirror] push failed for ${filePath}: ${r.error}`);
  } catch (err) {
    console.warn(`[mirror] ${filePath}: ${(err as Error).message}`);
  }
}
