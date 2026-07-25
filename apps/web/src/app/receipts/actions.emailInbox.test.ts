import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Final slice of app/receipts/actions.ts — the email-inbox import path
// (`getEmailInboxCount`/`importEmailInbox`). These read a flat directory of files
// dropped there by `scripts/extract-email-receipts.py` (Gmail Takeout MBOX ->
// attachments), stage them as draft receipts (no AI call, total:0/verified:false —
// the existing "re-scan all (OCR)" job parses them afterwards), and move consumed
// files into an `email-inbox/done/` subfolder. Separate concern from the rest of the
// module: pure node:fs directory scanning + an optional best-effort manifest.json,
// no OCR/vision/text-model involvement at all.
//
// Behaviour pinned:
//  - INBOX_EXT recognises .pdf/.jpg/.jpeg/.png/.webp/.html/.htm (case-insensitive);
//    anything else (e.g. manifest.json itself) is invisible to both functions.
//  - getEmailInboxCount swallows a missing/unreadable inbox dir as 0, never throws.
//  - importEmailInbox: missing inbox dir -> {ok:false, error:'No email-inbox folder'},
//    revalidatePath NOT called. Empty (but existing) dir -> {ok:true, imported:0,
//    skipped:0}, returned BEFORE the manifest is even read and BEFORE the trailing
//    revalidatePath call.
//  - manifest.json is optional (best-effort JSON.parse in its own try/catch); when
//    missing/corrupt every file falls back to storeHint(undefined, filename) + "now".
//  - storeHint prefers the sender's `from` domain (2nd-level, e.g. "noreply@plaisio.gr"
//    -> "Plaisio"), else a `word_` filename prefix (e.g. "anker_order.pdf" -> "Anker");
//    "gmail"/"com"/anything under 3 chars collapses to "Unknown store".
//  - Only .pdf files get a rendered 480px thumbnail (best-effort, its own inner
//    try/catch so a thumbnail failure never fails the whole file); non-pdf files never
//    call pdfFirstPageJpeg at all.
//  - fileType: pdf -> application/pdf, html/htm -> text/html, else image/<ext>.
//  - notes: "📧 <subject>" (truncated to 200 chars) when the manifest has a subject,
//    else the literal "Imported from email".
//  - Per-file processing is wrapped in one try/catch: a failure reading the source
//    bytes, saving the file, or creating the Receipt doc all count as `skipped++` and
//    the loop continues to the next file (one bad email never aborts the batch).
//    The final `fs.rename(...)` into done/ is itself `.catch(()=>{})`'d, so a rename
//    failure is silently swallowed and does NOT reduce `imported`.
//  - `imported++` happens strictly after the Receipt is created (before the rename),
//    so a create failure is never double-counted.

const {
  connectDBMock,
  receiptCreate,
  fsReaddirMock,
  fsReadFileMock,
  fsMkdirMock,
  fsRenameMock,
  pdfFirstPageJpegMock,
  saveFileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  receiptCreate: vi.fn(async (doc: Record<string, any>) => ({ ...doc, _id: 'r1' })),
  fsReaddirMock: vi.fn(async (_dir: string) => [] as string[]),
  fsReadFileMock: vi.fn(async (_p: string, _enc?: string): Promise<string | Buffer> => Buffer.from('file-bytes')),
  fsMkdirMock: vi.fn(async (_dir: string, _opts?: unknown) => undefined),
  fsRenameMock: vi.fn(async (_from: string, _to: string) => undefined),
  pdfFirstPageJpegMock: vi.fn(async (_bytes: Buffer, _w: number) => null as Buffer | null),
  saveFileMock: vi.fn(async (_bucket: string, _bytes: Buffer, ext: string) => ({ relativePath: `receipts/2026/06/file.${ext}` })),
  revalidatePathMock: vi.fn(),
}));

const receiptModel = { create: receiptCreate };

