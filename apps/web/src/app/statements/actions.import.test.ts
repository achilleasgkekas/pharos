import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real FX conversion with mocked persistence/AI. Duplicate imports must never
// replace a saved statement, and rejected uploads must not leak stored PDFs.

const {
  connectDBMock,
  statementFind,
  statementFindOne,
  statementFindOneAndUpdate,
  statementCreate,
  cardFindOne,
  cardCreate,
  statementFindByIdAndUpdate,
  saveFileMock,
  deleteFileMock,
  extractPdfTextMock,
  looksLikeScannedPdfMock,
  parseStatementTextMock,
  isFeatureEnabledMock,
  installmentSignatureMock,
  mirrorFileToRemoteMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  statementFind: vi.fn((_filter: Record<string, unknown>, _proj: Record<string, unknown>) => ({ lean: async () => [] as any[] })),
  statementFindOne: vi.fn((_filter: Record<string, unknown>, _proj: Record<string, unknown>) => ({ lean: async () => null as any })),
  statementFindOneAndUpdate: vi.fn(async (_filter: any, doc: any, _opts: any) => ({ ...doc, _id: 's-new' })),
  statementCreate: vi.fn(async (doc: any) => ({ ...doc, _id: doc.notes ? 's-draft' : 's-new' })),
  cardFindOne: vi.fn(async (_q: Record<string, unknown>): Promise<any> => null),
  cardCreate: vi.fn(async (doc: any) => ({ _id: 'c1', name: doc.name, last4: doc.last4 })),
  statementFindByIdAndUpdate: vi.fn(async (_id: string, _doc: any) => ({})),
  deleteFileMock: vi.fn(async (_path: string) => {}),
  saveFileMock: vi.fn(async (_bucket: string, _bytes: Buffer, _ext: string) => ({ relativePath: 'statements/2026/06/file.pdf' })),
  extractPdfTextMock: vi.fn(async (_bytes: Buffer): Promise<string> => 'some pdf text'),
  looksLikeScannedPdfMock: vi.fn((_text: string) => false),
  parseStatementTextMock: vi.fn(async (_text: string): Promise<{ parsed: any }> => ({ parsed: { transactions: [] } })),
  isFeatureEnabledMock: vi.fn(async (_key: string) => true),
  // Period-invariant per description, same convention as actions.rescan.test.ts.
  installmentSignatureMock: vi.fn((t: any, _period: string) => (t?.description ? `sig:${t.description}` : '')),
  mirrorFileToRemoteMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: any) => m }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Statement', () => ({
  Statement: {
    find: statementFind,
    findOne: statementFindOne,
    findOneAndUpdate: statementFindOneAndUpdate,
    create: statementCreate,
    findByIdAndUpdate: statementFindByIdAndUpdate,
  },
}));
vi.mock('@/models/Card', () => ({ Card: { findOne: cardFindOne, create: cardCreate } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: vi.fn() } }));
vi.mock('@/lib/storage', () => ({ saveFile: saveFileMock, deleteFile: deleteFileMock, readFile: vi.fn() }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: extractPdfTextMock, looksLikeScannedPdf: looksLikeScannedPdfMock }));
vi.mock('@/lib/ocr', () => ({ ocrPdf: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseStatementText: parseStatementTextMock, categorizeTransactions: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/cards', () => ({
  normalizeLast4: (s: string) => (s || '').replace(/\D/g, '').slice(-4),
  detectCardType: () => 'credit',
  buildCardLabel: (n: string, l: string) => (l ? `${n} ••${l}` : n),
}));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: mirrorFileToRemoteMock }));
vi.mock('@/lib/installments', () => ({ installmentSignature: installmentSignatureMock }));
vi.mock('@/lib/reconcile', () => ({ reconcile: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { attachStatementPdf, importStatementPdf } from './actions';

const ITEM9 = '507f1f77bcf86cd799439019';

function pdfFile(name = 'statement.pdf', bytes: number[] = [1, 2, 3], type = 'application/pdf') {
  return new File([new Uint8Array(bytes)], name, { type });
}

function formWith(file: File | null) {
  const fd = new FormData();
  if (file) fd.set('file', file);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  statementFind.mockImplementation(() => ({ lean: async () => [] }));
  statementFindOne.mockImplementation(() => ({ lean: async () => null }));
  statementCreate.mockImplementation(async (doc: any) => ({ ...doc, _id: 's-new' }));
  statementCreate.mockImplementation(async (doc: any) => ({ ...doc, _id: doc.notes ? 's-draft' : 's-new' }));
  cardFindOne.mockImplementation(async () => null);
  cardCreate.mockImplementation(async (doc: any) => ({ _id: 'c1', name: doc.name, last4: doc.last4 }));
  statementFindByIdAndUpdate.mockImplementation(async () => ({}));
  saveFileMock.mockResolvedValue({ relativePath: 'statements/2026/06/file.pdf' });
  extractPdfTextMock.mockResolvedValue('some pdf text');
  looksLikeScannedPdfMock.mockReturnValue(false);
  parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
  isFeatureEnabledMock.mockResolvedValue(true);
  installmentSignatureMock.mockImplementation((t: any) => (t?.description ? `sig:${t.description}` : ''));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('attachStatementPdf', () => {
  it('reports an error and never saves when there is no file', async () => {
    const res = await attachStatementPdf('s1', formWith(null));
    expect(res).toEqual({ ok: false, error: 'No file found' });
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('reports an error on a zero-size file', async () => {
    const res = await attachStatementPdf('s1', formWith(pdfFile('x.pdf', [])));
    expect(res).toEqual({ ok: false, error: 'No file found' });
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('derives the extension from the filename, lowercased', async () => {
    await attachStatementPdf('s1', formWith(pdfFile('Statement.PDF')));
    expect(saveFileMock).toHaveBeenCalledWith('statements', expect.any(Buffer), 'pdf');
  });

  it('falls back to "pdf" when the filename has no usable extension', async () => {
    await attachStatementPdf('s1', formWith(pdfFile('', [1])));
    expect(saveFileMock).toHaveBeenCalledWith('statements', expect.any(Buffer), 'pdf');
  });

  it('on success: updates the statement filePath, revalidates /statements, returns {ok:true}', async () => {
    const res = await attachStatementPdf('s1', formWith(pdfFile()));
    expect(statementFindByIdAndUpdate).toHaveBeenCalledWith('s1', { filePath: 'statements/2026/06/file.pdf' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(res).toEqual({ ok: true });
  });

  it('propagates (rejects on) a thrown saveFile error — no try/catch around it', async () => {
    saveFileMock.mockRejectedValueOnce(new Error('disk full'));
    await expect(attachStatementPdf('s1', formWith(pdfFile()))).rejects.toThrow('disk full');
  });
});

describe('importStatementPdf — file validation', () => {
  it('reports an error when there is no file', async () => {
    const res = await importStatementPdf(formWith(null));
    expect(res).toEqual({ ok: false, error: 'No file found' });
  });

  it('reports an error on a zero-size file', async () => {
    const res = await importStatementPdf(formWith(pdfFile('x.pdf', [])));
    expect(res).toEqual({ ok: false, error: 'No file found' });
  });

  it('rejects a non-PDF filename with a non-PDF mime type', async () => {
    const res = await importStatementPdf(formWith(pdfFile('image.png', [1], 'image/png')));
    expect(res).toEqual({ ok: false, error: 'A PDF file is required' });
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('accepts a .pdf-suffixed name even with a generic mime type', async () => {
    const res = await importStatementPdf(formWith(pdfFile('statement.PDF', [1], 'application/octet-stream')));
    expect(res.ok).toBe(true);
  });

  it('accepts an extensionless name whose mime type is application/pdf', async () => {
    const res = await importStatementPdf(formWith(pdfFile('upload', [1], 'application/pdf')));
    expect(res.ok).toBe(true);
  });
});

describe('importStatementPdf — save / read failures', () => {
  it('a thrown saveFile -> "Failed to save: <msg>"', async () => {
    saveFileMock.mockRejectedValueOnce(new Error('quota exceeded'));
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toEqual({ ok: false, error: 'Failed to save: quota exceeded' });
  });

  it('a thrown extractPdfText -> "Failed to read PDF: <msg>"', async () => {
    extractPdfTextMock.mockRejectedValueOnce(new Error('corrupt PDF'));
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toEqual({ ok: false, error: 'Failed to read PDF: corrupt PDF' });
  });
});

describe('importStatementPdf — scanned / AI-off draft path', () => {
  it('a scanned PDF stores an empty draft without ever calling the AI parser', async () => {
    looksLikeScannedPdfMock.mockReturnValue(true);
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(parseStatementTextMock).not.toHaveBeenCalled();
    expect(statementCreate).toHaveBeenCalledWith(
      expect.objectContaining({ card: 'Unknown card', totalAmount: 0, filePath: 'statements/2026/06/file.pdf', notes: 'Scanned PDF — no text found, enter manually.' })
    );
    expect(res).toMatchObject({ ok: true, aiUsed: false, txCount: 0, aiError: 'Scanned PDF with no text' });
  });

  it('AI-off (feature flag) stores an empty draft without calling the AI parser', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(parseStatementTextMock).not.toHaveBeenCalled();
    expect(statementCreate).toHaveBeenCalledWith(expect.objectContaining({ notes: 'AI is off — enter manually.' }));
    expect(res).toMatchObject({ ok: true, aiUsed: false, txCount: 0, aiError: 'AI is off' });
  });

  it('the draft path never reaches the upsert (findOneAndUpdate is not called)', async () => {
    looksLikeScannedPdfMock.mockReturnValue(true);
    await importStatementPdf(formWith(pdfFile()));
    expect(statementFindOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('importStatementPdf — AI parse failure proceeds as a 0-transaction import (not a draft)', () => {
  it('categorizes an unreachable-Ollama error and still saves a draft', async () => {
    parseStatementTextMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toMatchObject({ ok: true, aiUsed: false, txCount: 0, aiError: 'Ollama is not reachable' });
    expect(statementCreate).toHaveBeenCalledTimes(1);
  });

  it('categorizes any other AI error generically, truncated to 120 chars', async () => {
    parseStatementTextMock.mockRejectedValueOnce(new Error('x'.repeat(200)));
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toMatchObject({ ok: true, aiUsed: false, aiError: `AI parse failed: ${'x'.repeat(120)}` });
  });
});

describe('importStatementPdf — period resolution', () => {
  it('prefers the parsed statementDate (UTC year-month) over everything else', async () => {
    parseStatementTextMock.mockResolvedValue({ parsed: { statementDate: '2026-04-03', period: '2026-03', transactions: [] } });
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toMatchObject({ ok: true, period: '2026-04' });
  });

  it('falls back to parsed.period when statementDate does not parse', async () => {
    parseStatementTextMock.mockResolvedValue({ parsed: { statementDate: 'not-a-date', period: '2026-02', transactions: [] } });
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toMatchObject({ ok: true, period: '2026-02' });
  });

  it('falls back to the current-month fallback when neither is usable', async () => {
    const res = await importStatementPdf(formWith(pdfFile()));
    const fallback = new Date().toISOString().slice(0, 7);
    expect(res).toMatchObject({ ok: true, period: fallback });
  });
});

describe('importStatementPdf — transaction mapping', () => {
  it('sets installmentInfo only when BOTH currentInstallment and totalInstallments are present', async () => {
    parseStatementTextMock.mockResolvedValue({
      parsed: {
        transactions: [
          { date: '2026-06-05', description: 'PLAISIO', amount: 39.47, currentInstallment: 3, totalInstallments: 12 },
          { date: '2026-06-06', description: 'COFFEE', amount: 5, currentInstallment: 1 },
        ],
      },
    });
    let saved: any;
    statementCreate.mockImplementation(async (doc: any) => {
      saved = doc;
      return { ...doc, _id: 's-new' };
    });
    await importStatementPdf(formWith(pdfFile()));
    expect(saved.transactions[0].installmentInfo).toEqual({ currentInstallment: 3, totalInstallments: 12, originalPurchase: 'PLAISIO' });
    expect(saved.transactions[1].installmentInfo).toBeNull();
  });
});

describe('importStatementPdf — cross-statement link inheritance', () => {
  it('inherits matchedItemIds by signature and bumps `inherited`', async () => {
    statementFind.mockReturnValue({
      lean: async () => [
        { period: '2026-05', transactions: [{ description: 'KOTSOVOLOS', installmentInfo: { currentInstallment: 6, totalInstallments: 36 }, matchedItemIds: [ITEM9] }] },
      ],
    });
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'KOTSOVOLOS', amount: 25.25, currentInstallment: 7, totalInstallments: 36 }] },
    });
    let saved: any;
    statementCreate.mockImplementation(async (doc: any) => {
      saved = doc;
      return { ...doc, _id: 's-new' };
    });
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(saved.transactions[0].matchedItemIds.map(String)).toEqual([ITEM9]);
    expect(res).toMatchObject({ ok: true, inherited: 1 });
  });

  it('never looks up a signature for a transaction without installmentInfo', async () => {
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [{ date: '2026-06-05', description: 'COFFEE', amount: 5 }] } });
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(installmentSignatureMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({ inherited: 0 });
  });
});

describe('importStatementPdf — card matching', () => {
  it('matches an existing card by last4 first, without creating a new one', async () => {
    cardFindOne.mockImplementation(async (q: any) => (q.last4 === '7791' ? { _id: 'existing', name: 'Εθνική', last4: '7791' } : null));
    parseStatementTextMock.mockResolvedValue({ parsed: { card: 'Some Bank', last4: '7791', transactions: [] } });
    await importStatementPdf(formWith(pdfFile()));
    expect(cardCreate).not.toHaveBeenCalled();
  });

  it('creates a new card when neither last4 nor name matches an existing one', async () => {
    parseStatementTextMock.mockResolvedValue({ parsed: { card: 'Brand New Bank', last4: '1234', transactions: [] } });
    await importStatementPdf(formWith(pdfFile()));
    expect(cardCreate).toHaveBeenCalledTimes(1);
  });

  it('labels an unidentifiable statement "Unknown card" without creating one', async () => {
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    let saved: any;
    statementCreate.mockImplementation(async (doc: any) => {
      saved = doc;
      return { ...doc, _id: 's-new' };
    });
    await importStatementPdf(formWith(pdfFile()));
    expect(cardCreate).not.toHaveBeenCalled();
    expect(saved.card).toBe('Unknown card');
  });
});

describe('importStatementPdf — duplicate protection', () => {
  it.each(['old.pdf', '', 'statements/2026/06/file.pdf'])('refuses an existing statement even with filePath=%s', async filePath => {
    statementFindOne.mockReturnValue({ lean: async () => ({ filePath, currency: 'USD', fxRate: 0.9 }) });
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toMatchObject({ ok: false });
    expect(statementCreate).not.toHaveBeenCalled();
    expect(statementFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('inserts a first import in base currency', async () => {
    parseStatementTextMock.mockResolvedValue({ parsed: { totalAmount: 50, transactions: [] } });
    await importStatementPdf(formWith(pdfFile()));
    expect(statementCreate).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 50, fxRate: 0 }));
  });
});

describe('importStatementPdf — success side effects and error wrapping', () => {
  it('on success: mirrors the file, revalidates /statements, /items AND /shopping, returns the full shape', async () => {
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [{ date: '2026-06-05', description: 'A', amount: 1 }] } });
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(mirrorFileToRemoteMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
    expect(res).toMatchObject({ ok: true, aiUsed: true, txCount: 1, id: 's-new' });
  });

  it('a thrown DB error inside the transaction body -> {ok:false, error:"DB error: <msg>"}', async () => {
    statementCreate.mockRejectedValueOnce(new Error('connection reset'));
    const res = await importStatementPdf(formWith(pdfFile()));
    expect(res).toEqual({ ok: false, error: 'DB error: connection reset' });
  });
});

describe('importStatementPdf — non-destructive identity', () => {
  it('does not match another card by name when its last4 conflicts', async () => {
    cardFindOne.mockImplementation(async q => q.name ? { _id: 'old', name: 'Visa', last4: '1111' } : null);
    parseStatementTextMock.mockResolvedValue({ parsed: { card: 'Visa', last4: '2222', transactions: [] } });
    await importStatementPdf(formWith(pdfFile()));
    expect(cardCreate).toHaveBeenCalledWith(expect.objectContaining({ last4: '2222' }));
  });

  it('refuses a duplicate without overwriting user data and checks stable card identity', async () => {
    cardFindOne.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', name: 'Renamed', last4: '1111' });
    parseStatementTextMock.mockResolvedValue({ parsed: { card: 'Visa', last4: '1111', period: '2026-06', transactions: [] } });
    statementFindOne.mockReturnValue({ lean: async () => ({ _id: 'old', card: 'Old label', filePath: 'old.pdf' }) });
    const result = await importStatementPdf(formWith(pdfFile()));
    expect(result.ok).toBe(false);
    expect(statementFindOneAndUpdate).not.toHaveBeenCalled();
    expect(statementCreate).not.toHaveBeenCalled();
    expect(statementFindOne).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([{ cardId: '507f1f77bcf86cd799439011' }]),
    }), expect.anything());
  });
});


describe('importStatementPdf — rejected upload cleanup', () => {
  it('removes only the new upload on a duplicate', async () => {
    statementFindOne.mockReturnValue({ lean: async () => ({ filePath: 'keep.pdf' }) });
    await importStatementPdf(formWith(pdfFile()));
    expect(deleteFileMock).toHaveBeenCalledExactlyOnceWith('statements/2026/06/file.pdf');
  });
  it('cleans up when PDF extraction fails', async () => {
    extractPdfTextMock.mockRejectedValueOnce(new Error('invalid PDF'));
    expect((await importStatementPdf(formWith(pdfFile()))).ok).toBe(false);
    expect(deleteFileMock).toHaveBeenCalledExactlyOnceWith('statements/2026/06/file.pdf');
  });
  it('keeps a successfully saved PDF', async () => {
    expect((await importStatementPdf(formWith(pdfFile()))).ok).toBe(true);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });
});


it('keeps the PDF while an AI-disabled draft is being persisted', async () => {
  isFeatureEnabledMock.mockResolvedValueOnce(false);
  statementCreate.mockImplementationOnce(async doc => {
    await Promise.resolve();
    expect(deleteFileMock).not.toHaveBeenCalled();
    return { ...doc, _id: 'draft' };
  });
  expect((await importStatementPdf(formWith(pdfFile()))).ok).toBe(true);
  expect(deleteFileMock).not.toHaveBeenCalled();
});
