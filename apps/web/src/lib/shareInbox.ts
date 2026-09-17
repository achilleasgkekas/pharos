import path from 'node:path';
import { saveFile, readFile, deleteFile } from '@/lib/storage';

/**
 * #123 — staging area for files the OS share sheet hands to Pharos.
 *
 * A shared PDF arrives before we know where it belongs (receipt? card statement?), so it is parked
 * in the `share` storage bucket and referenced by a ticket until the user picks a destination.
 *
 * The ticket is the file's bucket-relative path, and it is what a browser sends back to us, so it
 * is validated on every use: only paths inside `share/` with the exact `YYYY-MM-DD_<16 hex>.<ext>`
 * shape saveFile() produces are accepted. That rejects traversal (`../`) and any attempt to read a
 * receipt or a statement of another module through this door.
 */
const TICKET = /^share[/\\]\d{4}[/\\]\d{2}[/\\]\d{4}-\d{2}-\d{2}_[0-9a-f]{16}\.[a-z0-9]{1,5}$/;

export function isShareTicket(ticket: string): boolean {
  return TICKET.test(ticket) && !ticket.includes('..');
}

export type SharedFileKind = 'pdf' | 'image';

export function kindOf(filename: string, mime: string): SharedFileKind | null {
  const ext = path.extname(filename).toLowerCase();
  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.heic', '.webp'].includes(ext)) return 'image';
  return null;
}

/** Park an incoming file. Returns the ticket, or null when the type is not something we accept. */
export async function stashSharedFile(file: File): Promise<{ ticket: string; kind: SharedFileKind } | null> {
  const kind = kindOf(file.name, file.type);
  if (!kind) return null;
  const ext = kind === 'pdf' ? 'pdf' : (path.extname(file.name).slice(1).toLowerCase() || 'jpg');
  const bytes = Buffer.from(await file.arrayBuffer());
  const { relativePath } = await saveFile('share', bytes, ext);
  return { ticket: relativePath, kind };
}

/** Read a parked file back as a File, ready to hand to an existing upload flow. */
export async function readSharedFile(ticket: string): Promise<File | null> {
  if (!isShareTicket(ticket)) return null;
  let bytes: Buffer;
  try {
    bytes = await readFile(ticket);
  } catch {
    return null; // already consumed, swept, or never existed
  }
  const name = path.basename(ticket);
  const ext = path.extname(name).toLowerCase();
  const type = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Drop a parked file once its destination flow has copied it into the real bucket. */
export async function discardSharedFile(ticket: string): Promise<void> {
  if (!isShareTicket(ticket)) return;
  await deleteFile(ticket).catch(() => {}); // best effort: the copy already succeeded
}
