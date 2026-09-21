import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real FX conversion; mocked persistence and AI. Rescans preserve each matched
// transaction's annotations once and refuse changes that would discard user work.

const {
  connectDBMock,
  isFeatureEnabledMock,
  statementFindById,
  statementFind,
  readFileMock,
  ocrPdfMock,
  extractPdfTextMock,
  looksLikeScannedPdfMock,
  parseStatementTextMock,
  installmentSignatureMock,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  isFeatureEnabledMock: vi.fn(async () => true),
  connectDBMock: vi.fn(async () => {}),
  statementFindById: vi.fn(async (_id: string): Promise<any> => null),
  statementFind: vi.fn((_filter: Record<string, unknown>, _proj: Record<string, unknown>) => ({ lean: async () => [] as any[] })),
  readFileMock: vi.fn(async (_path: string): Promise<Buffer> => Buffer.from('')),
  ocrPdfMock: vi.fn(async (_bytes: Buffer): Promise<string> => ''),
  extractPdfTextMock: vi.fn(async (_bytes: Buffer): Promise<string> => ''),
  looksLikeScannedPdfMock: vi.fn((_text: string) => false),
  parseStatementTextMock: vi.fn(async (_text: string): Promise<{ parsed: any }> => ({ parsed: null })),
  // Period-invariant per description: mirrors what a REAL installment signature does for
  // the same plan across months (its own algorithm is pinned in lib/installments.test.ts).
  installmentSignatureMock: vi.fn((t: any, _period: string) => (t?.description ? `sig:${t.description}` : '')),
  getAppSettingsMock: vi.fn(async () => ({ currency: 'EUR' })),
  revalidatePathMock: vi.fn(),
}));

// Tenancy seam mocked flat (same as the sibling crud/installments/reconcile/categorize
// slices): tenant ROUTING itself is pinned separately in actions.tenant.test.ts.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: any) => m }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Statement', () => ({ Statement: { findById: statementFindById, find: statementFind } }));
vi.mock('@/models/Card', () => ({ Card: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: vi.fn() } }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn(), readFile: readFileMock }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: extractPdfTextMock, looksLikeScannedPdf: looksLikeScannedPdfMock }));
vi.mock('@/lib/ocr', () => ({ ocrPdf: ocrPdfMock }));
vi.mock('@/lib/ollama', () => ({ parseStatementText: parseStatementTextMock, categorizeTransactions: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/cards', () => ({ normalizeLast4: (s: string) => s, detectCardType: () => 'credit', buildCardLabel: (n: string, l: string) => `${n} ${l}` }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/installments', () => ({ installmentSignature: installmentSignatureMock }));
vi.mock('@/lib/reconcile', () => ({ reconcile: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { rescanStatement } from './actions';

// matchedItemIds go through `new Types.ObjectId(sid)`, so fixtures need real 24-hex ids.
const ITEM1 = '507f1f77bcf86cd799439011';
const ITEM5 = '507f1f77bcf86cd799439015';
const ITEM9 = '507f1f77bcf86cd799439019';

function stmtOf(overrides: Record<string, unknown> = {}) {
  return {
    _id: 's1',
    filePath: 'statements/test.pdf',
    fileType: 'application/pdf',
    card: 'card1',
    period: '2026-06',
    currency: 'EUR',
    fxRate: 0,
    totalAmount: 100,
    minimumPayment: 10,
    transactions: [] as any[],
    save: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  statementFindById.mockImplementation(async () => null);
  statementFind.mockImplementation(() => ({ lean: async () => [] }));
  readFileMock.mockImplementation(async () => Buffer.from('pdf-bytes'));
  ocrPdfMock.mockImplementation(async () => '');
  extractPdfTextMock.mockImplementation(async () => '');
  looksLikeScannedPdfMock.mockImplementation(() => false);
  parseStatementTextMock.mockImplementation(async () => ({ parsed: null }));
  installmentSignatureMock.mockImplementation((t: any) => (t?.description ? `sig:${t.description}` : ''));
  getAppSettingsMock.mockImplementation(async () => ({ currency: 'EUR' }));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('rescanStatement — not found / file errors', () => {
  it('reports an error when the statement has no id match', async () => {
    statementFindById.mockResolvedValue(null);
    const res = await rescanStatement('missing', false);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'Statement or file not found' });
  });

  it('reports an error when the record has no stored file', async () => {
    statementFindById.mockResolvedValue(stmtOf({ filePath: '' }));
    const res = await rescanStatement('s1', false);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'Statement or file not found' });
  });

  it('returns a friendly error when reading the stored file throws', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    const res = await rescanStatement('s1', false);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'File missing from storage' });
  });
});

