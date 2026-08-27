import { describe, it, expect, vi, beforeEach } from 'vitest';

// P62 — the payment-method split slice of app/expenses/actions.ts: the new
// `paymentSplits` field on add/update, and the automatic mirroring of gift-card rows
// into that card's `uses[]` spend log. Kept in its own file (same convention as the
// other actions.<concern>.test.ts siblings) so the crud file stays about plain CRUD.
//
// Unlike actions.crud.test.ts, `currentModel` here dispatches on the model it is
// handed, because this slice is the first place the expenses actions touch a SECOND
// collection (GiftCard). Behaviour pinned:
//  - an absent/empty split stores [] and never touches a gift card (pre-P62 behaviour);
//  - malformed rows are cleaned, not rejected — a bad split can never block the save;
//  - saving ALWAYS pulls this expense's previously-mirrored uses first, so re-saving,
//    re-pointing or clearing a split converges instead of stacking duplicate spends;
//  - hand-typed uses (expenseId '') are never in the pull filter;
//  - a gift-card write that blows up (stale id) leaves the expense saved.

const {
  connectDBMock,
  expenseCreate,
  expenseUpdateOne,
  expenseFindOneSortLean,
  expenseFindSelectLean,
  giftCardUpdateMany,
  giftCardUpdateOne,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  expenseCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'e1' })),
  expenseUpdateOne: vi.fn(async (_f: Record<string, any>, _u: Record<string, any>) => ({})),
  expenseFindOneSortLean: vi.fn(async () => null as Record<string, any> | null),
  expenseFindSelectLean: vi.fn(async () => [] as Array<Record<string, any>>),
  giftCardUpdateMany: vi.fn(async (_f: Record<string, any>, _u: Record<string, any>) => ({ modifiedCount: 0 })),
  giftCardUpdateOne: vi.fn(async (_f: Record<string, any>, _u: Record<string, any>) => ({})),
  getAppSettingsMock: vi.fn(async () => ({ categoryRules: [] as any[] })),
  revalidatePathMock: vi.fn(),
}));

