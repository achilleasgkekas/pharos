import { describe, it, expect, vi, beforeEach } from 'vitest';

// Third focused slice of app/expenses/actions.ts (621 lines) — the AI scan/upload/rescan
// concern: scanExpenseText/scanExpenseImage (preview-only, no save) + uploadExpense
// (save-a-file draft) + rescanExpense (re-run AI on the already-stored file). All four
// share the private `runExpenseParse` OCR-first pipeline (text-PDF -> parseExpenseText,
// scanned-PDF -> rasterize+OCR -> parseExpenseText or vision fallback, image -> OCR-first
// then vision fallback) — same idiom as the receipts/statements OCR pipelines elsewhere
// in the repo. generateDueRecurring, importExpensesCsv, and applyCategoryRulesToExisting
// are separate concerns already covered (or left) in their own files.
//
// Tenancy: same pass-through mocks as actions.crud.test.ts (withRequestTenant/currentModel
// are no-ops in self-hosted mode; tenant isolation itself is covered elsewhere).
// vendorKey/serializeExpense (./lib) and matchCategoryRule (@/lib/categoryRules) are left
// REAL (pure, DB-free, already pinned in their own test files) so the category-resolution
// chain is exercised end-to-end; safeDate likewise real.

const {
  connectDBMock,
  expenseCreate,
  expenseFindById,
  expenseFindOneSortLean,
  getAppSettingsMock,
  isFeatureEnabledMock,
  parseExpenseTextMock,
  parseExpenseImageMock,
  extractPdfTextMock,
  looksLikeScannedPdfMock,
  ocrImageMock,
  looksLikeUsableOcrMock,
  pdfFirstPageJpegMock,
  saveFileMock,
  readFileMock,
  mirrorFileToRemoteMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  expenseCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'e1' })),
  expenseFindById: vi.fn(async (_id: string) => null as Record<string, any> | null),
  expenseFindOneSortLean: vi.fn(async () => null as Record<string, any> | null),
  getAppSettingsMock: vi.fn(async () => ({ categoryRules: [] as any[] })),
  isFeatureEnabledMock: vi.fn(async () => true),
  parseExpenseTextMock: vi.fn(async (_text: string) => ({ parsed: null as any, raw: '', model: 'text-model' })),
  parseExpenseImageMock: vi.fn(async (_b64: string) => ({ parsed: null as any, raw: '', model: 'vision-model' })),
  extractPdfTextMock: vi.fn(async (_bytes: Buffer) => ''),
  looksLikeScannedPdfMock: vi.fn((_text: string) => false),
  ocrImageMock: vi.fn(async (_bytes: Buffer, _ext: string) => ''),
  looksLikeUsableOcrMock: vi.fn((_text: string) => false),
  pdfFirstPageJpegMock: vi.fn(async (_bytes: Buffer, _w: number) => null as Buffer | null),
  saveFileMock: vi.fn(async (_bucket: string, _bytes: Buffer, _ext: string) => ({ relativePath: 'expenses/2026/06/file.bin' })),
  readFileMock: vi.fn(async (_path: string) => Buffer.from('stored-bytes')),
  mirrorFileToRemoteMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