describe('rescanStatement — text acquisition (OCR vs embedded text)', () => {
  it('useOcr:true always rasterizes+OCRs, never touching extractPdfText', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    ocrPdfMock.mockResolvedValue('ocr text');
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    const res = await rescanStatement('s1', true);
    expect(ocrPdfMock).toHaveBeenCalledTimes(1);
    expect(extractPdfTextMock).not.toHaveBeenCalled();
    expect(res.usedOcr).toBe(true);
  });

  it('useOcr:false on a non-scanned PDF uses the embedded text directly, never touching ocrPdf', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    extractPdfTextMock.mockResolvedValue('embedded text');
    looksLikeScannedPdfMock.mockReturnValue(false);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    const res = await rescanStatement('s1', false);
    expect(extractPdfTextMock).toHaveBeenCalledTimes(1);
    expect(ocrPdfMock).not.toHaveBeenCalled();
    expect(res.usedOcr).toBe(false);
  });

  it('useOcr:false on a PDF whose text layer looks scanned escalates to OCR and reports usedOcr:true', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    extractPdfTextMock.mockResolvedValue('garbled');
    looksLikeScannedPdfMock.mockReturnValue(true);
    ocrPdfMock.mockResolvedValue('ocr text');
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    const res = await rescanStatement('s1', false);
    expect(ocrPdfMock).toHaveBeenCalledTimes(1);
    expect(res.usedOcr).toBe(true);
  });

  it('a thrown OCR/text-extraction error is reported as "Failed to read PDF: <msg>"', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    ocrPdfMock.mockRejectedValue(new Error('pdftoppm crashed'));
    const res = await rescanStatement('s1', true);
    expect(res).toEqual({ ok: false, aiUsed: false, error: 'Failed to read PDF: pdftoppm crashed' });
  });
});

describe('rescanStatement — AI parse failures', () => {
  it('categorizes an unreachable-Ollama error distinctly', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    parseStatementTextMock.mockRejectedValue(new Error('fetch failed'));
    const res = await rescanStatement('s1', true);
    expect(res.ok).toBe(false);
    expect(res.aiError).toBe('Ollama is not reachable');
    expect(res.error).toBe('Ollama is not reachable');
  });

  it('categorizes any other AI error generically, truncated to 120 chars', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    parseStatementTextMock.mockRejectedValue(new Error('x'.repeat(200)));
    const res = await rescanStatement('s1', true);
    expect(res.aiError).toBe(`AI parse failed: ${'x'.repeat(120)}`);
  });

  it('a resolved-but-null parse reports "No AI result" when there is no aiError to show', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    parseStatementTextMock.mockResolvedValue({ parsed: null });
    const res = await rescanStatement('s1', true);
    expect(res).toMatchObject({ ok: false, aiUsed: false, error: 'No AI result' });
  });
});

