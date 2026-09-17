import { describe, it, expect, vi, beforeEach } from 'vitest';

const { saveFile, readFile, deleteFile } = vi.hoisted(() => ({
  saveFile: vi.fn(async () => ({ filePath: '/x', relativePath: 'share/2026/09/2026-09-17_0123456789abcdef.pdf' })),
  readFile: vi.fn(async () => Buffer.from('%PDF-1.4')),
  deleteFile: vi.fn(async () => {}),
}));
vi.mock('@/lib/storage', () => ({ saveFile, readFile, deleteFile }));

import { isShareTicket, kindOf, stashSharedFile, readSharedFile, discardSharedFile } from './shareInbox';

beforeEach(() => vi.clearAllMocks());

describe('shareInbox · tickets are the only door into the staging bucket', () => {
  it('accepts exactly what saveFile produces', () => {
    expect(isShareTicket('share/2026/09/2026-09-17_0123456789abcdef.pdf')).toBe(true);
  });

  it('rejects traversal and other buckets — a ticket must never read someone else’s file', () => {
    for (const bad of [
      'share/2026/09/../../../etc/passwd',
      '../share/2026/09/2026-09-17_0123456789abcdef.pdf',
      'receipts/2026/09/2026-09-17_0123456789abcdef.pdf',
      'share/2026/09/2026-09-17_0123456789abcdef.pdf/../../x.pdf',
      'share/2026/09/anything.pdf',
      '',
    ]) expect(isShareTicket(bad)).toBe(false);
  });

  it('reads nothing and deletes nothing for an invalid ticket', async () => {
    expect(await readSharedFile('receipts/2026/09/2026-09-17_0123456789abcdef.pdf')).toBeNull();
    await discardSharedFile('../x');
    expect(readFile).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe('shareInbox · what the share sheet may hand us', () => {
  it('classifies PDFs and images, refuses the rest', () => {
    expect(kindOf('statement.pdf', 'application/pdf')).toBe('pdf');
    expect(kindOf('scan.PDF', '')).toBe('pdf');
    expect(kindOf('IMG_1.HEIC', '')).toBe('image');
    expect(kindOf('photo', 'image/jpeg')).toBe('image');
    expect(kindOf('notes.txt', 'text/plain')).toBeNull();
    expect(kindOf('archive.zip', 'application/zip')).toBeNull();
  });

  it('parks a PDF in the share bucket and returns its ticket', async () => {
    const res = await stashSharedFile(new File([new Uint8Array([1, 2])], 'bill.pdf', { type: 'application/pdf' }));
    expect(saveFile).toHaveBeenCalledWith('share', expect.any(Buffer), 'pdf');
    expect(res).toEqual({ ticket: 'share/2026/09/2026-09-17_0123456789abcdef.pdf', kind: 'pdf' });
  });

  it('does not store an unsupported type at all', async () => {
    expect(await stashSharedFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBeNull();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('returns the parked bytes as a File the upload flows can take', async () => {
    const file = await readSharedFile('share/2026/09/2026-09-17_0123456789abcdef.pdf');
    expect(file?.type).toBe('application/pdf');
    expect(file?.name).toBe('2026-09-17_0123456789abcdef.pdf');
    expect(Buffer.from(await file!.arrayBuffer()).toString()).toBe('%PDF-1.4');
  });

  it('survives a file that was already consumed', async () => {
    readFile.mockRejectedValueOnce(new Error('ENOENT'));
    expect(await readSharedFile('share/2026/09/2026-09-17_0123456789abcdef.pdf')).toBeNull();
  });
});
