import { describe, it, expect, vi, beforeEach } from 'vitest';

// Second slice of app/receipts/actions.ts (756 lines) — the shared OCR-first parse
// pipeline (private `runReceiptParse`) exercised through its three callers: `uploadReceipt`
// (save-a-file draft), `rescanReceipt`/`rescanReceiptOne` (re-run AI on the already-
// stored file), and `rescanReceiptsBulk` (explicit-id batch wrapper around
// `rescanReceiptOne`, reusing every mock in this file 1-to-1 — see its own describe
// block at the bottom). Same idiom as expenses/actions.scan.test.ts: text-PDF -> embedded text,
// scanned-PDF -> rasterize+OCR -> text model (or vision fallback when OCR is unusable),
// image -> OCR-first -> text model (or vision fallback), plus an .html/.htm branch unique
// to receipts (email order-confirmation bodies -> htmlReceiptToText -> text model).
// addReceiptItemsToLibrary, duplicate merge, and email-inbox import are separate concerns
// left for their own test files.
//
// Tenancy: same pass-through mocks as actions.crud.test.ts. safeDate (upload's date
// derivation) and cleanLineItems (private, exercised only indirectly through the saved
// doc) are left real/un-mocked where relevant.
//
// Behaviour pinned:
//  - runReceiptParse mode is 'auto' for uploadReceipt and useOcr?'ocr':'no-ocr' for
//    rescanReceipt. For a PDF, rasterizing only happens when `scanned || mode==='ocr'` —
//    so mode:'no-ocr' on a NON-scanned PDF still uses the embedded text (same as 'auto'),
//    it only changes behaviour once the PDF IS scanned (vision instead of OCR) or the
//    caller forces mode:'ocr' (always rasterizes, even a normal text PDF).
//  - For a plain image, mode:'no-ocr' skips the OCR attempt entirely and goes straight to
//    vision; 'auto'/'ocr' both try OCR first and only fall back to vision when the OCR
//    text is unusable.
//  - uploadReceipt always pre-renders a 480px PDF thumbnail (best-effort, swallowed on
//    error) BEFORE calling runReceiptParse — for a scanned PDF, pdfFirstPageJpeg is
//    therefore called twice: once for the thumbnail (480), once inside the OCR pipeline
//    for the full-res rasterize (1654).
//  - Error categorization (runReceiptParse's catch): ECONNREFUSED/fetch failed/ENOTFOUND
//    -> "Ollama is not reachable"; not found/no such model/pull -> "AI model is not
//    installed"; pdf/password/encrypted -> "Failed to read PDF: <msg>"; else -> generic
//    "AI parse failed: <msg>" (both truncated).
//  - rescanReceiptOne never blanks `store` on an empty re-parse (falls back to the
//    existing value, then 'Unknown store'), always resets `verified:false` and stamps
//    `aiParsedAt`/rawAiResponse/aiModel when something parsed, and revalidates via
//    `safeRevalidate` (not `revalidatePath`, unlike every other export in this file).

