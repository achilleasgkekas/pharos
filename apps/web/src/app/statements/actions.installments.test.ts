import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

// app/statements/actions.ts is a large multi-concern module (928 lines). This file covers ONLY
// the installment signature-linking slice (concern (a), left open by actions.crud.test.ts and
// actions.reconcile.test.ts): setTransactionInstallment/bindInstallmentGroup/unbindInstallmentGroup/
// linkInstallmentToItem/linkPlanToItem/removeItemFromPlanByKey/unlinkInstallment/unlinkPlanByKey,
// plus the three unexported signature-based mutators they wrap (addItemBySignature/
// removeItemBySignature/clearLinkBySignature), exercised indirectly through the exported wrappers.
//
// Behaviour pinned:
//  - setTransactionInstallment: total>0 sets installmentInfo (current<=0 clamps to 1,
//    originalPurchase := tx.description); total<=0 clears installmentInfo to null. Always
//    markModified('transactions') + save(), revalidates ONLY '/statements' + '/items' (no
//    '/reports' or '/').
//  - bindInstallmentGroup/unbindInstallmentGroup: same/blank-key guard returns an error BEFORE
//    connectDB. Both scan every statement (Statement.find(), no findById) and only save() a
//    statement that actually changed. bindInstallmentGroup matches a charge by its manual planKey
//    OR (fallback) its auto signature via the private `sigOf` wrapper around installmentSignature;
//    unbindInstallmentGroup matches ONLY the manual planKey (no signature fallback), so a charge
//    that merely shares a signature with the bound key is left untouched.
//  - linkInstallmentToItem/unlinkInstallment: return {error:'Transaction not found'} when the
//    statement or the transaction subdocument is missing; otherwise derive the plan signature
//    straight from the transaction (installmentSignature, no sigOf/installmentInfo pre-check) and
//    delegate to the signature-based mutator.
//  - addItemBySignature (via linkPlanToItem/linkInstallmentToItem): short-circuits to 0 with no
//    ledger scan when sig or itemId is falsy (connectDB still runs, from the exported wrapper).
//    Pushes the itemId (as an ObjectId) onto matchedItemIds once per line; a line whose signature
//    doesn't match, that has no installmentInfo, or that already carries the itemId isn't
//    touched/saved.
//  - removeItemBySignature (via removeItemFromPlanByKey): skips a line with an empty
//    matchedItemIds array entirely (short-circuit before the signature check); pulls only the
//    given itemId, leaving any other id on the same line alone.
//  - clearLinkBySignature (via unlinkPlanByKey/unlinkInstallment): wipes the whole matchedItemIds
//    array on a match.
//  - linkPlanToItem/removeItemFromPlanByKey/unlinkPlanByKey/linkInstallmentToItem/
//    unlinkInstallment all revalidate the full 4-path set via the shared revalidateInstallments
//    helper ('/statements','/items','/reports','/'), unlike bind/unbind's plain 2-path calls.