describe('rescanStatement — preservation of manual installment edits + product links', () => {
  it('carries over the OLD installmentInfo when the fresh parse detects no NN/MM for the same key', async () => {
    const stmt = stmtOf({
      transactions: [
        { description: 'PLAISIO', amount: 39.47, installmentInfo: { currentInstallment: 2, totalInstallments: 12, originalPurchase: 'PLAISIO' }, matchedItemIds: [] },
      ],
    });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'PLAISIO', amount: 39.47 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(res.ok).toBe(true);
    expect(stmt.transactions[0].installmentInfo).toEqual({ currentInstallment: 2, totalInstallments: 12, originalPurchase: 'PLAISIO' });
  });

  it('a freshly-detected installment overrides the old one, with originalPurchase set to the NEW description', async () => {
    const stmt = stmtOf({
      transactions: [
        { description: 'PLAISIO OLD DESC', amount: 39.47, installmentInfo: { currentInstallment: 2, totalInstallments: 12, originalPurchase: 'OLD' }, matchedItemIds: [] },
      ],
    });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'PLAISIO OLD DESC', amount: 39.47, currentInstallment: 3, totalInstallments: 12 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(res.ok).toBe(true);
    expect(stmt.transactions[0].installmentInfo).toEqual({
      currentInstallment: 3,
      totalInstallments: 12,
      originalPurchase: 'PLAISIO OLD DESC',
    });
  });

  it('carries over matchedItemIds on a key match even when no installment is involved either side', async () => {
    const stmt = stmtOf({
      transactions: [{ description: 'COFFEE SHOP', amount: 5, installmentInfo: null, matchedItemIds: [ITEM1] }],
    });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'COFFEE SHOP', amount: 5 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(res.ok).toBe(true);
    expect(stmt.transactions[0].matchedItemIds.map(String)).toEqual([ITEM1]);
  });

  it('refuses to replace a linked transaction with an unrelated purchase', async () => {
    const stmt = stmtOf({ transactions: [{ description: 'OLD ONE', amount: 10, installmentInfo: null, matchedItemIds: [ITEM1] }] });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'BRAND NEW CHARGE', amount: 77 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(res.ok).toBe(false);
    expect(stmt.transactions[0].matchedItemIds).toEqual([ITEM1]);
    expect(stmt.save).not.toHaveBeenCalled();
  });

  it('keys a FOREIGN statement\'s old transaction by its PRINTED amount (toPrinted via the stored rate), not the base-currency figure', async () => {
    // Old tx stored in base currency (EUR) at 45.00, statement fxRate 0.9 -> printed = 50.00.
    // The fresh parse always reports the PRINTED figure (50.00), so the key must match.
    const stmt = stmtOf({
      currency: 'USD',
      fxRate: 0.9,
      transactions: [{ description: 'AMAZON', amount: 45, installmentInfo: { currentInstallment: 1, totalInstallments: 6, originalPurchase: 'AMAZON' }, matchedItemIds: [ITEM5] }],
    });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'AMAZON', amount: 50 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(res.ok).toBe(true);
    expect(stmt.transactions[0].installmentInfo).toEqual({ currentInstallment: 1, totalInstallments: 6, originalPurchase: 'AMAZON' });
    expect(stmt.transactions[0].matchedItemIds.map(String)).toEqual([ITEM5]);
  });
});