const {
  connectDBMock,
  receiptCreate,
  receiptFindById,
  receiptFindByIdAndUpdate,
  getAppSettingsMock,
  isFeatureEnabledMock,
  parseReceiptMock,
  parseReceiptTextMock,
  extractPdfTextMock,
  looksLikeScannedPdfMock,
  ocrImageMock,
  looksLikeUsableOcrMock,
  pdfFirstPageJpegMock,
  htmlReceiptToTextMock,
  saveFileMock,
  readFileMock,
  dispatchEventWebhooksMock,
  safeRevalidateMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  // Echoes the input back (like a real Mongoose .create()) plus an _id — uploadReceipt's
  // webhook dispatch reads store/total/date off the *returned* doc, not the input object.
  receiptCreate: vi.fn(async (doc: Record<string, any>) => ({ ...doc, _id: 'r1' })),
  receiptFindById: vi.fn(async (_id: string) => null as Record<string, any> | null),
  receiptFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  getAppSettingsMock: vi.fn(async () => ({ defaultWarrantyMonths: 24, defaultVatRate: 24 })),
  isFeatureEnabledMock: vi.fn(async () => true),
  parseReceiptMock: vi.fn(async (_b64: string) => ({ parsed: null as any, raw: '', model: 'vision-model' })),
  parseReceiptTextMock: vi.fn(async (_text: string) => ({ parsed: null as any, raw: '', model: 'text-model' })),
  extractPdfTextMock: vi.fn(async (_bytes: Buffer) => ''),
  looksLikeScannedPdfMock: vi.fn((_text: string) => false),
  ocrImageMock: vi.fn(async (_bytes: Buffer, _ext: string) => ''),
  looksLikeUsableOcrMock: vi.fn((_text: string) => false),
  pdfFirstPageJpegMock: vi.fn(async (_bytes: Buffer, _w: number) => null as Buffer | null),
  htmlReceiptToTextMock: vi.fn((html: string) => `TEXT:${html}`),
  saveFileMock: vi.fn(async (_bucket: string, _bytes: Buffer, _ext: string) => ({ relativePath: 'receipts/2026/06/file.bin' })),
  readFileMock: vi.fn(async (_path: string) => Buffer.from('stored-bytes')),
  dispatchEventWebhooksMock: vi.fn(async () => ({ sent: 0, total: 0 })),
  safeRevalidateMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

const receiptModel = {
  create: receiptCreate,
  findById: receiptFindById,
  findByIdAndUpdate: receiptFindByIdAndUpdate,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => receiptModel }));
