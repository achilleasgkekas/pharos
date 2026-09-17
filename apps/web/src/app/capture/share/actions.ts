'use server';

import { readSharedFile, discardSharedFile, isShareTicket } from '@/lib/shareInbox';
import { uploadReceipt } from '@/app/receipts/actions';
import { importStatementPdf } from '@/app/statements/actions';

export type ShareTarget = 'receipt' | 'statement';
export type RouteResult = { ok: true; redirectTo: string } | { ok: false; error: string };

/**
 * Hand a shared file to the module the user picked. The file is replayed into the module's own
 * upload action (same parsing, same storage, same tenant scoping) rather than duplicating any of
 * that logic here — this route only decides WHERE it goes.
 */
export async function routeSharedFile(ticket: string, target: ShareTarget): Promise<RouteResult> {
  if (!isShareTicket(ticket)) return { ok: false, error: 'Invalid file reference' };
  const file = await readSharedFile(ticket);
  if (!file) return { ok: false, error: 'The shared file is no longer available — share it again.' };

  const form = new FormData();
  form.set('file', file);

  if (target === 'statement') {
    if (file.type !== 'application/pdf') return { ok: false, error: 'Statements accept PDF files only' };
    const res = await importStatementPdf(form);
    if (!res.ok) return { ok: false, error: res.error || 'Import failed' };
    await discardSharedFile(ticket);
    return { ok: true, redirectTo: '/statements' };
  }

  const res = await uploadReceipt(form);
  if (!res.ok) return { ok: false, error: res.error || 'Upload failed' };
  await discardSharedFile(ticket);
  return { ok: true, redirectTo: '/receipts' };
}