describe('rescanStatement — cross-statement link inheritance by signature', () => {
  it('merges matched item ids found on ANOTHER statement (same signature) into a fresh installment transaction', async () => {
    const stmt = stmtOf({ transactions: [] }); // nothing preserved locally
    statementFindById.mockResolvedValue(stmt);
    statementFind.mockReturnValue({
      lean: async () => [
        {
          period: '2026-05',
          transactions: [
            { description: 'KOTSOVOLOS', installmentInfo: { currentInstallment: 6, totalInstallments: 36 }, matchedItemIds: [ITEM9] },
          ],
        },
      ],
    });
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'KOTSOVOLOS', amount: 25.25, currentInstallment: 7, totalInstallments: 36 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(res.ok).toBe(true);
    expect(stmt.transactions[0].matchedItemIds.map(String)).toEqual([ITEM9]);
  });

  it('unions cross-statement ids with an already-preserved matchedItemId instead of replacing it', async () => {
    const stmt = stmtOf({
      transactions: [{ description: 'KOTSOVOLOS', amount: 25.25, installmentInfo: { currentInstallment: 6, totalInstallments: 36 }, matchedItemIds: [ITEM1] }],
    });
    statementFindById.mockResolvedValue(stmt);
    statementFind.mockReturnValue({
      lean: async () => [
        { period: '2026-05', transactions: [{ description: 'KOTSOVOLOS', installmentInfo: { currentInstallment: 6, totalInstallments: 36 }, matchedItemIds: [ITEM9] }] },
      ],
    });
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'KOTSOVOLOS', amount: 25.25 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(new Set(stmt.transactions[0].matchedItemIds.map(String))).toEqual(new Set([ITEM1, ITEM9]));
  });

  it('ignores another statement\'s transaction that has no matchedItemIds at all', async () => {
    const stmt = stmtOf({ transactions: [] });
    statementFindById.mockResolvedValue(stmt);
    statementFind.mockReturnValue({
      lean: async () => [{ period: '2026-05', transactions: [{ description: 'KOTSOVOLOS', installmentInfo: { currentInstallment: 6, totalInstallments: 36 }, matchedItemIds: [] }] }],
    });
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'KOTSOVOLOS', amount: 25.25, currentInstallment: 7, totalInstallments: 36 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(stmt.transactions[0].matchedItemIds).toEqual([]);
  });

  it('never looks up a signature for a transaction with no installmentInfo at all', async () => {
    const stmt = stmtOf({ transactions: [] });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'COFFEE SHOP', amount: 5 }] },
    });
    await rescanStatement('s1', true);
    // installmentSignature is only ever called for entries carrying installmentInfo (old-side
    // guard `!t.installmentInfo` skips indexing, new-side guard `if (t.installmentInfo)` skips lookup).
    expect(installmentSignatureMock).not.toHaveBeenCalled();
  });
});

describe('rescanStatement — counts, money fields, and side effects', () => {
  it('installmentsFound and preservedLinks count independently of each other', async () => {
    const stmt = stmtOf({
      transactions: [
        { description: 'A', amount: 1, installmentInfo: { currentInstallment: 1, totalInstallments: 2 }, matchedItemIds: [] }, // installment, no link
        { description: 'B', amount: 2, installmentInfo: null, matchedItemIds: [ITEM1] }, // link, no installment
      ],
    });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: {
        transactions: [
          { date: '2026-06-05', description: 'A', amount: 1 },
          { date: '2026-06-06', description: 'B', amount: 2 },
        ],
      },
    });
    const res = await rescanStatement('s1', true);
    expect(res.installmentsFound).toBe(1);
    expect(res.preservedLinks).toBe(1);
  });

  it('refreshes totalAmount/origAmount/fxRate/currency only when parsed.totalAmount is a number', async () => {
    const stmt = stmtOf({ totalAmount: 100, currency: 'EUR', fxRate: 0 });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { totalAmount: 250, transactions: [] } });
    await rescanStatement('s1', true);
    expect(stmt.totalAmount).toBe(250);
  });

  it('leaves totalAmount untouched when parsed carries no totalAmount', async () => {
    const stmt = stmtOf({ totalAmount: 100 });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    await rescanStatement('s1', true);
    expect(stmt.totalAmount).toBe(100);
  });

  it('refreshes minimumPayment only when parsed.minimumPayment is a number', async () => {
    const stmt = stmtOf({ minimumPayment: 10 });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { minimumPayment: 33, transactions: [] } });
    await rescanStatement('s1', true);
    expect(stmt.minimumPayment).toBe(33);
  });

  it('leaves card/period/filePath untouched (a re-scan never moves the statement to another month)', async () => {
    const stmt = stmtOf({ card: 'card1', period: '2026-06', filePath: 'statements/test.pdf' });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    await rescanStatement('s1', true);
    expect(stmt.card).toBe('card1');
    expect(stmt.period).toBe('2026-06');
    expect(stmt.filePath).toBe('statements/test.pdf');
  });

  it('returns a friendly error when save() throws, truncated to 120 chars', async () => {
    const stmt = stmtOf();
    stmt.save = vi.fn(async () => {
      throw new Error('x'.repeat(200));
    });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    const res = await rescanStatement('s1', true);
    expect(res).toMatchObject({ ok: false, aiUsed: false, error: `Save failed: ${'x'.repeat(120)}` });
  });

  it('on success: revalidates /statements, /items AND /shopping, and returns the full result shape', async () => {
    const stmt = stmtOf({ transactions: [{ description: 'A', amount: 1, installmentInfo: null, matchedItemIds: [] }] });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [{ date: '2026-06-05', description: 'A', amount: 1 }] } });
    const res = await rescanStatement('s1', true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
    expect(res).toMatchObject({ ok: true, aiUsed: true, usedOcr: true, txCount: 1, installmentsFound: 0, preservedLinks: 0 });
    expect(res.statement).toBeTruthy();
  });
});