vi.mock('@/models/Receipt', () => ({ Receipt: {} }));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/lib/storage', () => ({ saveFile: saveFileMock, deleteFile: vi.fn(), readFile: readFileMock }));
vi.mock('@/lib/ollama', () => ({ parseReceipt: parseReceiptMock, parseReceiptText: parseReceiptTextMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: extractPdfTextMock, looksLikeScannedPdf: looksLikeScannedPdfMock }));
vi.mock('@/lib/ocr', () => ({ ocrImage: ocrImageMock, looksLikeUsableOcr: looksLikeUsableOcrMock }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: pdfFirstPageJpegMock }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: safeRevalidateMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({ dispatchEventWebhooks: dispatchEventWebhooksMock }));
vi.mock('@/lib/htmlReceipt', () => ({ htmlReceiptToText: htmlReceiptToTextMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { uploadReceipt, rescanReceipt, rescanReceiptsBulk } from './actions';

function makeFile(name: string, bytes: string, type: string, size?: number): File {
  const blob = new Blob([bytes], { type });
  const f = new File([blob], name, { type });
  if (size != null) Object.defineProperty(f, 'size', { value: size });
  return f;
}

function makeReceiptDoc(base: Record<string, any>) {
  const doc: Record<string, any> = { ...base, save: vi.fn(async () => {}) };
  return doc;
}

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabledMock.mockResolvedValue(true);
  getAppSettingsMock.mockResolvedValue({ defaultWarrantyMonths: 24, defaultVatRate: 24 });
  receiptFindById.mockResolvedValue(null);
  saveFileMock.mockResolvedValue({ relativePath: 'receipts/2026/06/file.bin' });
  parseReceiptMock.mockResolvedValue({ parsed: null, raw: '', model: 'vision-model' });
  parseReceiptTextMock.mockResolvedValue({ parsed: null, raw: '', model: 'text-model' });
  extractPdfTextMock.mockResolvedValue('');
  looksLikeScannedPdfMock.mockReturnValue(false);
  ocrImageMock.mockResolvedValue('');
  looksLikeUsableOcrMock.mockReturnValue(false);
  pdfFirstPageJpegMock.mockResolvedValue(null);
  htmlReceiptToTextMock.mockImplementation((html: string) => `TEXT:${html}`);
});

describe('uploadReceipt — validation', () => {
  it('rejects a missing file before saving anything', async () => {
    const res = await uploadReceipt(new FormData());
    expect(res).toEqual({ ok: false, error: 'No file found' });
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('rejects a file over the 15MB cap', async () => {
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf', 16 * 1024 * 1024));
    const res = await uploadReceipt(fd);
    expect(res).toEqual({ ok: false, error: 'File too large (max 15MB)' });
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('returns a friendly error when saving the file throws', async () => {
    saveFileMock.mockRejectedValueOnce(new Error('disk full'));
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect(res).toEqual({ ok: false, error: 'Failed to save file: disk full' });
    expect(receiptCreate).not.toHaveBeenCalled();
  });
});

describe('uploadReceipt — PDF thumbnail', () => {
  it('renders + saves a page-1 480px thumbnail for a PDF', async () => {
    saveFileMock
      .mockResolvedValueOnce({ relativePath: 'receipts/2026/06/r.pdf' })
      .mockResolvedValueOnce({ relativePath: 'receipts/2026/06/r-thumb.jpg' });
    pdfFirstPageJpegMock.mockResolvedValueOnce(Buffer.from('thumb-jpeg'));
    extractPdfTextMock.mockResolvedValue('Store X total 12.00');
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf'));
    const res = await uploadReceipt(fd);
    expect(res.ok).toBe(true);
    expect(pdfFirstPageJpegMock.mock.calls[0]).toEqual([expect.any(Buffer), 480]);
    expect(receiptCreate.mock.calls[0][0].thumbPath).toBe('receipts/2026/06/r-thumb.jpg');
  });

  it('leaves thumbPath empty when the rendered jpeg is falsy', async () => {
    pdfFirstPageJpegMock.mockResolvedValueOnce(null);
    extractPdfTextMock.mockResolvedValue('Store X total 12.00');
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf'));
    const res = await uploadReceipt(fd);
    expect(res.ok).toBe(true);
    expect(saveFileMock).toHaveBeenCalledTimes(1); // only the main file, no thumbnail save
    expect(receiptCreate.mock.calls[0][0].thumbPath).toBe('');
  });

  it('is never attempted for a non-PDF file', async () => {
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    await uploadReceipt(fd);
    expect(pdfFirstPageJpegMock).not.toHaveBeenCalled();
  });
});

describe('uploadReceipt — parse pipeline branches', () => {
  it('.html body: strips to text via htmlReceiptToText, parses with the TEXT model, model prefixed "email-body+"', async () => {
    const parsed = { store: 'Plaisio', total: 42 };
    parseReceiptTextMock.mockResolvedValue({ parsed, raw: 'raw', model: 'qwen' });
    const fd = new FormData();
    fd.set('file', makeFile('order.html', '<html>Plaisio</html>', 'text/html'));
    const res = await uploadReceipt(fd);
    expect(res).toEqual({ ok: true, id: 'r1', aiUsed: true, aiError: undefined });
    expect(htmlReceiptToTextMock).toHaveBeenCalledWith('<html>Plaisio</html>');
    expect(parseReceiptTextMock).toHaveBeenCalledWith('TEXT:<html>Plaisio</html>');
    expect(receiptCreate.mock.calls[0][0].aiModel).toBe('email-body+qwen');
    expect(parseReceiptMock).not.toHaveBeenCalled();
    expect(ocrImageMock).not.toHaveBeenCalled();
  });

  it('text PDF (not scanned): uses the embedded text directly, no rasterize/OCR', async () => {
    extractPdfTextMock.mockResolvedValue('Skroutz total 19.99');
    looksLikeScannedPdfMock.mockReturnValue(false);
    const parsed = { store: 'Skroutz', total: 19.99 };
    parseReceiptTextMock.mockResolvedValue({ parsed, raw: 'raw', model: 'qwen' });
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf'));
    const res = await uploadReceipt(fd);
    expect(res.ok).toBe(true);
    expect(parseReceiptTextMock).toHaveBeenCalledWith('Skroutz total 19.99');
    expect(receiptCreate.mock.calls[0][0].aiModel).toBe('qwen');
    expect(ocrImageMock).not.toHaveBeenCalled();
    // Only the 480px thumbnail render — no second (1654px) rasterize call.
    expect(pdfFirstPageJpegMock).toHaveBeenCalledTimes(1);
  });

  it('scanned PDF, OCR usable: rasterizes at 1654px then parses the OCR text, model prefixed "ocr-pdf+"', async () => {
    pdfFirstPageJpegMock
      .mockResolvedValueOnce(Buffer.from('thumb'))
      .mockResolvedValueOnce(Buffer.from('full-res'));
    extractPdfTextMock.mockResolvedValue('a'); // short/garbled -> "scanned"
    looksLikeScannedPdfMock.mockReturnValue(true);
    ocrImageMock.mockResolvedValue('legible OCR text');
    looksLikeUsableOcrMock.mockReturnValue(true);
    const parsed = { store: 'Kotsovolos', total: 55 };
    parseReceiptTextMock.mockResolvedValue({ parsed, raw: 'raw', model: 'qwen' });
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf'));
    const res = await uploadReceipt(fd);
    expect(res.ok).toBe(true);
    expect(pdfFirstPageJpegMock).toHaveBeenCalledTimes(2);
    expect(pdfFirstPageJpegMock.mock.calls[1]).toEqual([expect.any(Buffer), 1654]);
    expect(ocrImageMock).toHaveBeenCalledWith(expect.any(Buffer), 'jpg');
    expect(parseReceiptTextMock).toHaveBeenCalledWith('legible OCR text');
    expect(receiptCreate.mock.calls[0][0].aiModel).toBe('ocr-pdf+qwen');
    expect(parseReceiptMock).not.toHaveBeenCalled();
  });

  it('scanned PDF, OCR unusable: falls back to the VISION model on the rasterized page, model prefixed "vision-pdf+"', async () => {
    pdfFirstPageJpegMock
      .mockResolvedValueOnce(Buffer.from('thumb'))
      .mockResolvedValueOnce(Buffer.from('full-res'));
    looksLikeScannedPdfMock.mockReturnValue(true);
    ocrImageMock.mockResolvedValue('');
    looksLikeUsableOcrMock.mockReturnValue(false);
    const parsed = { store: 'Kotsovolos', total: 55 };
    parseReceiptMock.mockResolvedValue({ parsed, raw: 'raw', model: 'qwen-vl' });
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf'));
    const res = await uploadReceipt(fd);
    expect(res.ok).toBe(true);
    expect(parseReceiptMock).toHaveBeenCalledWith(Buffer.from('full-res').toString('base64'));
    expect(receiptCreate.mock.calls[0][0].aiModel).toBe('vision-pdf+qwen-vl');
    expect(parseReceiptTextMock).not.toHaveBeenCalled();
  });

  it('scanned PDF that fails to rasterize: saves a draft with the "Could not rasterize" aiError, nothing parsed', async () => {
    looksLikeScannedPdfMock.mockReturnValue(true);
    pdfFirstPageJpegMock.mockResolvedValueOnce(Buffer.from('thumb')).mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf'));
    const res = await uploadReceipt(fd);
    expect(res).toEqual({ ok: true, id: 'r1', aiUsed: false, aiError: 'Could not rasterize the PDF' });
    expect(receiptCreate.mock.calls[0][0].total).toBe(0);
    expect(receiptCreate.mock.calls[0][0].store).toBe('Unknown store');
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalled();
  });

  it('image, OCR usable: runs OCR then the TEXT parser, model prefixed "ocr+"', async () => {
    ocrImageMock.mockResolvedValue('legible OCR text');
    looksLikeUsableOcrMock.mockReturnValue(true);
    const parsed = { store: 'Amazon', total: 30 };
    parseReceiptTextMock.mockResolvedValue({ parsed, raw: 'raw', model: 'qwen' });
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect(res.ok).toBe(true);
    expect(ocrImageMock).toHaveBeenCalledWith(expect.any(Buffer), 'jpg');
    expect(parseReceiptTextMock).toHaveBeenCalledWith('legible OCR text');
    expect(receiptCreate.mock.calls[0][0].aiModel).toBe('ocr+qwen');
    expect(parseReceiptMock).not.toHaveBeenCalled();
  });

  it('image, OCR unusable: falls back to VISION (no model prefix)', async () => {
    ocrImageMock.mockResolvedValue('');
    looksLikeUsableOcrMock.mockReturnValue(false);
    const parsed = { store: 'Amazon', total: 30 };
    parseReceiptMock.mockResolvedValue({ parsed, raw: 'raw', model: 'qwen-vl' });
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect(res.ok).toBe(true);
    expect(receiptCreate.mock.calls[0][0].aiModel).toBe('qwen-vl'); // unprefixed, unlike the PDF vision-fallback branch
  });

  it('when the receipts AI feature is off, skips parsing entirely and saves an explanatory draft', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect(res).toEqual({ ok: true, id: 'r1', aiUsed: false, aiError: 'AI is off — saved as a draft to fill in manually.' });
    expect(ocrImageMock).not.toHaveBeenCalled();
    expect(parseReceiptMock).not.toHaveBeenCalled();
    const doc = receiptCreate.mock.calls[0][0];
    expect(doc.aiModel).toBe('ai-off');
    expect(doc.verified).toBe(false);
  });
});

describe('uploadReceipt — error categorization (runReceiptParse catch)', () => {
  it('ECONNREFUSED / fetch failed -> "Ollama is not reachable"', async () => {
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect((res as any).aiError).toBe('Ollama is not reachable (check it is running)');
  });

  it('"model not found" -> "AI model is not installed"', async () => {
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockRejectedValue(new Error('model not found, try pull'));
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect((res as any).aiError).toBe('The AI model is not installed');
  });

  it('a PDF-read failure -> "Failed to read PDF: <msg>" (truncated to 100 chars)', async () => {
    extractPdfTextMock.mockRejectedValue(new Error('Encrypted PDF: password required'));
    const fd = new FormData();
    fd.set('file', makeFile('r.pdf', 'x', 'application/pdf'));
    const res = await uploadReceipt(fd);
    expect((res as any).aiError).toBe('Failed to read PDF: Encrypted PDF: password required');
  });

  it('a generic error -> "AI parse failed: <msg>" (truncated to 120 chars)', async () => {
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockRejectedValue(new Error('x'.repeat(200)));
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect((res as any).aiError.startsWith('AI parse failed: ')).toBe(true);
    expect((res as any).aiError.length).toBeLessThanOrEqual('AI parse failed: '.length + 120);
  });
});

describe('uploadReceipt — line-item cleanup + persisted shape', () => {
  it('drops fully-empty line items, falls name back to refinedName then "Item", defaults qty/vatRate', async () => {
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({
      parsed: {
        store: 'Shop',
        total: 10,
        lineItems: [
          { name: '', refinedName: '', price: 0 }, // fully empty -> dropped
          { name: '', refinedName: 'Widget', qty: 2, price: 5 }, // name <- refinedName
          { name: '', refinedName: '', price: 3.5 }, // name <- "Item" (has a price)
          { name: 'Cable', vatRate: 13 }, // explicit vatRate kept
        ],
      },
      raw: 'r',
      model: 'm',
    });
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    await uploadReceipt(fd);
    const lineItems = receiptCreate.mock.calls[0][0].lineItems;
    expect(lineItems).toHaveLength(3);
    expect(lineItems[0]).toEqual({ name: 'Widget', refinedName: 'Widget', qty: 2, price: 5, vatRate: 24 });
    expect(lineItems[1]).toEqual({ name: 'Item', refinedName: '', qty: 1, price: 3.5, vatRate: 24 });
    expect(lineItems[2]).toEqual({ name: 'Cable', refinedName: '', qty: 1, price: 0, vatRate: 13 });
  });

  it('saves store fallback, EU day-first date, fileType/fileSize, always verified:false; fires webhook + revalidate', async () => {
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({ parsed: { date: '15/06/2026', total: 12 }, raw: 'r', model: 'm' });
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    await uploadReceipt(fd);
    const doc = receiptCreate.mock.calls[0][0];
    expect(doc.store).toBe('Unknown store'); // no store on the parsed data
    expect(doc.verified).toBe(false);
    expect(doc.fileType).toBe('image/jpeg');
    expect(doc.fileSize).toBeGreaterThan(0);
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('receipt.parsed', { id: 'r1', store: 'Unknown store', total: 12, date: expect.any(Date) });
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });

  it('never fires the webhook when nothing parsed (e.g. AI off)', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    await uploadReceipt(fd);
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalled();
  });

  it('returns a friendly error when the DB create throws', async () => {
    receiptCreate.mockRejectedValueOnce(new Error('duplicate key'));
    const fd = new FormData();
    fd.set('file', makeFile('r.jpg', 'x', 'image/jpeg'));
    const res = await uploadReceipt(fd);
    expect(res).toEqual({ ok: false, error: 'DB error: duplicate key' });
  });
});

describe('rescanReceipt', () => {
  it('reports an error when the record has no id match', async () => {
    receiptFindById.mockResolvedValue(null);
    const res = await rescanReceipt('missing', false);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'Receipt or file not found' });
  });

  it('reports an error when the record has no stored file', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: '' }));
    const res = await rescanReceipt('r1', false);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'Receipt or file not found' });
  });

  it('returns a friendly error when reading the stored file throws', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r1.jpg' }));
    readFileMock.mockRejectedValueOnce(new Error('ENOENT'));
    const res = await rescanReceipt('r1', false);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'File missing from storage' });
  });

  it('useOcr:false ("no-ocr") on an image skips the OCR attempt entirely and goes straight to vision', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r1.jpg', fileType: 'image/jpeg', store: 'Old' }));
    parseReceiptMock.mockResolvedValue({ parsed: { store: 'New Store', total: 20 }, raw: 'r', model: 'qwen-vl' });
    const res = await rescanReceipt('r1', false);
    expect(res.ok).toBe(true);
    expect(ocrImageMock).not.toHaveBeenCalled();
    expect(parseReceiptMock).toHaveBeenCalled();
  });

  it('useOcr:true ("ocr") forces rasterize even on a PDF that is NOT scanned', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r1.pdf', fileType: 'application/pdf', store: 'Old' }));
    extractPdfTextMock.mockResolvedValue('clean embedded text, plenty of it');
    looksLikeScannedPdfMock.mockReturnValue(false); // NOT scanned
    pdfFirstPageJpegMock.mockResolvedValue(Buffer.from('full-res'));
    ocrImageMock.mockResolvedValue('ocr text');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({ parsed: { store: 'New Store', total: 20 }, raw: 'r', model: 'qwen' });
    const res = await rescanReceipt('r1', true);
    expect(res.ok).toBe(true);
    expect(pdfFirstPageJpegMock).toHaveBeenCalledWith(expect.any(Buffer), 1654); // forced rasterize
    expect(ocrImageMock).toHaveBeenCalled();
  });

  it('on success: overwrites the parsed fields, resets verified:false, stamps aiParsedAt, and saves', async () => {
    const doc = makeReceiptDoc({
      filePath: 'receipts/r1.jpg',
      fileType: 'image/jpeg',
      store: 'Old Store',
      date: new Date('2026-01-01'),
      total: 5,
      subtotal: 0,
      vatAmount: 0,
      warrantyMonths: 12,
      currency: 'EUR',
      paymentMethod: '',
      lineItems: [],
      verified: true,
      rawAiResponse: '',
      aiModel: '',
      aiParsedAt: null,
      _id: 'r1',
    });
    receiptFindById.mockResolvedValue(doc);
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({
      parsed: { store: 'Kotsovolos', date: '2026-06-10', total: 99, subtotal: 80, vatAmount: 19, currency: 'EUR', paymentMethod: 'card', lineItems: [{ name: 'Cable', price: 5 }] },
      raw: 'raw-text',
      model: 'qwen',
    });
    // useOcr:true — on an image this is the only mode that goes through OCR+text
    // (mode:'no-ocr' skips straight to vision, see the dedicated test above).
    const res = await rescanReceipt('r1', true);
    expect(res.ok).toBe(true);
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(doc.store).toBe('Kotsovolos');
    expect(doc.total).toBe(99);
    expect(doc.paymentMethod).toBe('card');
    expect(doc.lineItems).toEqual([{ name: 'Cable', refinedName: '', qty: 1, price: 5, vatRate: 24 }]);
    expect(doc.verified).toBe(false);
    expect(doc.aiParsedAt).toBeInstanceOf(Date);
    expect(doc.rawAiResponse).toBe('raw-text');
    expect(doc.aiModel).toBe('ocr+qwen');
    expect((res as any).model).toBe('ocr+qwen');
    expect((res as any).receipt._id).toBe('r1');
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('receipt.parsed', { id: 'r1', store: 'Kotsovolos', total: 99, date: doc.date });
    expect(safeRevalidateMock).toHaveBeenCalledWith('/receipts');
  });

  it('never blanks store on an empty re-parse: falls back to the existing value', async () => {
    const doc = makeReceiptDoc({ filePath: 'receipts/r1.jpg', fileType: 'image/jpeg', store: 'Existing Store', verified: true, _id: 'r1' });
    receiptFindById.mockResolvedValue(doc);
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({ parsed: { store: '  ', total: 0 }, raw: '', model: 'qwen' });
    await rescanReceipt('r1', false);
    expect(doc.store).toBe('Existing Store');
  });

  it('when nothing parsed (AI throws): leaves the receipt fields untouched, still stamps rawAiResponse/aiModel, and does not fire the webhook', async () => {
    // useOcr:false on an image goes straight to vision (parseReceipt) — reject it so
    // runReceiptParse's catch path produces the real { parsed:null, aiError } shape;
    // the vision/text mocks never carry an `aiError` field themselves (ParseOut only
    // gets one from the "could not rasterize" branch or this catch block).
    const doc = makeReceiptDoc({ filePath: 'receipts/r1.jpg', fileType: 'image/jpeg', store: 'Existing Store', total: 5, verified: true, _id: 'r1' });
    receiptFindById.mockResolvedValue(doc);
    parseReceiptMock.mockRejectedValue(new Error('boom'));
    const res = await rescanReceipt('r1', false);
    expect(res).toEqual({ ok: true, aiUsed: false, model: '', aiError: 'AI parse failed: boom', receipt: expect.any(Object) });
    expect(doc.store).toBe('Existing Store'); // untouched
    expect(doc.total).toBe(5);
    expect(doc.verified).toBe(true); // untouched — only resets to false when something DID parse
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalled();
  });

  it('returns a friendly error when save() throws', async () => {
    const doc = makeReceiptDoc({ filePath: 'receipts/r1.jpg', fileType: 'image/jpeg', store: 'X', _id: 'r1' });
    doc.save = vi.fn(async () => {
      throw new Error('validation failed: total is required');
    });
    receiptFindById.mockResolvedValue(doc);
    const res = await rescanReceipt('r1', false);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'Save failed: validation failed: total is required' });
  });
});