const expenseModel = {
  create: expenseCreate,
  findById: expenseFindById,
  findOne: () => ({ sort: () => ({ lean: expenseFindOneSortLean }) }),
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => expenseModel }));
vi.mock('@/models/Expense', () => ({ Expense: {} }));
vi.mock('@/lib/storage', () => ({ saveFile: saveFileMock, deleteFile: vi.fn(), readFile: readFileMock }));
vi.mock('@/lib/ollama', () => ({ parseExpenseText: parseExpenseTextMock, parseExpenseImage: parseExpenseImageMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: extractPdfTextMock, looksLikeScannedPdf: looksLikeScannedPdfMock }));
vi.mock('@/lib/ocr', () => ({ ocrImage: ocrImageMock, looksLikeUsableOcr: looksLikeUsableOcrMock }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: pdfFirstPageJpegMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: mirrorFileToRemoteMock }));
vi.mock('@/lib/csvImport', () => ({ csvDedupeKey: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { scanExpenseText, scanExpenseImage, uploadExpense, rescanExpense } from './actions';

function makeFile(name: string, bytes: string, type: string, size?: number): File {
  const blob = new Blob([bytes], { type });
  const f = new File([blob], name, { type });
  if (size != null) Object.defineProperty(f, 'size', { value: size });
  return f;
}

function makeExpenseDoc(base: Record<string, any>) {
  const doc: Record<string, any> = { ...base, save: vi.fn(async () => {}) };
  doc.toObject = () => {
    const { save: _s, toObject: _t, ...rest } = doc;
    return rest;
  };
  return doc;
}

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabledMock.mockResolvedValue(true);
  getAppSettingsMock.mockResolvedValue({ categoryRules: [] });
  expenseFindOneSortLean.mockResolvedValue(null);
  expenseFindById.mockResolvedValue(null);
  saveFileMock.mockResolvedValue({ relativePath: 'expenses/2026/06/file.bin' });
  parseExpenseTextMock.mockResolvedValue({ parsed: null, raw: '', model: 'text-model' });
  parseExpenseImageMock.mockResolvedValue({ parsed: null, raw: '', model: 'vision-model' });
  extractPdfTextMock.mockResolvedValue('');
  looksLikeScannedPdfMock.mockReturnValue(false);
  ocrImageMock.mockResolvedValue('');
  looksLikeUsableOcrMock.mockReturnValue(false);
  pdfFirstPageJpegMock.mockResolvedValue(null);
});

describe('scanExpenseText', () => {
  it('refuses when the expenses AI feature is off, without calling the parser', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const res = await scanExpenseText('some bill text');
    expect(res).toEqual({ ok: false, error: 'Bill scanning (AI) is turned off.' });
    expect(parseExpenseTextMock).not.toHaveBeenCalled();
  });

  it('rejects blank/whitespace-only text before calling the parser', async () => {
    const res = await scanExpenseText('   ');
    expect(res).toEqual({ ok: false, error: 'Paste some bill text first' });
    expect(parseExpenseTextMock).not.toHaveBeenCalled();
  });

  it('returns the parsed data on success', async () => {
    const parsed = { vendor: 'ΔΕΗ', amount: 42 };
    parseExpenseTextMock.mockResolvedValue({ parsed, raw: 'raw', model: 'text-model' });
    const res = await scanExpenseText('ΔΕΗ bill 42 euro');
    expect(res).toEqual({ ok: true, data: parsed });
    expect(parseExpenseTextMock).toHaveBeenCalledWith('ΔΕΗ bill 42 euro');
  });

  it('wraps a thrown error into a truncated "AI scan failed" message', async () => {
    parseExpenseTextMock.mockRejectedValue(new Error('x'.repeat(200)));
    const res = await scanExpenseText('bill');
    expect(res.ok).toBe(false);
    expect((res as any).error.startsWith('AI scan failed: ')).toBe(true);
    expect((res as any).error.length).toBeLessThanOrEqual('AI scan failed: '.length + 140);
  });
});

