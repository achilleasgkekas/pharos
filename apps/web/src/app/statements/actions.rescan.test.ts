import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/statements/actions.ts is a large multi-concern module (see actions.crud.test.ts's
// header for the full concern list + existing slices: crud, installments, reconcile,
// tenant, categorize). This file covers `rescanStatement` — confirmed to have ZERO
// coverage anywhere in the repo before this file
// (`grep -rln "rescanStatement\b" --include="*.test.ts" src` returned nothing).
// `importStatementPdf`/`attachStatementPdf` still have only their tenant-routing
// dimension tested (actions.tenant.test.ts), not their actual behaviour — left for a
// future slice.
//
// `@/lib/fx` is deliberately left UN-mocked (same choice as actions.crud.test.ts): it is
// pure/deterministic and already has its own dedicated suite (lib/fx.test.ts), so the
// real conversion math runs end-to-end here. `@/lib/installments`' `installmentSignature`
// IS mocked (same as actions.installments.test.ts/actions.crud.test.ts) — its own
// algorithm has a dedicated suite (lib/installments.test.ts); the mock here is
// deliberately PERIOD-INVARIANT per description (a real signature is designed to match
// the same plan across different months/periods), which is exactly what's needed to pin
// the cross-statement link-inheritance WIRING without re-testing the algorithm itself.
//
// Behaviour pinned:
//  - Gated by assertCanWrite (untested here, like every sibling statements slice — it
//    no-ops outside a request scope, which is what every one of these unit tests is).
//  - No statement / no stored file -> {ok:false, aiUsed:false, error:'Statement or file
//    not found'}; a readFile failure -> {ok:false, aiUsed:false, error:'File missing
//    from storage'}.
//  - useOcr:true always rasterizes+OCRs every page (ocrPdf), never touches
//    extractPdfText. useOcr:false reads the embedded text layer first; only escalates to
//    ocrPdf (and flips the reported usedOcr to true) when looksLikeScannedPdf says the
//    text layer is unusable.
//  - A thrown read/OCR error -> 'Failed to read PDF: <msg>'. A thrown AI-parse error is
//    categorized: ECONNREFUSED/fetch failed/ENOTFOUND -> 'Ollama is not reachable',
//    anything else -> 'AI parse failed: <msg>' (truncated to 120 chars). A resolved-but-
//    null parse -> {ok:false, error: aiError ?? 'No AI result'}.
//  - Preservation (the whole point of this action): each OLD transaction is keyed by
//    `description(upper, 40-char cap) + '|' + printed-amount(2dp)` — printed via
//    toPrinted(storedAmount, storedRate) so a FOREIGN statement's old lines are keyed by
//    what was actually printed, not the base-currency figure they were converted to.
//    Every fresh transaction is looked up by that SAME key using its own (always
//    printed) amount. A freshly-detected NN/MM installment (both currentInstallment AND
//    totalInstallments present) always WINS over a preserved one, with
//    originalPurchase set to the NEW description; when nothing was freshly detected, the
//    OLD installmentInfo carries over unchanged. matchedItemIds carry over from the OLD
//    entry on a key match REGARDLESS of whether an installment was detected either way.
//  - Cross-statement link inheritance: every OTHER statement's transactions that have
//    both an installmentInfo and matchedItemIds are indexed by signature (their OWN
//    period); every new transaction that ended up with an installmentInfo (fresh or
//    preserved) looks itself up by signature (the CURRENT statement's period) and, on a
//    hit, MERGES those ids into whatever matchedItemIds it already carries (deduplicated
//    union, not a replace).
//  - installmentsFound counts transactions with installmentInfo truthy; preservedLinks
//    counts transactions with a non-empty matchedItemIds, independently of each other.
//  - totalAmount/origAmount/fxRate/currency are refreshed ONLY when parsed.totalAmount is
//    a number; minimumPayment ONLY when parsed.minimumPayment is a number. card/period/
//    filePath are never touched (a re-scan can't move a statement to another month).
//  - A save() failure -> {ok:false, aiUsed:false, usedOcr, error:'Save failed: <msg>'}
//    (truncated to 120 chars). Success revalidates '/statements', '/items' AND
//    '/shopping', and returns the updated doc via a JSON round-trip (statement.toObject
//    is not required by the action itself, just JSON-serializable fields).

const {
  connectDBMock,
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
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
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

  it('does NOT preserve anything for a transaction whose key does not match any old one (new purchase)', async () => {
    const stmt = stmtOf({ transactions: [{ description: 'OLD ONE', amount: 10, installmentInfo: null, matchedItemIds: [ITEM1] }] });
    statementFindById.mockResolvedValue(stmt);
    parseStatementTextMock.mockResolvedValue({
      parsed: { transactions: [{ date: '2026-06-05', description: 'BRAND NEW CHARGE', amount: 77 }] },
    });
    const res = await rescanStatement('s1', true);
    expect(stmt.transactions[0].installmentInfo).toBeNull();
    expect(stmt.transactions[0].matchedItemIds).toEqual([]);
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