describe('rescanStatement — user annotation integrity', () => {
  it('preserves transaction identity, category, receipt and manual grouping', async () => {
    const stmt = stmtOf({ transactions: [{ _id: ITEM1, date: new Date('2026-06-05'), description: 'SHOP', amount: 20,
      category: 'electronics', matchedReceiptId: ITEM5, matchedItemIds: [ITEM9],
      installmentInfo: { currentInstallment: 2, totalInstallments: 6, originalPurchase: 'Manual name', planKey: 'manual-group' } }] });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [{ date: '2026-06-05', description: 'SHOP', amount: 20, currentInstallment: 2, totalInstallments: 6 }] } });
    await rescanStatement('s1', false);
    expect(stmt.transactions[0]).toMatchObject({ _id: ITEM1, category: 'electronics', matchedReceiptId: ITEM5,
      installmentInfo: { planKey: 'manual-group', originalPurchase: 'Manual name' } });
  });

  it('matches equal charges by date and consumes each old annotation only once', async () => {
    const stmt = stmtOf({ transactions: [
      { _id: ITEM1, date: new Date('2026-06-05'), description: 'SHOP', amount: 20, category: 'first', matchedItemIds: [ITEM1] },
      { _id: ITEM5, date: new Date('2026-06-06'), description: 'SHOP', amount: 20, category: 'second', matchedItemIds: [ITEM5] },
    ] });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [
      { date: '2026-06-06', description: 'SHOP', amount: 20 },
      { date: '2026-06-05', description: 'SHOP', amount: 20 },
      { date: '2026-06-05', description: 'SHOP', amount: 20 },
    ] } });
    await rescanStatement('s1', false);
    expect(stmt.transactions.map(t => t.category)).toEqual(['second', 'first', 'uncategorized']);
    expect(stmt.transactions[2].matchedItemIds).toEqual([]);
  });
});


describe('rescanStatement — refusal paths', () => {
  it('does not call AI or read files when statement AI is disabled', async () => {
    statementFindById.mockResolvedValue(stmtOf());
    isFeatureEnabledMock.mockResolvedValueOnce(false);
    expect((await rescanStatement('s1', false)).ok).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(parseStatementTextMock).not.toHaveBeenCalled();
  });
  it('does not erase transactions when parsing yields no transactions', async () => {
    const stmt = stmtOf({ transactions: [{ description: 'SHOP', amount: 10 }] });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [] } });
    expect((await rescanStatement('s1', false)).ok).toBe(false);
    expect(stmt.transactions).toHaveLength(1);
    expect(stmt.save).not.toHaveBeenCalled();
  });
});


it('leaves the document unchanged when a linked charge cannot be matched', async () => {
  const transactions = [{ date: new Date('2026-06-05'), description: 'SHOP', amount: 20, matchedReceiptId: ITEM1 }];
  const stmt = stmtOf({ transactions });
  statementFindById.mockResolvedValue(stmt);
  parseStatementTextMock.mockResolvedValue({ parsed: { transactions: [{ date: '2026-06-06', description: 'SHOP', amount: 20 }] } });
  expect((await rescanStatement('s1', false)).ok).toBe(false);
  expect(stmt.transactions).toBe(transactions);
  expect(stmt.save).not.toHaveBeenCalled();
});
