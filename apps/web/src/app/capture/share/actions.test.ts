import { describe, it, expect, vi, beforeEach } from 'vitest';

const { uploadReceipt, importStatementPdf, readSharedFile, discardSharedFile } = vi.hoisted(() => ({
  uploadReceipt: vi.fn(async (_form: FormData) => ({ ok: true }) as { ok: boolean; error?: string }),
  importStatementPdf: vi.fn(async (_form: FormData) => ({ ok: true }) as { ok: boolean; error?: string }),
  readSharedFile: vi.fn(async (_ticket: string): Promise<File | null> =>
    new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })),
  discardSharedFile: vi.fn(async () => {}),
}));
vi.mock('@/app/receipts/actions', () => ({ uploadReceipt }));
vi.mock('@/app/statements/actions', () => ({ importStatementPdf }));
vi.mock('@/lib/shareInbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shareInbox')>('@/lib/shareInbox');
  return { ...actual, readSharedFile, discardSharedFile };
});

import { routeSharedFile } from './actions';
const TICKET = 'share/2026/09/2026-09-17_0123456789abcdef.pdf';

beforeEach(() => vi.clearAllMocks());

describe('routeSharedFile · the picker only decides WHERE, the module does the work', () => {
  it('replays a receipt through the normal upload action and clears the staged copy', async () => {
    const res = await routeSharedFile(TICKET, 'receipt');
    expect(res).toEqual({ ok: true, redirectTo: '/receipts' });
    expect(uploadReceipt).toHaveBeenCalledTimes(1);
    expect(uploadReceipt.mock.calls[0][0].get('file')).toBeInstanceOf(File);
    expect(discardSharedFile).toHaveBeenCalledWith(TICKET);
  });

  it('replays a statement through the PDF import', async () => {
    expect(await routeSharedFile(TICKET, 'statement')).toEqual({ ok: true, redirectTo: '/statements' });
    expect(importStatementPdf).toHaveBeenCalledTimes(1);
  });

  it('refuses an image for statements instead of importing garbage', async () => {
    readSharedFile.mockResolvedValueOnce(new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' }));
    expect(await routeSharedFile(TICKET, 'statement')).toEqual({ ok: false, error: 'Statements accept PDF files only' });
    expect(importStatementPdf).not.toHaveBeenCalled();
  });

  it('never touches a module with an invalid ticket', async () => {
    expect(await routeSharedFile('../../etc/passwd', 'receipt')).toEqual({ ok: false, error: 'Invalid file reference' });
    expect(uploadReceipt).not.toHaveBeenCalled();
  });

  it('keeps the staged file when the module rejects it, so the user can retry', async () => {
    uploadReceipt.mockResolvedValueOnce({ ok: false, error: 'File too large (max 15MB)' });
    expect(await routeSharedFile(TICKET, 'receipt')).toEqual({ ok: false, error: 'File too large (max 15MB)' });
    expect(discardSharedFile).not.toHaveBeenCalled();
  });

  it('explains a file that vanished rather than failing silently', async () => {
    readSharedFile.mockResolvedValueOnce(null);
    const res = await routeSharedFile(TICKET, 'receipt');
    expect(res.ok).toBe(false);
  });
});