describe('rescanReceiptsBulk', () => {
  it('is a no-op on an empty id list, still revalidates', async () => {
    const res = await rescanReceiptsBulk([]);
    expect(res).toEqual({ ok: true, recovered: 0, processed: 0 });
    expect(receiptFindById).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });

  it('caps the batch to the first 6 ids, ignoring the rest', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r.jpg', fileType: 'image/jpeg', store: 'X' }));
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({ parsed: { store: 'X', total: 10 }, raw: 'r', model: 'm' });
    const ids = Array.from({ length: 9 }, (_, i) => `id${i}`);
    const res = await rescanReceiptsBulk(ids);
    expect(res.processed).toBe(6);
    expect(receiptFindById).toHaveBeenCalledTimes(6);
  });

  it('counts a receipt as recovered when the re-parse yields total>0', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r.jpg', fileType: 'image/jpeg', store: 'X' }));
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({ parsed: { store: 'X', total: 10 }, raw: 'r', model: 'm' });
    const res = await rescanReceiptsBulk(['id1']);
    expect(res).toEqual({ ok: true, recovered: 1, processed: 1 });
  });

  it('counts a receipt as recovered when total is 0 but line items came back', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r.jpg', fileType: 'image/jpeg', store: 'X' }));
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({ parsed: { store: 'X', total: 0, lineItems: [{ name: 'Cable', price: 5 }] }, raw: 'r', model: 'm' });
    const res = await rescanReceiptsBulk(['id1']);
    expect(res).toEqual({ ok: true, recovered: 1, processed: 1 });
  });

  it('does not count a receipt as recovered when the re-parse stays empty (total 0, no items)', async () => {
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r.jpg', fileType: 'image/jpeg', store: 'X' }));
    ocrImageMock.mockResolvedValue('');
    looksLikeUsableOcrMock.mockReturnValue(false);
    parseReceiptMock.mockResolvedValue({ parsed: null, raw: '', model: 'qwen-vl' }); // nothing parsed
    const res = await rescanReceiptsBulk(['id1']);
    expect(res).toEqual({ ok: true, recovered: 0, processed: 1 });
  });

  it('does not count a receipt as recovered when rescanReceiptOne returns ok:false', async () => {
    receiptFindById.mockResolvedValue(null); // "Receipt or file not found"
    const res = await rescanReceiptsBulk(['missing']);
    expect(res).toEqual({ ok: true, recovered: 0, processed: 1 });
  });

  it('one bad receipt (throws) does not abort the batch: caught, flagged aiModel:"ocr-error", rest still processes', async () => {
    receiptFindById
      .mockRejectedValueOnce(new Error('DB blew up'))
      .mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r.jpg', fileType: 'image/jpeg', store: 'X' }));
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseReceiptTextMock.mockResolvedValue({ parsed: { store: 'X', total: 10 }, raw: 'r', model: 'm' });
    const res = await rescanReceiptsBulk(['bad', 'good']);
    expect(res).toEqual({ ok: true, recovered: 1, processed: 2 });
    expect(receiptFindByIdAndUpdate).toHaveBeenCalledWith('bad', { aiModel: 'ocr-error' });
  });

  it('swallows a failure in the catch-recovery findByIdAndUpdate itself', async () => {
    receiptFindById.mockRejectedValueOnce(new Error('boom'));
    receiptFindByIdAndUpdate.mockRejectedValueOnce(new Error('also boom'));
    const res = await rescanReceiptsBulk(['bad']);
    expect(res).toEqual({ ok: true, recovered: 0, processed: 1 });
  });

  it('always revalidates "/receipts" via its own revalidatePath call once, on top of each item\'s own safeRevalidate', async () => {
    // rescanReceiptOne (invoked per item) already calls safeRevalidate itself — the
    // bulk wrapper adds one more revalidatePath call of its own, after the whole batch.
    receiptFindById.mockResolvedValue(makeReceiptDoc({ filePath: 'receipts/r.jpg', fileType: 'image/jpeg', store: 'X' }));
    await rescanReceiptsBulk(['id1']);
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
    expect(safeRevalidateMock).toHaveBeenCalledWith('/receipts');
  });
});
