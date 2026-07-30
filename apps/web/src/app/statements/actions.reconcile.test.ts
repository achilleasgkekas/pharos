import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/statements/actions.ts is a large multi-concern module (929 lines). This file covers ONLY
// the receipt<->transaction reconciliation slice (P18): getReconciliation/linkTransactionReceipt/
// unlinkTransactionReceipt. See actions.crud.test.ts for the plain CRUD slice; the AI import/rescan
// and signature-based installment linking are separate concerns for their own future test files.
//
// Behaviour pinned:
//  - getReconciliation: validates the statementId with mongoose Types.ObjectId.isValid BEFORE
//    connectDB (fast-fail, no DB round-trip on a malformed id). Loads the statement `.lean()`;
//    404s with {ok:false, error:'Statement not found'} when missing.
//  - Receipt candidate pool: Receipt.find({archived:{$ne:true}, total:{$gt:0}, date window}), where
//    the window is [statementDate - 45d, statementDate + 5d] (RECON_WINDOW_BEFORE/AFTER_DAYS).
//  - The real (un-mocked) matching algorithm lives in lib/reconcile.ts with its own 17-test suite;
//    here `reconcile()` is mocked so this file only pins the *wiring*: what gets passed in, and how
//    the result is merged back with description/amount/date from the source transactions.
//  - "unmatched receipts" are computed independently of reconcile()'s own output: a receipt in the
//    candidate pool is unmatched only if it isn't linked (matchedReceiptId) on ANY transaction of
//    ANY statement in the whole ledger (not just the one being reconciled) - global, not per-statement.
//    They're returned sorted newest-first.
//  - linkTransactionReceipt/unlinkTransactionReceipt: validate the receiptId (link only) before
//    connectDB, load the statement (no .lean(), a live mongoose doc), look up the transaction
//    subdocument via `.transactions.id(id)`, set/clear matchedReceiptId, `.save()`, then revalidate
//    '/statements' + '/items' + '/reports' + '/' (via the shared revalidateInstallments helper).