describe('scanExpenseImage', () => {
  it('refuses when the expenses AI feature is off', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await scanExpenseImage(fd);
    expect(res).toEqual({ ok: false, error: 'Bill scanning (AI) is turned off.' });
  });

  it('rejects a missing file', async () => {
    const res = await scanExpenseImage(new FormData());
    expect(res).toEqual({ ok: false, error: 'No file' });
  });

  it('rejects a file over the 15MB cap', async () => {
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg', 16 * 1024 * 1024));
    const res = await scanExpenseImage(fd);
    expect(res).toEqual({ ok: false, error: 'File too large (max 15MB)' });
  });

  it('image, OCR usable: runs OCR then the TEXT parser, model prefixed "ocr+"', async () => {
    ocrImageMock.mockResolvedValue('legible OCR text');
    looksLikeUsableOcrMock.mockReturnValue(true);
    const parsed = { vendor: 'Shop', amount: 9 };
    parseExpenseTextMock.mockResolvedValue({ parsed, raw: 'r', model: 'qwen' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await scanExpenseImage(fd);
    expect(res).toEqual({ ok: true, data: parsed });
    expect(ocrImageMock).toHaveBeenCalled();
    expect(parseExpenseTextMock).toHaveBeenCalledWith('legible OCR text');
    expect(parseExpenseImageMock).not.toHaveBeenCalled();
  });

  it('image, OCR unusable: falls back to the VISION parser', async () => {
    ocrImageMock.mockResolvedValue('');
    looksLikeUsableOcrMock.mockReturnValue(false);
    const parsed = { vendor: 'Shop', amount: 9 };
    parseExpenseImageMock.mockResolvedValue({ parsed, raw: 'r', model: 'vision-model' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await scanExpenseImage(fd);
    expect(res).toEqual({ ok: true, data: parsed });
    expect(parseExpenseImageMock).toHaveBeenCalled();
  });

  it('returns the aiError when nothing could be parsed', async () => {
    ocrImageMock.mockResolvedValue('');
    looksLikeUsableOcrMock.mockReturnValue(false);
    parseExpenseImageMock.mockResolvedValue({ parsed: null, raw: '', model: 'vision-model' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await scanExpenseImage(fd);
    expect(res).toEqual({ ok: false, error: 'AI returned nothing' });
  });
});

describe('uploadExpense', () => {
  it('rejects a missing file before saving anything', async () => {
    const res = await uploadExpense(new FormData());
    expect(res).toEqual({ ok: false, error: 'No file found' });
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('rejects a file over the 15MB cap', async () => {
    const fd = new FormData();
    fd.set('file', makeFile('bill.pdf', 'x', 'application/pdf', 16 * 1024 * 1024));
    const res = await uploadExpense(fd);
    expect(res).toEqual({ ok: false, error: 'File too large (max 15MB)' });
  });

  it('returns a friendly error when saving the file throws', async () => {
    saveFileMock.mockRejectedValueOnce(new Error('disk full'));
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await uploadExpense(fd);
    expect(res).toEqual({ ok: false, error: 'Could not save file: disk full' });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('a PDF also renders + saves a page-1 thumbnail; a falsy jpeg leaves thumbPath empty', async () => {
    saveFileMock
      .mockResolvedValueOnce({ relativePath: 'expenses/2026/06/bill.pdf' })
      .mockResolvedValueOnce({ relativePath: 'expenses/2026/06/bill-thumb.jpg' });
    pdfFirstPageJpegMock.mockResolvedValue(Buffer.from('jpeg-bytes'));
    extractPdfTextMock.mockResolvedValue('ΔΕΗ 42.00 total');
    parseExpenseTextMock.mockResolvedValue({ parsed: { vendor: 'ΔΕΗ', amount: 42 }, raw: 'r', model: 'text-model' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.pdf', 'x', 'application/pdf'));
    const res = await uploadExpense(fd);
    expect(res.ok).toBe(true);
    expect(saveFileMock).toHaveBeenCalledTimes(2);
    expect(expenseCreate.mock.calls[0][0].thumbPath).toBe('expenses/2026/06/bill-thumb.jpg');

    // Now the falsy-jpeg case.
    vi.clearAllMocks();
    isFeatureEnabledMock.mockResolvedValue(true);
    saveFileMock.mockResolvedValue({ relativePath: 'expenses/2026/06/bill2.pdf' });
    pdfFirstPageJpegMock.mockResolvedValue(null);
    extractPdfTextMock.mockResolvedValue('');
    const fd2 = new FormData();
    fd2.set('file', makeFile('bill2.pdf', 'x', 'application/pdf'));
    const res2 = await uploadExpense(fd2);
    expect(res2.ok).toBe(true);
    expect(saveFileMock).toHaveBeenCalledTimes(1); // no thumbnail saved
    expect(expenseCreate.mock.calls[0][0].thumbPath).toBe('');
  });

  it('when the expenses AI feature is off, skips parsing and saves a manual draft with an explanatory aiError', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await uploadExpense(fd);
    expect(res).toEqual({ ok: true, id: 'e1', aiUsed: false, aiError: 'AI is off — saved as a draft to fill in manually.' });
    expect(ocrImageMock).not.toHaveBeenCalled();
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.aiModel).toBe('ai-off');
    expect(doc.verified).toBe(false);
  });

  it('category chain: an explicit vendor rule wins over the AI-parsed category', async () => {
    getAppSettingsMock.mockResolvedValue({
      categoryRules: [{ id: 'r1', match: 'ΔΕΗ', matchType: 'vendor', category: 'utilities', recurring: true, recurringCycle: 'monthly' }],
    });
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseExpenseTextMock.mockResolvedValue({ parsed: { vendor: 'ΔΕΗ', category: 'ai-guessed', amount: 10 }, raw: 'r', model: 'm' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await uploadExpense(fd);
    expect(res.ok).toBe(true);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.category).toBe('utilities');
    expect(doc.recurring).toBe(true);
    expect(doc.recurringCycle).toBe('monthly');
    expect(doc.vendorKey).toBe('dei');
  });

  it('category chain: falls back to the AI-parsed category, then the inherited series, then "other"', async () => {
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseExpenseTextMock.mockResolvedValue({ parsed: { vendor: 'New Shop', category: 'ai-guessed', amount: 10 }, raw: 'r', model: 'm' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await uploadExpense(fd);
    expect(res.ok).toBe(true);
    expect(expenseCreate.mock.calls[0][0].category).toBe('ai-guessed');
  });

  it('inherits space/taxDeductible/taxCategory from the matching prior series', async () => {
    expenseFindOneSortLean.mockResolvedValue({ category: 'utilities', recurring: false, space: 'cottage', taxDeductible: true, taxCategory: 'medical' });
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseExpenseTextMock.mockResolvedValue({ parsed: { vendor: 'ΔΕΗ', amount: 10 }, raw: 'r', model: 'm' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    await uploadExpense(fd);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.space).toBe('cottage');
    expect(doc.taxDeductible).toBe(true);
    expect(doc.taxCategory).toBe('medical');
  });

  it('always saves as an unverified draft (verified:false), fires the mirror, and revalidates both paths', async () => {
    ocrImageMock.mockResolvedValue('legible');
    looksLikeUsableOcrMock.mockReturnValue(true);
    parseExpenseTextMock.mockResolvedValue({ parsed: { vendor: 'Shop', amount: 10 }, raw: 'r', model: 'm' });
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await uploadExpense(fd);
    expect(res).toEqual({ ok: true, id: 'e1', aiUsed: true, aiError: undefined });
    expect(expenseCreate.mock.calls[0][0].verified).toBe(false);
    expect(mirrorFileToRemoteMock).toHaveBeenCalledTimes(1);
    expect(mirrorFileToRemoteMock.mock.calls[0][0]).toMatchObject({ kind: 'expenses' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('returns a friendly error when the DB create throws', async () => {
    expenseCreate.mockRejectedValueOnce(new Error('duplicate key'));
    const fd = new FormData();
    fd.set('file', makeFile('bill.jpg', 'x', 'image/jpeg'));
    const res = await uploadExpense(fd);
    expect(res).toEqual({ ok: false, error: 'Could not save: duplicate key' });
  });
});

describe('rescanExpense', () => {
  it('reports an error when the record has no id match', async () => {
    expenseFindById.mockResolvedValue(null);
    const res = await rescanExpense('missing', false);
    expect(res).toEqual({ ok: false, error: 'No file to scan' });
  });

  it('reports an error when the record has no stored file', async () => {
    expenseFindById.mockResolvedValue(makeExpenseDoc({ filePath: '' }));
    const res = await rescanExpense('e1', false);
    expect(res).toEqual({ ok: false, error: 'No file to scan' });
  });

  it('reads the stored file, re-parses it (respecting useOcr), and reports the aiError when nothing could be parsed', async () => {
    expenseFindById.mockResolvedValue(makeExpenseDoc({ filePath: 'expenses/2026/06/bill.pdf', kind: 'expense' }));
    extractPdfTextMock.mockResolvedValue('');
    looksLikeScannedPdfMock.mockReturnValue(false);
    pdfFirstPageJpegMock.mockResolvedValue(null);
    const res = await rescanExpense('e1', true); // forced OCR
    expect(readFileMock).toHaveBeenCalledWith('expenses/2026/06/bill.pdf');
    // useOcr:true forces the PDF down the rasterize branch even though it's not "scanned"
    expect(pdfFirstPageJpegMock).toHaveBeenCalled();
    expect(res).toEqual({ ok: false, error: 'Could not rasterize the PDF' });
  });

  it('on success, overwrites the parsed fields, re-derives vendorKey/period, clears verified, and saves', async () => {
    const doc = makeExpenseDoc({
      filePath: 'expenses/2026/06/bill.pdf',
      kind: 'expense',
      vendor: 'Old Vendor',
      vendorKey: 'oldvendor',
      category: 'other',
      amount: 5,
      currency: 'EUR',
      date: new Date('2026-01-01T00:00:00.000Z'),
      period: '2026-01',
      recurringCycle: '',
      paymentMethod: '',
      rawAiResponse: '',
      aiModel: '',
      aiParsedAt: null,
      verified: true,
      _id: 'e1',
    });
    expenseFindById.mockResolvedValue(doc);
    extractPdfTextMock.mockResolvedValue('ΔΕΗ 88.00 2026-06-10');
    looksLikeScannedPdfMock.mockReturnValue(false);
    parseExpenseTextMock.mockResolvedValue({
      parsed: { kind: 'expense', vendor: 'ΔΕΗ', category: 'utilities', amount: 88, currency: 'EUR', date: '2026-06-10', period: '2026-06', paymentMethod: 'card' },
      raw: 'raw-text',
      model: 'text-model',
    });
    const res = await rescanExpense('e1', false);
    expect(res.ok).toBe(true);
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(doc.vendor).toBe('ΔΕΗ');
    expect(doc.vendorKey).toBe('dei');
    expect(doc.category).toBe('utilities');
    expect(doc.amount).toBe(88);
    expect(doc.period).toBe('2026-06');
    expect(doc.paymentMethod).toBe('card');
    expect(doc.rawAiResponse).toBe('raw-text');
    expect(doc.aiModel).toBe('text-model');
    expect(doc.verified).toBe(false); // re-parsed -> back into the review queue
    expect((res as any).expense._id).toBe('e1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('keeps the existing field when the re-parse leaves it blank (e.g. no new paymentMethod)', async () => {
    const doc = makeExpenseDoc({
      filePath: 'expenses/2026/06/bill.pdf',
      kind: 'expense',
      vendor: 'Old Vendor',
      vendorKey: 'oldvendor',
      category: 'utilities',
      amount: 5,
      currency: 'EUR',
      date: new Date('2026-01-01T00:00:00.000Z'),
      period: '2026-01',
      recurringCycle: 'monthly',
      paymentMethod: 'cash',
      verified: true,
      _id: 'e1',
    });
    expenseFindById.mockResolvedValue(doc);
    extractPdfTextMock.mockResolvedValue('some text');
    looksLikeScannedPdfMock.mockReturnValue(false);
    parseExpenseTextMock.mockResolvedValue({
      parsed: { vendor: '', category: '', amount: undefined, date: '2026-01-15', recurringCycle: '', paymentMethod: '' },
      raw: '',
      model: 'text-model',
    });
    await rescanExpense('e1', false);
    expect(doc.vendor).toBe('Old Vendor'); // blank parsed vendor -> keeps old
    expect(doc.category).toBe('utilities');
    expect(doc.amount).toBe(5);
    expect(doc.recurringCycle).toBe('monthly'); // falsy parsed cycle -> keeps old
    expect(doc.paymentMethod).toBe('cash');
  });

  it('returns a friendly error when reading the stored file throws', async () => {
    expenseFindById.mockResolvedValue(makeExpenseDoc({ filePath: 'expenses/2026/06/bill.pdf' }));
    readFileMock.mockRejectedValueOnce(new Error('file missing on disk'));
    const res = await rescanExpense('e1', false);
    expect(res).toEqual({ ok: false, error: 'file missing on disk' });
  });
});