vi.mock('node:fs', () => ({
  promises: {
    readdir: fsReaddirMock,
    readFile: fsReadFileMock,
    mkdir: fsMkdirMock,
    rename: fsRenameMock,
  },
}));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => receiptModel }));
vi.mock('@/models/Receipt', () => ({ Receipt: {} }));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/lib/storage', () => ({ saveFile: saveFileMock, deleteFile: vi.fn(), readFile: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseReceipt: vi.fn(), parseReceiptText: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrImage: vi.fn(), looksLikeUsableOcr: vi.fn() }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: pdfFirstPageJpegMock }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ defaultWarrantyMonths: 24, defaultVatRate: 24 })) }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({ dispatchEventWebhooks: vi.fn() }));
vi.mock('@/lib/htmlReceipt', () => ({ htmlReceiptToText: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { getEmailInboxCount, importEmailInbox } from './actions';

const EMAIL_INBOX = path.join(process.env.STORAGE_ROOT ?? '/storage', 'email-inbox');

function manifestOk(entries: Array<{ file: string; from?: string; subject?: string; date?: string }>) {
  fsReadFileMock.mockImplementation(async (p: string) => {
    if (String(p).endsWith('manifest.json')) return JSON.stringify(entries);
    return Buffer.from('file-bytes');
  });
}

function manifestMissing() {
  fsReadFileMock.mockImplementation(async (p: string) => {
    if (String(p).endsWith('manifest.json')) throw new Error('ENOENT: no manifest');
    return Buffer.from('file-bytes');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fsReaddirMock.mockResolvedValue([]);
  manifestMissing();
  fsMkdirMock.mockResolvedValue(undefined);
  fsRenameMock.mockResolvedValue(undefined);
  saveFileMock.mockImplementation(async (_b: string, _bytes: Buffer, ext: string) => ({ relativePath: `receipts/2026/06/file.${ext}` }));
  pdfFirstPageJpegMock.mockResolvedValue(null);
  receiptCreate.mockImplementation(async (doc: Record<string, any>) => ({ ...doc, _id: 'r1' }));
});

describe('getEmailInboxCount', () => {
  it('counts only recognised extensions, ignoring the manifest and subfolders', async () => {
    fsReaddirMock.mockResolvedValueOnce([
      'plaisio_order.pdf', 'anker_receipt.JPG', 'skroutz.html', 'viva.htm',
      'manifest.json', 'done', 'notes.txt',
    ]);
    await expect(getEmailInboxCount()).resolves.toBe(4);
    expect(fsReaddirMock).toHaveBeenCalledWith(EMAIL_INBOX);
  });

  it('returns 0 when the inbox directory does not exist, without throwing', async () => {
    fsReaddirMock.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(getEmailInboxCount()).resolves.toBe(0);
  });

  it('returns 0 for an existing but empty directory', async () => {
    fsReaddirMock.mockResolvedValueOnce([]);
    await expect(getEmailInboxCount()).resolves.toBe(0);
  });
});

describe('importEmailInbox', () => {
  it('reports a missing inbox folder without touching revalidate', async () => {
    fsReaddirMock.mockRejectedValueOnce(new Error('ENOENT'));
    const r = await importEmailInbox();
    expect(r).toEqual({ ok: false, imported: 0, skipped: 0, error: 'No email-inbox folder' });
    expect(receiptCreate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('short-circuits on an empty directory before reading the manifest or revalidating', async () => {
    fsReaddirMock.mockResolvedValueOnce([]);
    const r = await importEmailInbox();
    expect(r).toEqual({ ok: true, imported: 0, skipped: 0 });
    expect(fsReadFileMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('imports a plain image with manifest metadata: store from sender domain, subject as notes, moved to done/', async () => {
    fsReaddirMock.mockResolvedValueOnce(['order.jpg']);
    manifestOk([{ file: 'order.jpg', from: 'noreply@plaisio.gr', subject: 'Your Plaisio order', date: '2026-05-01T10:00:00.000Z' }]);

    const r = await importEmailInbox();
    expect(r).toEqual({ ok: true, imported: 1, skipped: 0 });

    expect(receiptCreate).toHaveBeenCalledTimes(1);
    const doc = receiptCreate.mock.calls[0][0];
    expect(doc.store).toBe('Plaisio');
    expect(doc.date.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    expect(doc.total).toBe(0);
    expect(doc.fileType).toBe('image/jpg');
    expect(doc.thumbPath).toBe('');
    expect(doc.aiModel).toBe('email-import');
    expect(doc.verified).toBe(false);
    expect(doc.notes).toBe('📧 Your Plaisio order');

    // Non-pdf: never attempts a thumbnail render.
    expect(pdfFirstPageJpegMock).not.toHaveBeenCalled();
    expect(fsRenameMock).toHaveBeenCalledWith(
      path.join(EMAIL_INBOX, 'order.jpg'),
      path.join(EMAIL_INBOX, 'done', 'order.jpg'),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });

  it('falls back to filename-prefix store + "now" date + generic notes when the manifest is unreadable', async () => {
    fsReaddirMock.mockResolvedValueOnce(['anker_invoice.pdf']);
    manifestMissing();
    pdfFirstPageJpegMock.mockResolvedValueOnce(Buffer.from('jpeg-bytes'));

    const before = Date.now();
    const r = await importEmailInbox();
    const after = Date.now();
    expect(r.imported).toBe(1);

    const doc = receiptCreate.mock.calls[0][0];
    expect(doc.store).toBe('Anker');
    expect(doc.notes).toBe('Imported from email');
    expect(doc.date.getTime()).toBeGreaterThanOrEqual(before);
    expect(doc.date.getTime()).toBeLessThanOrEqual(after);
  });

  it('collapses short/generic sender domains ("gmail", "com") to "Unknown store"', async () => {
    fsReaddirMock.mockResolvedValueOnce(['a.pdf']);
    manifestOk([{ file: 'a.pdf', from: 'someone@gmail.com' }]);
    await importEmailInbox();
    expect(receiptCreate.mock.calls[0][0].store).toBe('Unknown store');
  });

  it('renders + saves a 480px thumbnail for a PDF and sets thumbPath, fileType application/pdf', async () => {
    fsReaddirMock.mockResolvedValueOnce(['statement.pdf']);
    manifestOk([{ file: 'statement.pdf' }]);
    pdfFirstPageJpegMock.mockResolvedValueOnce(Buffer.from('jpeg-bytes'));

    await importEmailInbox();

    expect(pdfFirstPageJpegMock).toHaveBeenCalledWith(expect.any(Buffer), 480);
    // Two saveFile calls: the pdf itself, then the jpeg thumbnail.
    expect(saveFileMock).toHaveBeenCalledWith('receipts', expect.any(Buffer), 'pdf');
    expect(saveFileMock).toHaveBeenCalledWith('receipts', expect.any(Buffer), 'jpg');
    const doc = receiptCreate.mock.calls[0][0];
    expect(doc.fileType).toBe('application/pdf');
    expect(doc.thumbPath).toBe('receipts/2026/06/file.jpg');
  });

  it('leaves thumbPath empty when the rasterizer finds nothing to render', async () => {
    fsReaddirMock.mockResolvedValueOnce(['blank.pdf']);
    manifestOk([{ file: 'blank.pdf' }]);
    pdfFirstPageJpegMock.mockResolvedValueOnce(null);

    await importEmailInbox();
    expect(receiptCreate.mock.calls[0][0].thumbPath).toBe('');
  });

  it('swallows a thumbnail-save failure and still imports the pdf with no thumbPath', async () => {
    fsReaddirMock.mockResolvedValueOnce(['glitch.pdf']);
    manifestOk([{ file: 'glitch.pdf' }]);
    pdfFirstPageJpegMock.mockResolvedValueOnce(Buffer.from('jpeg-bytes'));
    saveFileMock.mockImplementationOnce(async (_b, _bytes, ext) => ({ relativePath: `receipts/2026/06/file.${ext}` })); // the pdf save (ok)
    saveFileMock.mockImplementationOnce(async () => { throw new Error('disk full'); }); // the thumb save (fails)

    const r = await importEmailInbox();
    expect(r.imported).toBe(1);
    expect(receiptCreate.mock.calls[0][0].thumbPath).toBe('');
  });

  it('treats .html/.htm as text/html and never attempts a thumbnail', async () => {
    fsReaddirMock.mockResolvedValueOnce(['viva.html']);
    manifestOk([{ file: 'viva.html' }]);

    await importEmailInbox();
    expect(pdfFirstPageJpegMock).not.toHaveBeenCalled();
    expect(receiptCreate.mock.calls[0][0].fileType).toBe('text/html');
  });

  it('truncates an over-long subject to 200 chars in notes', async () => {
    fsReaddirMock.mockResolvedValueOnce(['long.pdf']);
    const longSubject = 'X'.repeat(250);
    manifestOk([{ file: 'long.pdf', subject: longSubject }]);

    await importEmailInbox();
    const notes = receiptCreate.mock.calls[0][0].notes as string;
    expect(notes.length).toBe(200);
    expect(notes.startsWith('📧 XXX')).toBe(true);
  });

  it('one file failing to read does not abort the batch: it is skipped, the rest still import', async () => {
    fsReaddirMock.mockResolvedValueOnce(['bad.jpg', 'good.jpg']);
    manifestOk([{ file: 'bad.jpg' }, { file: 'good.jpg', subject: 'ok' }]);
    fsReadFileMock.mockImplementation(async (p: string) => {
      if (String(p).endsWith('manifest.json')) return JSON.stringify([{ file: 'bad.jpg' }, { file: 'good.jpg', subject: 'ok' }]);
      if (String(p).endsWith('bad.jpg')) throw new Error('EIO');
      return Buffer.from('file-bytes');
    });

    const r = await importEmailInbox();
    expect(r).toEqual({ ok: true, imported: 1, skipped: 1 });
    expect(receiptCreate).toHaveBeenCalledTimes(1);
    // The failed file is never renamed into done/.
    expect(fsRenameMock).not.toHaveBeenCalledWith(
      path.join(EMAIL_INBOX, 'bad.jpg'), path.join(EMAIL_INBOX, 'done', 'bad.jpg'),
    );
  });

  it('a Receipt.create failure also counts as skipped, without stopping the batch', async () => {
    fsReaddirMock.mockResolvedValueOnce(['x.jpg', 'y.jpg']);
    manifestOk([{ file: 'x.jpg' }, { file: 'y.jpg' }]);
    receiptCreate.mockImplementationOnce(async () => { throw new Error('validation failed'); });
    receiptCreate.mockImplementationOnce(async (doc: Record<string, any>) => ({ ...doc, _id: 'r2' }));

    const r = await importEmailInbox();
    expect(r).toEqual({ ok: true, imported: 1, skipped: 1 });
  });

  it('swallows a rename failure into done/ without reducing the imported count', async () => {
    fsReaddirMock.mockResolvedValueOnce(['ok.jpg']);
    manifestOk([{ file: 'ok.jpg' }]);
    fsRenameMock.mockRejectedValueOnce(new Error('EBUSY'));

    const r = await importEmailInbox();
    expect(r).toEqual({ ok: true, imported: 1, skipped: 0 });
  });

  it('processes every staged file across a mixed batch and creates the done/ directory once', async () => {
    fsReaddirMock.mockResolvedValueOnce(['a.pdf', 'b.jpg', 'c.html']);
    manifestOk([{ file: 'a.pdf' }, { file: 'b.jpg' }, { file: 'c.html' }]);

    const r = await importEmailInbox();
    expect(r).toEqual({ ok: true, imported: 3, skipped: 0 });
    expect(fsMkdirMock).toHaveBeenCalledWith(path.join(EMAIL_INBOX, 'done'), { recursive: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
  });
});