const {
  connectDBMock,
  statementFindById,
  statementFind,
  receiptFind,
  reconcileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  statementFindById: vi.fn(),
  statementFind: vi.fn(),
  receiptFind: vi.fn(),
  reconcileMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

// Tenancy seam mocked flat: the actions now reach every collection through
// `currentModel()` inside `withRequestTenant`, so hand each call the very model this file
// already mocks. Tenant ROUTING itself is pinned separately in actions.tenant.test.ts.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: any) => m }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Statement', () => ({
  Statement: {
    findById: statementFindById,
    find: statementFind,
    // Unused by this slice, but the module imports them for other exports.
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));
vi.mock('@/models/Card', () => ({ Card: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: receiptFind } }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn(), readFile: vi.fn() }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrPdf: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseStatementText: vi.fn(), categorizeTransactions: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/cards', () => ({ normalizeLast4: (s: string) => s, detectCardType: () => 'credit', buildCardLabel: (n: string, l: string) => `${n} ${l}` }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/installments', () => ({ installmentSignature: vi.fn(() => '') }));
vi.mock('@/lib/reconcile', () => ({ reconcile: reconcileMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { getReconciliation, linkTransactionReceipt, unlinkTransactionReceipt } from './actions';

const VALID_STMT_ID = '507f1f77bcf86cd799439011';
const VALID_RECEIPT_ID = '507f1f77bcf86cd799439022';

function chainLean(value: unknown) {
  return { lean: async () => value };
}

function chainSelectLean(value: unknown) {
  return { select: () => chainLean(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
  reconcileMock.mockReturnValue({ txns: [], unmatchedReceiptIds: [] });
  // Empty ledger by default: no statement anywhere has a linked receipt.
  statementFind.mockReturnValue(chainSelectLean([]));
});

describe('getReconciliation', () => {
  it('rejects a malformed statement id before touching the DB', async () => {
    const result = await getReconciliation('not-an-id');
    expect(result).toEqual({ ok: false, error: 'Invalid statement id', txns: [], receipts: {}, unmatchedReceipts: [] });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('returns a not-found error when the statement does not exist', async () => {
    statementFindById.mockReturnValue(chainLean(null));
    const result = await getReconciliation(VALID_STMT_ID);
    expect(result).toEqual({ ok: false, error: 'Statement not found', txns: [], receipts: {}, unmatchedReceipts: [] });
    expect(connectDBMock).toHaveBeenCalledTimes(1);
  });

  it('queries receipts within [statementDate - 45d, statementDate + 5d], excluding archived and zero-total', async () => {
    statementFindById.mockReturnValue(chainLean({ statementDate: '2026-06-10', transactions: [] }));
    receiptFind.mockReturnValue(chainSelectLean([]));

    await getReconciliation(VALID_STMT_ID);

    expect(receiptFind).toHaveBeenCalledTimes(1);
    const query = receiptFind.mock.calls[0][0];
    expect(query.archived).toEqual({ $ne: true });
    expect(query.total).toEqual({ $gt: 0 });
    const anchor = new Date('2026-06-10').getTime();
    expect((query.date.$gte as Date).getTime()).toBe(anchor - 45 * 86_400_000);
    expect((query.date.$lte as Date).getTime()).toBe(anchor + 5 * 86_400_000);
  });

  it('feeds reconcile() with mapped transaction inputs and the receipt pool, then merges description/amount/date back', async () => {
    statementFindById.mockReturnValue(
      chainLean({
        statementDate: '2026-06-10',
        transactions: [
          { _id: 'tx1', date: '2026-06-08', description: 'PLAISIO', amount: 39.47, matchedReceiptId: null },
        ],
      })
    );
    receiptFind.mockReturnValue(
      chainSelectLean([{ _id: 'r1', store: 'Plaisio', date: '2026-06-08', total: 39.47 }])
    );
    reconcileMock.mockReturnValue({
      txns: [{ txnId: 'tx1', matchedReceiptId: null, candidates: [{ receiptId: 'r1', score: 1, dayDiff: 0, amountDiff: 0, storeMatch: true }] }],
      unmatchedReceiptIds: [],
    });

    const result = await getReconciliation(VALID_STMT_ID);

    expect(reconcileMock).toHaveBeenCalledTimes(1);
    const [txnInputs, pool] = reconcileMock.mock.calls[0];
    expect(txnInputs).toEqual([{ id: 'tx1', date: '2026-06-08T00:00:00.000Z', description: 'PLAISIO', amount: 39.47, matchedReceiptId: null }]);
    expect(pool).toEqual([{ id: 'r1', store: 'Plaisio', date: '2026-06-08T00:00:00.000Z', total: 39.47 }]);

    expect(result.ok).toBe(true);
    expect(result.txns).toEqual([
      {
        txnId: 'tx1',
        matchedReceiptId: null,
        candidates: expect.any(Array),
        description: 'PLAISIO',
        amount: 39.47,
        date: '2026-06-08T00:00:00.000Z',
      },
    ]);
    expect(result.receipts.r1).toEqual({ id: 'r1', store: 'Plaisio', date: '2026-06-08T00:00:00.000Z', total: 39.47 });
  });

  it('flags a receipt as unmatched only when it is not linked on ANY statement in the whole ledger, and sorts newest-first', async () => {
    statementFindById.mockReturnValue(chainLean({ statementDate: '2026-06-10', transactions: [] }));
    receiptFind.mockReturnValue(
      chainSelectLean([
        { _id: 'r-old-linked', store: 'A', date: '2026-06-01', total: 10 },
        { _id: 'r-new-unlinked', store: 'B', date: '2026-06-09', total: 20 },
        { _id: 'r-old-unlinked', store: 'C', date: '2026-06-03', total: 30 },
      ])
    );
    // Ledger-wide: r-old-linked is matched on some OTHER statement's transaction.
    statementFind.mockReturnValue(
      chainSelectLean([{ transactions: [{ matchedReceiptId: 'r-old-linked' }, { matchedReceiptId: null }] }])
    );

    const result = await getReconciliation(VALID_STMT_ID);

    expect(result.unmatchedReceipts.map((r) => r.id)).toEqual(['r-new-unlinked', 'r-old-unlinked']);
  });
});

describe('linkTransactionReceipt', () => {
  it('rejects a malformed receipt id before touching the DB', async () => {
    const result = await linkTransactionReceipt(VALID_STMT_ID, 'tx1', 'not-an-id');
    expect(result).toEqual({ ok: false, error: 'Invalid receipt id' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('errors when the statement is not found', async () => {
    statementFindById.mockResolvedValue(null);
    const result = await linkTransactionReceipt(VALID_STMT_ID, 'tx1', VALID_RECEIPT_ID);
    expect(result).toEqual({ ok: false, error: 'Transaction not found' });
  });

  it('errors when the transaction subdocument is not found on the statement', async () => {
    statementFindById.mockResolvedValue({ transactions: { id: () => undefined }, save: vi.fn() });
    const result = await linkTransactionReceipt(VALID_STMT_ID, 'missing-tx', VALID_RECEIPT_ID);
    expect(result).toEqual({ ok: false, error: 'Transaction not found' });
  });

  it('sets matchedReceiptId on the transaction, saves, and revalidates the dependent pages', async () => {
    const tx = { matchedReceiptId: null as unknown };
    const save = vi.fn(async () => {});
    statementFindById.mockResolvedValue({ transactions: { id: (id: string) => (id === 'tx1' ? tx : undefined) }, save });

    const result = await linkTransactionReceipt(VALID_STMT_ID, 'tx1', VALID_RECEIPT_ID);

    expect(result).toEqual({ ok: true });
    expect(String(tx.matchedReceiptId)).toBe(VALID_RECEIPT_ID);
    expect(save).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });
});

describe('unlinkTransactionReceipt', () => {
  it('errors when the statement or transaction is not found', async () => {
    statementFindById.mockResolvedValue(null);
    const result = await unlinkTransactionReceipt(VALID_STMT_ID, 'tx1');
    expect(result).toEqual({ ok: false, error: 'Transaction not found' });
  });

  it('clears matchedReceiptId on the transaction, saves, and revalidates the dependent pages', async () => {
    const tx = { matchedReceiptId: VALID_RECEIPT_ID as unknown };
    const save = vi.fn(async () => {});
    statementFindById.mockResolvedValue({ transactions: { id: (id: string) => (id === 'tx1' ? tx : undefined) }, save });

    const result = await unlinkTransactionReceipt(VALID_STMT_ID, 'tx1');

    expect(result).toEqual({ ok: true });
    expect(tx.matchedReceiptId).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });
});