const expenseModel = {
  create: expenseCreate,
  updateOne: expenseUpdateOne,
  findOne: () => ({ sort: () => ({ lean: expenseFindOneSortLean }) }),
  find: () => ({ select: () => ({ lean: expenseFindSelectLean }) }),
};
const giftCardModel = { updateMany: giftCardUpdateMany, updateOne: giftCardUpdateOne };

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (m: { __model?: string }) => (m?.__model === 'giftcard' ? giftCardModel : expenseModel),
}));
vi.mock('@/models/Expense', () => ({ Expense: { __model: 'expense' } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { __model: 'giftcard' } }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseExpenseText: vi.fn(), parseExpenseImage: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrImage: vi.fn(), looksLikeUsableOcr: vi.fn() }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/csvImport', () => ({ csvDedupeKey: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { updateExpense, addExpense } from './actions';

const BASE = { kind: 'expense' as const, vendor: 'IKEA', date: '2026-08-28', amount: 75 };

/** The $set the action handed to Expense.updateOne. */
function setOf() {
  return expenseUpdateOne.mock.calls[0][1].$set as Record<string, any>;
}
/** The `uses` sub-document pushed onto a gift card. */
function pushedUse(call = 0) {
  return giftCardUpdateOne.mock.calls[call][1].$push.uses as Record<string, any>;
}

beforeEach(() => {
  vi.clearAllMocks();
  expenseFindOneSortLean.mockResolvedValue(null);
  expenseFindSelectLean.mockResolvedValue([]);
  giftCardUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  getAppSettingsMock.mockResolvedValue({ categoryRules: [] });
});

describe('paymentSplits field (pre-P62 behaviour is the default)', () => {
  it('stores an empty split when the caller sends none', async () => {
    await updateExpense('e1', BASE);
    expect(setOf().paymentSplits).toEqual([]);
  });

  it('creates with an empty split when the caller sends none', async () => {
    await addExpense(BASE);
    expect(expenseCreate.mock.calls[0][0].paymentSplits).toEqual([]);
  });

  it('never writes to a gift card when nothing is linked', async () => {
    await updateExpense('e1', { ...BASE, paymentSplits: [{ method: 'Visa', amount: 75 }] });
    expect(giftCardUpdateOne).not.toHaveBeenCalled();
  });

  it('cleans the rows it stores (trim, cents, drop the empty ones)', async () => {
    await updateExpense('e1', {
      ...BASE,
      paymentSplits: [{ method: '  Visa ', amount: 45.005 }, { method: '   ', amount: 30 }],
    });
    expect(setOf().paymentSplits).toEqual([{ method: 'Visa', amount: 45.01, giftCardId: '' }]);
  });

  it('degrades a malformed split to [] instead of failing the whole save', async () => {
    const r = await updateExpense('e1', { ...BASE, paymentSplits: 'not-an-array' as any });
    expect(r.ok).toBe(true);
    expect(setOf().paymentSplits).toEqual([]);
  });

  it('degrades a split whose ROWS are the wrong shape, keeping the rest of the expense', async () => {
    const r = await updateExpense('e1', { ...BASE, paymentSplits: [42, null] as any });
    expect(r.ok).toBe(true);
    expect(setOf().paymentSplits).toEqual([]);
    expect(setOf().vendor).toBe('IKEA');
  });
});

describe('gift-card mirroring', () => {
  const SPLIT = [
    { method: 'IKEA gift card', amount: 30, giftCardId: 'g1' },
    { method: 'Visa', amount: 45, giftCardId: '' },
  ];

  it('pushes ONE use for the linked card, tagged with the expense id', async () => {
    await updateExpense('e1', { ...BASE, paymentSplits: SPLIT });
    expect(giftCardUpdateOne).toHaveBeenCalledTimes(1);
    expect(giftCardUpdateOne.mock.calls[0][0]).toEqual({ _id: 'g1' });
    expect(pushedUse()).toMatchObject({ amount: 30, note: 'IKEA', expenseId: 'e1' });
    expect(pushedUse().date).toBeInstanceOf(Date);
  });

  it('THE ONE THAT MATTERS: removes this expense’s own earlier uses before writing, so a re-save does not stack duplicates', async () => {
    await updateExpense('e1', { ...BASE, paymentSplits: SPLIT });
    expect(giftCardUpdateMany).toHaveBeenCalledWith(
      { 'uses.expenseId': 'e1' },
      { $pull: { uses: { expenseId: 'e1' } } }
    );
    // the pull runs BEFORE the push, never after
    expect(giftCardUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(giftCardUpdateOne.mock.invocationCallOrder[0]);
  });

  it('clearing the split removes the mirrored uses and writes nothing new', async () => {
    await updateExpense('e1', { ...BASE, paymentSplits: [] });
    expect(giftCardUpdateMany).toHaveBeenCalledWith(
      { 'uses.expenseId': 'e1' },
      { $pull: { uses: { expenseId: 'e1' } } }
    );
    expect(giftCardUpdateOne).not.toHaveBeenCalled();
  });

  it('the pull only ever targets THIS expense, so hand-typed card uses survive', async () => {
    await updateExpense('e1', { ...BASE, paymentSplits: SPLIT });
    const filter = giftCardUpdateMany.mock.calls[0][1].$pull.uses as Record<string, any>;
    expect(filter).toEqual({ expenseId: 'e1' }); // NOT a blanket {} — manual uses carry expenseId ''
  });

  it('collapses two rows on the same card into a single use', async () => {
    await updateExpense('e1', {
      ...BASE,
      paymentSplits: [
        { method: 'IKEA', amount: 30, giftCardId: 'g1' },
        { method: 'IKEA', amount: 12.5, giftCardId: 'g1' },
      ],
    });
    expect(giftCardUpdateOne).toHaveBeenCalledTimes(1);
    expect(pushedUse().amount).toBe(42.5);
  });

  it('mirrors on create too, using the id of the expense just created', async () => {
    expenseCreate.mockResolvedValueOnce({ _id: 'new-1' });
    await addExpense({ ...BASE, paymentSplits: SPLIT });
    expect(giftCardUpdateMany).toHaveBeenCalledWith(
      { 'uses.expenseId': 'new-1' },
      { $pull: { uses: { expenseId: 'new-1' } } }
    );
    expect(pushedUse()).toMatchObject({ amount: 30, expenseId: 'new-1' });
  });

  it('a stale/unknown gift-card id does NOT fail the save', async () => {
    giftCardUpdateOne.mockRejectedValueOnce(new Error('CastError'));
    const r = await updateExpense('e1', { ...BASE, paymentSplits: SPLIT });
    expect(r.ok).toBe(true);
    expect(setOf().paymentSplits).toHaveLength(2);
  });

  it('a gift-card collection that is entirely unavailable does NOT fail the save', async () => {
    giftCardUpdateMany.mockRejectedValueOnce(new Error('no connection'));
    const r = await addExpense({ ...BASE, paymentSplits: SPLIT });
    expect(r.ok).toBe(true);
    expect(expenseCreate).toHaveBeenCalled();
  });

  it('refreshes the vouchers page only when a card was actually touched', async () => {
    await updateExpense('e1', { ...BASE, paymentSplits: [{ method: 'Cash', amount: 75 }] });
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/vouchers');
    vi.clearAllMocks();
    giftCardUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    await updateExpense('e1', { ...BASE, paymentSplits: SPLIT });
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});