const {
  connectDBMock,
  statementFindById,
  statementFind,
  installmentSignatureMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  statementFindById: vi.fn(),
  statementFind: vi.fn(),
  // Test-only convenience: reads a `__sig` marker field off the (mock) transaction instead of
  // implementing the real merchant/total/origin signature algorithm, which already has its own
  // pure-lib coverage. Falls back to '' (the "not a recognisable installment" signature).
  installmentSignatureMock: vi.fn((t: any) => (t && t.__sig !== undefined ? t.__sig : '')),
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
    // Unused by this slice, but the module imports them for its other exports.
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));
vi.mock('@/models/Card', () => ({ Card: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: vi.fn() } }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn(), readFile: vi.fn() }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrPdf: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseStatementText: vi.fn(), categorizeTransactions: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/cards', () => ({
  normalizeLast4: (s: string) => s,
  detectCardType: () => 'credit',
  buildCardLabel: (n: string, l: string) => `${n} ${l}`,
}));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/installments', () => ({ installmentSignature: installmentSignatureMock }));
vi.mock('@/lib/reconcile', () => ({ reconcile: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import {
  setTransactionInstallment,
  bindInstallmentGroup,
  unbindInstallmentGroup,
  linkInstallmentToItem,
  linkPlanToItem,
  removeItemFromPlanByKey,
  unlinkInstallment,
  unlinkPlanByKey,
} from './actions';

const ITEM_ID = '507f1f77bcf86cd799439033';
const OTHER_ITEM_ID = '507f1f77bcf86cd799439044';

beforeEach(() => {
  vi.clearAllMocks();
  installmentSignatureMock.mockImplementation((t: any) => (t && t.__sig !== undefined ? t.__sig : ''));
});

describe('setTransactionInstallment', () => {
  it('errors when the statement is not found', async () => {
    statementFindById.mockResolvedValue(null);
    const result = await setTransactionInstallment('s1', 'tx1', 3, 12);
    expect(result).toEqual({ ok: false, error: 'Statement not found' });
  });

  it('errors when the transaction subdocument is not found', async () => {
    statementFindById.mockResolvedValue({ transactions: { id: () => undefined } });
    const result = await setTransactionInstallment('s1', 'missing-tx', 3, 12);
    expect(result).toEqual({ ok: false, error: 'Transaction not found' });
  });

  it('sets installmentInfo from the given current/total, keeping the description as originalPurchase', async () => {
    const tx = { description: 'PLAISIO 09/12', installmentInfo: null as unknown };
    const markModified = vi.fn();
    const save = vi.fn(async () => {});
    statementFindById.mockResolvedValue({
      transactions: { id: (id: string) => (id === 'tx1' ? tx : undefined) },
      markModified,
      save,
    });

    const result = await setTransactionInstallment('s1', 'tx1', 9, 12);

    expect(result).toEqual({ ok: true });
    expect(tx.installmentInfo).toEqual({ currentInstallment: 9, totalInstallments: 12, originalPurchase: 'PLAISIO 09/12' });
    expect(markModified).toHaveBeenCalledWith('transactions');
    expect(save).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/');
  });

  it('clamps a zero/negative current installment to 1', async () => {
    const tx = { description: 'KOTSOVOLOS', installmentInfo: null as unknown };
    statementFindById.mockResolvedValue({ transactions: { id: () => tx }, markModified: vi.fn(), save: vi.fn(async () => {}) });

    await setTransactionInstallment('s1', 'tx1', 0, 36);

    expect((tx.installmentInfo as { currentInstallment: number }).currentInstallment).toBe(1);
  });

  it('clears installmentInfo to null when total is 0', async () => {
    const tx = { description: 'PLAISIO', installmentInfo: { currentInstallment: 3, totalInstallments: 12, originalPurchase: 'PLAISIO' } };
    statementFindById.mockResolvedValue({ transactions: { id: () => tx }, markModified: vi.fn(), save: vi.fn(async () => {}) });

    const result = await setTransactionInstallment('s1', 'tx1', 0, 0);

    expect(result).toEqual({ ok: true });
    expect(tx.installmentInfo).toBeNull();
  });
});

describe('bindInstallmentGroup', () => {
  it('rejects equal source/target keys before connectDB', async () => {
    const result = await bindInstallmentGroup('same', 'same');
    expect(result).toEqual({ ok: false, error: 'Pick two different plans' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects a blank key before connectDB', async () => {
    const result = await bindInstallmentGroup('', 'target');
    expect(result).toEqual({ ok: false, error: 'Pick two different plans' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rebinds a charge matched by manual planKey, and separately one matched only by auto signature (fallback)', async () => {
    const txByPlanKey = { installmentInfo: { planKey: 'source-key' } };
    const txBySignature = { installmentInfo: { planKey: null as string | null }, __sig: 'source-key' };
    const txUnrelated = { installmentInfo: { planKey: 'unrelated' } };
    const saveA = vi.fn(async () => {});
    const markModifiedA = vi.fn();
    const stmtA = { period: '2026-06', transactions: [txByPlanKey, txUnrelated], markModified: markModifiedA, save: saveA };
    const saveB = vi.fn(async () => {});
    const markModifiedB = vi.fn();
    const stmtB = { period: '2026-05', transactions: [txBySignature], markModified: markModifiedB, save: saveB };
    statementFind.mockResolvedValue([stmtA, stmtB]);

    const result = await bindInstallmentGroup('source-key', 'target-key');

    expect(result).toEqual({ ok: true, moved: 2 });
    expect(txByPlanKey.installmentInfo.planKey).toBe('target-key');
    expect(txBySignature.installmentInfo.planKey).toBe('target-key');
    expect(txUnrelated.installmentInfo.planKey).toBe('unrelated');
    expect(markModifiedA).toHaveBeenCalledWith('transactions');
    expect(saveA).toHaveBeenCalledTimes(1);
    expect(markModifiedB).toHaveBeenCalledWith('transactions');
    expect(saveB).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/reports');
  });

  it('skips a transaction without installmentInfo, and never saves a statement with no matching charge', async () => {
    const txNoInstallment = { installmentInfo: null };
    const txOtherKey = { installmentInfo: { planKey: 'other' } };
    const save = vi.fn(async () => {});
    const stmt = { period: '2026-06', transactions: [txNoInstallment, txOtherKey], markModified: vi.fn(), save };
    statementFind.mockResolvedValue([stmt]);

    const result = await bindInstallmentGroup('source-key', 'target-key');

    expect(result).toEqual({ ok: true, moved: 0 });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('unbindInstallmentGroup', () => {
  it('clears the manual planKey on a matching charge and leaves an unrelated one untouched', async () => {
    const txBound = { installmentInfo: { planKey: 'bound-key' as string | null } };
    const txOther = { installmentInfo: { planKey: 'other-key' as string | null } };
    const save = vi.fn(async () => {});
    const markModified = vi.fn();
    const stmt = { transactions: [txBound, txOther], markModified, save };
    statementFind.mockResolvedValue([stmt]);

    const result = await unbindInstallmentGroup('bound-key');

    expect(result).toEqual({ ok: true, moved: 1 });
    expect(txBound.installmentInfo.planKey).toBeNull();
    expect(txOther.installmentInfo.planKey).toBe('other-key');
    expect(markModified).toHaveBeenCalledWith('transactions');
    expect(save).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
  });

  it('ignores a charge that only matches by auto signature (no signature fallback here)', async () => {
    const txSignatureOnly = { installmentInfo: { planKey: null as string | null }, __sig: 'bound-key' };
    const save = vi.fn(async () => {});
    const stmt = { transactions: [txSignatureOnly], markModified: vi.fn(), save };
    statementFind.mockResolvedValue([stmt]);

    const result = await unbindInstallmentGroup('bound-key');

    expect(result).toEqual({ ok: true, moved: 0 });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('linkInstallmentToItem', () => {
  it('errors when the statement is not found', async () => {
    statementFindById.mockResolvedValue(null);
    const result = await linkInstallmentToItem('s1', 'tx1', ITEM_ID);
    expect(result).toEqual({ ok: false, linked: 0, error: 'Transaction not found' });
  });

  it('errors when the transaction subdocument is not found', async () => {
    statementFindById.mockResolvedValue({ period: '2026-06', transactions: { id: () => undefined } });
    const result = await linkInstallmentToItem('s1', 'missing-tx', ITEM_ID);
    expect(result).toEqual({ ok: false, linked: 0, error: 'Transaction not found' });
  });

  it('derives the signature from the transaction + period, links every matching charge across the ledger, and revalidates all 4 paths', async () => {
    const srcTx = { __sig: 'sig1', description: 'PLAISIO' };
    statementFindById.mockResolvedValue({ period: '2026-06', transactions: { id: (id: string) => (id === 'tx1' ? srcTx : undefined) } });

    const matchingLine = { installmentInfo: {}, __sig: 'sig1', matchedItemIds: [] as unknown[] };
    const otherLine = { installmentInfo: {}, __sig: 'sig2', matchedItemIds: [] as unknown[] };
    const save = vi.fn(async () => {});
    statementFind.mockResolvedValue([{ period: '2026-06', transactions: [matchingLine, otherLine], save }]);

    const result = await linkInstallmentToItem('s1', 'tx1', ITEM_ID);

    expect(result).toEqual({ ok: true, linked: 1 });
    expect(matchingLine.matchedItemIds.map(String)).toEqual([ITEM_ID]);
    expect(otherLine.matchedItemIds).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
    for (const p of ['/statements', '/items', '/reports', '/']) {
      expect(revalidatePathMock).toHaveBeenCalledWith(p);
    }
  });
});

describe('linkPlanToItem / addItemBySignature', () => {
  it('short-circuits to 0 linked (no ledger scan) for a blank signature, though connectDB still runs', async () => {
    const result = await linkPlanToItem('', ITEM_ID);
    expect(result).toEqual({ ok: true, linked: 0 });
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(statementFind).not.toHaveBeenCalled();
  });

  it('links every matching line once, skips a line that already carries the itemId, and never saves an unchanged statement', async () => {
    const unlinkedMatch = { installmentInfo: {}, __sig: 'sig1', matchedItemIds: [] as unknown[] };
    const alreadyLinked = { installmentInfo: {}, __sig: 'sig1', matchedItemIds: [new Types.ObjectId(ITEM_ID)] as unknown[] };
    const noInstallment = { installmentInfo: null, __sig: 'sig1', matchedItemIds: [] as unknown[] };
    const save1 = vi.fn(async () => {});
    const stmt1 = { period: '2026-06', transactions: [unlinkedMatch, alreadyLinked, noInstallment], save: save1 };

    const untouchedSig = { installmentInfo: {}, __sig: 'sig-other', matchedItemIds: [] as unknown[] };
    const save2 = vi.fn(async () => {});
    const stmt2 = { period: '2026-05', transactions: [untouchedSig], save: save2 };

    statementFind.mockResolvedValue([stmt1, stmt2]);

    const result = await linkPlanToItem('sig1', ITEM_ID);

    expect(result).toEqual({ ok: true, linked: 1 });
    expect(unlinkedMatch.matchedItemIds.map(String)).toEqual([ITEM_ID]);
    expect(alreadyLinked.matchedItemIds).toHaveLength(1);
    expect(save1).toHaveBeenCalledTimes(1);
    expect(save2).not.toHaveBeenCalled();
    for (const p of ['/statements', '/items', '/reports', '/']) {
      expect(revalidatePathMock).toHaveBeenCalledWith(p);
    }
  });
});

describe('removeItemFromPlanByKey / removeItemBySignature', () => {
  it('skips a line with an empty matchedItemIds array entirely, and pulls the itemId from a matching line without touching an unrelated id', async () => {
    const empty = { installmentInfo: {}, __sig: 'sig1', matchedItemIds: [] as unknown[] };
    const withBoth = {
      installmentInfo: {},
      __sig: 'sig1',
      matchedItemIds: [new Types.ObjectId(ITEM_ID), new Types.ObjectId(OTHER_ITEM_ID)] as unknown[],
    };
    const save = vi.fn(async () => {});
    const stmt = { period: '2026-06', transactions: [empty, withBoth], save };
    statementFind.mockResolvedValue([stmt]);

    const result = await removeItemFromPlanByKey('sig1', ITEM_ID);

    expect(result).toEqual({ ok: true });
    expect(empty.matchedItemIds).toEqual([]);
    expect(withBoth.matchedItemIds.map(String)).toEqual([OTHER_ITEM_ID]);
    expect(save).toHaveBeenCalledTimes(1);
    for (const p of ['/statements', '/items', '/reports', '/']) {
      expect(revalidatePathMock).toHaveBeenCalledWith(p);
    }
  });

  it('never saves when nothing on the statement matches the signature', async () => {
    const line = { installmentInfo: {}, __sig: 'sig-other', matchedItemIds: [new Types.ObjectId(ITEM_ID)] as unknown[] };
    const save = vi.fn(async () => {});
    statementFind.mockResolvedValue([{ period: '2026-06', transactions: [line], save }]);

    await removeItemFromPlanByKey('sig1', ITEM_ID);

    expect(save).not.toHaveBeenCalled();
  });
});

describe('unlinkInstallment', () => {
  it('returns {ok:false} when the statement or transaction is missing (no ledger scan)', async () => {
    statementFindById.mockResolvedValue(null);
    const result = await unlinkInstallment('s1', 'tx1');
    expect(result).toEqual({ ok: false });
    expect(statementFind).not.toHaveBeenCalled();
  });

  it('derives the signature and clears matchedItemIds on every matching line', async () => {
    const srcTx = { __sig: 'sig1' };
    statementFindById.mockResolvedValue({ period: '2026-06', transactions: { id: (id: string) => (id === 'tx1' ? srcTx : undefined) } });
    const matching = { installmentInfo: {}, __sig: 'sig1', matchedItemIds: [new Types.ObjectId(ITEM_ID)] as unknown[] };
    const save = vi.fn(async () => {});
    statementFind.mockResolvedValue([{ period: '2026-06', transactions: [matching], save }]);

    const result = await unlinkInstallment('s1', 'tx1');

    expect(result).toEqual({ ok: true });
    expect(matching.matchedItemIds).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('unlinkPlanByKey', () => {
  it('wipes matchedItemIds on every matching line across the ledger', async () => {
    const matchingA = { installmentInfo: {}, __sig: 'sig1', matchedItemIds: [new Types.ObjectId(ITEM_ID)] as unknown[] };
    const saveA = vi.fn(async () => {});
    const matchingB = { installmentInfo: {}, __sig: 'sig1', matchedItemIds: [new Types.ObjectId(OTHER_ITEM_ID)] as unknown[] };
    const saveB = vi.fn(async () => {});
    statementFind.mockResolvedValue([
      { period: '2026-06', transactions: [matchingA], save: saveA },
      { period: '2026-05', transactions: [matchingB], save: saveB },
    ]);

    const result = await unlinkPlanByKey('sig1');

    expect(result).toEqual({ ok: true });
    expect(matchingA.matchedItemIds).toEqual([]);
    expect(matchingB.matchedItemIds).toEqual([]);
    expect(saveA).toHaveBeenCalledTimes(1);
    expect(saveB).toHaveBeenCalledTimes(1);
    for (const p of ['/statements', '/items', '/reports', '/']) {
      expect(revalidatePathMock).toHaveBeenCalledWith(p);
    }
  });

  it('still returns ok for a blank signature (no ledger scan)', async () => {
    const result = await unlinkPlanByKey('');
    expect(result).toEqual({ ok: true });
    expect(statementFind).not.toHaveBeenCalled();
  });
});
