import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/reports/fxActions.ts (P9 slice 9) — applying a missing exchange rate from the
// /reports audit panel, never directly unit-tested before. The conversion RULE
// (fxApplyPatch) is pure and already covered by lib/fxApply.test.ts, and normalizeCurrency/
// isValidFxRate/fxNeedsRateFilter each have their own test files too (lib/fx.test.ts,
// lib/fxAudit.test.ts) — all four are mocked here as opaque with faithful-enough default
// implementations, so this file pins only what belongs to the ACTION layer: gate ordering,
// id/kind/rate validation, model dispatch via currentModel, the query shapes built per
// kind, and which routes get revalidated when.
//
// Like actions.duplicates.test.ts, `currentModel` dispatches on which model token it was
// given — six models (Expense/Receipt/Item/Subscription/Statement/Bill) can each be
// queried, so every model gets its own isolated set of mock chain functions.
//
// Behaviour pinned (applyFxRate — one record):
//  - assertCanWrite() runs BEFORE any validation; a gate rejection propagates uncaught,
//    it is never swallowed into an {ok:false} result (only the try/catch INSIDE
//    withRequestTenant does that).
//  - kind/id/rate are validated in that order, all three checks happen OUTSIDE
//    withRequestTenant (connectDB is never reached on a validation failure).
//  - 'income' dispatches to the same Expense model token as 'expense' (one collection).
//  - doc not found -> {ok:false,'Record not found'}, fxApplyPatch is never called.
//  - fxApplyPatch returning null (already converted / not foreign) -> {ok:true, applied:0},
//    no updateOne, no revalidate.
//  - a real patch -> M.updateOne({_id:id},{$set:patch}), revalidates all ten money routes,
//    {ok:true, applied:1}.
//  - a thrown error inside the try block is caught and turned into {ok:false, error:msg}.
//
// Behaviour pinned (applyFxRateToCurrency — bulk by currency):
//  - Same gate-before-validation shape; invalid currency code or invalid rate short-circuit
//    before connectDB.
//  - The base-currency guard compares against normalizeCurrency(settings.currency) with an
//    'EUR' fallback when that normalizes to '' — rejected as "That is the base currency".
//  - Loops exactly six kinds (expense, receipt, item, subscription, statement, bill) —
//    'income' is deliberately absent from the loop, reached only via `d.kind==='income'`
//    inside the shared expense collection.
//  - archived:{$ne:true} is merged into the query ONLY for receipt and bill.
//  - a null patch is dropped, never added to the bulkWrite ops; a model with zero ops never
//    calls bulkWrite.
//  - applied sums ops.length across kinds; revalidate only fires when applied > 0.
const VALID_ID = '507f1f77bcf86cd799439011';

const FILTER_MARKER = { __filterMarker: true };

const {
  connectDBMock,
  assertCanWriteMock,
  getAppSettingsMock,
  revalidatePathMock,
  fxApplyPatchMock,
  isValidFxRateMock,
  normalizeCurrencyMock,
  fxNeedsRateFilterMock,
  models,
  FX_APPLY_SELECT_MOCK,
} = vi.hoisted(() => {
  function makeModel() {
    const findByIdLean = vi.fn(async () => null as Record<string, unknown> | null);
    const findByIdSelect = vi.fn((_s: string) => ({ lean: findByIdLean }));
    const findById = vi.fn((_id: string) => ({ select: findByIdSelect }));
    const updateOne = vi.fn(async (_f: Record<string, unknown>, _u: Record<string, unknown>) => ({}));
    const findLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
    const findLimit = vi.fn((_n: number) => ({ lean: findLean }));
    const findSelect = vi.fn((_s: string) => ({ limit: findLimit }));
    const find = vi.fn((_q: Record<string, unknown>) => ({ select: findSelect }));
    const bulkWrite = vi.fn(async (_ops: unknown[]) => ({}));
    return { findById, findByIdSelect, findByIdLean, updateOne, find, findSelect, findLimit, findLean, bulkWrite };
  }
  return {
    connectDBMock: vi.fn(async () => {}),
    assertCanWriteMock: vi.fn(async () => undefined),
    getAppSettingsMock: vi.fn(async () => ({ currency: 'EUR' } as Record<string, unknown>)),
    revalidatePathMock: vi.fn(),
    fxApplyPatchMock: vi.fn(
      (_kind: string, _doc: Record<string, unknown>, _rate: number, _base: string) =>
        null as Record<string, unknown> | null
    ),
    isValidFxRateMock: vi.fn((rate: unknown) => {
      const r = Number(rate);
      return Number.isFinite(r) && r > 0 && r <= 1e6;
    }),
    normalizeCurrencyMock: vi.fn((code?: string | null) => {
      const c = (code ?? '').trim().toUpperCase();
      return /^[A-Z]{3}$/.test(c) ? c : '';
    }),
    fxNeedsRateFilterMock: vi.fn((_base: string) => ({ __filterMarker: true }) as Record<string, unknown>),
    models: {
      expense: makeModel(),
      receipt: makeModel(),
      item: makeModel(),
      subscription: makeModel(),
      statement: makeModel(),
      bill: makeModel(),
    },
    FX_APPLY_SELECT_MOCK: {
      expense: 'SEL_EXPENSE',
      income: 'SEL_INCOME',
      bill: 'SEL_BILL',
      subscription: 'SEL_SUBSCRIPTION',
      receipt: 'SEL_RECEIPT',
      item: 'SEL_ITEM',
      statement: 'SEL_STATEMENT',
    } as Record<string, string>,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: assertCanWriteMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (token: unknown) => {
    const map: Record<string, unknown> = {
      EXPENSE_TOKEN: models.expense,
      RECEIPT_TOKEN: models.receipt,
      ITEM_TOKEN: models.item,
      SUBSCRIPTION_TOKEN: models.subscription,
      STATEMENT_TOKEN: models.statement,
      BILL_TOKEN: models.bill,
    };
    return map[token as string];
  },
}));
vi.mock('@/models/Expense', () => ({ Expense: 'EXPENSE_TOKEN' }));
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_TOKEN' }));
vi.mock('@/models/Item', () => ({ Item: 'ITEM_TOKEN' }));
vi.mock('@/models/Subscription', () => ({ Subscription: 'SUBSCRIPTION_TOKEN' }));
vi.mock('@/models/Statement', () => ({ Statement: 'STATEMENT_TOKEN' }));
vi.mock('@/models/Bill', () => ({ Bill: 'BILL_TOKEN' }));
vi.mock('@/lib/fxAudit', () => ({ fxNeedsRateFilter: fxNeedsRateFilterMock }));
vi.mock('@/lib/fxApply', () => ({
  fxApplyPatch: fxApplyPatchMock,
  isValidFxRate: isValidFxRateMock,
  FX_APPLY_SELECT: FX_APPLY_SELECT_MOCK,
}));
vi.mock('@/lib/fx', () => ({ normalizeCurrency: normalizeCurrencyMock }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));
const { settleBillsMock } = vi.hoisted(() => ({ settleBillsMock: vi.fn(async (_ids: string[]) => {}) }));
vi.mock('@/app/bills/actions', () => ({ settleBillsCoveredByPayments: settleBillsMock }));

import { applyFxRate, applyFxRateToCurrency } from './fxActions';

const MONEY_ROUTES = [
  '/reports', '/', '/expenses', '/income', '/receipts', '/items', '/shopping',
  '/subscriptions', '/statements', '/bills', '/calendar',
];

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  assertCanWriteMock.mockImplementation(async () => undefined);
  getAppSettingsMock.mockImplementation(async () => ({ currency: 'EUR' }));
  fxApplyPatchMock.mockImplementation(() => null);
  isValidFxRateMock.mockImplementation((rate: unknown) => {
    const r = Number(rate);
    return Number.isFinite(r) && r > 0 && r <= 1e6;
  });
  normalizeCurrencyMock.mockImplementation((code?: string | null) => {
    const c = (code ?? '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? c : '';
  });
  fxNeedsRateFilterMock.mockImplementation(() => ({ ...FILTER_MARKER }));
  for (const m of Object.values(models)) {
    m.findByIdLean.mockImplementation(async () => null);
    m.findLean.mockImplementation(async () => []);
    m.updateOne.mockImplementation(async () => ({}));
    m.bulkWrite.mockImplementation(async () => ({}));
  }
});

describe('applyFxRate', () => {
  it('always calls assertCanWrite, even for an unknown kind', async () => {
    const result = await applyFxRate('bogus', VALID_ID, 1.1);
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: 'Unknown record type' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('propagates an assertCanWrite rejection uncaught (gate failure is not swallowed)', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(applyFxRate('expense', VALID_ID, 1.1)).rejects.toThrow('Forbidden');
  });

  it.each(['not-hex', '507f1f77bcf86cd79943901', '507f1f77bcf86cd7994390111', ''])(
    'rejects an invalid id %j',
    async (badId) => {
      const result = await applyFxRate('expense', badId, 1.1);
      expect(result).toEqual({ ok: false, error: 'Invalid id' });
      expect(connectDBMock).not.toHaveBeenCalled();
    }
  );

  it.each([0, -5, NaN, 1e7])('rejects an invalid rate %j', async (badRate) => {
    const result = await applyFxRate('expense', VALID_ID, badRate);
    expect(result).toEqual({ ok: false, error: 'Enter a positive exchange rate' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('returns "Record not found" and never calls fxApplyPatch when the doc is missing', async () => {
    models.expense.findByIdLean.mockResolvedValueOnce(null);
    const result = await applyFxRate('expense', VALID_ID, 1.1);
    expect(models.expense.findById).toHaveBeenCalledWith(VALID_ID);
    expect(models.expense.findByIdSelect).toHaveBeenCalledWith(FX_APPLY_SELECT_MOCK.expense);
    expect(fxApplyPatchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'Record not found' });
  });

  it('returns applied:0 without writing when fxApplyPatch says nothing to do', async () => {
    models.expense.findByIdLean.mockResolvedValueOnce({ _id: VALID_ID, currency: 'EUR' });
    fxApplyPatchMock.mockReturnValueOnce(null);
    const result = await applyFxRate('expense', VALID_ID, 1.1);
    expect(models.expense.updateOne).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, applied: 0 });
  });

  it('writes the patch and revalidates every money route on a real conversion', async () => {
    const doc = { _id: VALID_ID, currency: 'USD', origAmount: 10 };
    models.expense.findByIdLean.mockResolvedValueOnce(doc);
    const patch = { fxRate: 1.1, amount: 11 };
    fxApplyPatchMock.mockReturnValueOnce(patch);

    const result = await applyFxRate('expense', VALID_ID, 1.1);

    expect(fxApplyPatchMock).toHaveBeenCalledWith('expense', doc, 1.1, 'EUR');
    expect(models.expense.updateOne).toHaveBeenCalledWith({ _id: VALID_ID }, { $set: patch });
    expect(revalidatePathMock).toHaveBeenCalledTimes(MONEY_ROUTES.length);
    for (const route of MONEY_ROUTES) expect(revalidatePathMock).toHaveBeenCalledWith(route);
    expect(result).toEqual({ ok: true, applied: 1 });
    expect(settleBillsMock).not.toHaveBeenCalled();
  });

  // #297: instalments logged while the rate was missing could not settle the bill.
  it('offers a converted bill to the instalment settlement check', async () => {
    models.bill.findByIdLean.mockResolvedValueOnce({ _id: VALID_ID, currency: 'USD', origAmount: 100 });
    fxApplyPatchMock.mockReturnValueOnce({ fxRate: 0.92, amount: 92 });

    await applyFxRate('bill', VALID_ID, 0.92);

    expect(models.bill.updateOne).toHaveBeenCalled();
    expect(settleBillsMock).toHaveBeenCalledWith([VALID_ID]);
  });

  it('dispatches kind "income" to the same Expense model as "expense"', async () => {
    models.expense.findByIdLean.mockResolvedValueOnce({ _id: VALID_ID, kind: 'income' });
    fxApplyPatchMock.mockReturnValueOnce({ fxRate: 1.1, amount: 5 });

    const result = await applyFxRate('income', VALID_ID, 1.1);

    expect(models.expense.findById).toHaveBeenCalledWith(VALID_ID);
    expect(models.expense.findByIdSelect).toHaveBeenCalledWith(FX_APPLY_SELECT_MOCK.income);
    expect(result).toEqual({ ok: true, applied: 1 });
  });

  it('catches a thrown error inside the tenant block and reports its message', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('DB unreachable'));
    const result = await applyFxRate('item', VALID_ID, 1.1);
    expect(result).toEqual({ ok: false, error: 'DB unreachable' });
  });
});

describe('applyFxRateToCurrency', () => {
  it('always calls assertCanWrite, even for an invalid currency code', async () => {
    const result = await applyFxRateToCurrency('nope', 1.1);
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: 'Invalid currency code' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('propagates an assertCanWrite rejection uncaught (gate failure is not swallowed)', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(applyFxRateToCurrency('USD', 1.1)).rejects.toThrow('Forbidden');
  });

  it.each([0, -1, NaN, 1e7])('rejects an invalid rate %j', async (badRate) => {
    const result = await applyFxRateToCurrency('USD', badRate);
    expect(result).toEqual({ ok: false, error: 'Enter a positive exchange rate' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects the deployment\'s own base currency', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ currency: 'EUR' });
    const result = await applyFxRateToCurrency('eur', 1.1);
    expect(result).toEqual({ ok: false, error: 'That is the base currency' });
    for (const m of Object.values(models)) expect(m.find).not.toHaveBeenCalled();
  });

  it('falls back to EUR as the base when settings.currency does not normalize', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ currency: '' });
    const result = await applyFxRateToCurrency('EUR', 1.1);
    expect(result).toEqual({ ok: false, error: 'That is the base currency' });
  });

  it('queries exactly six kinds, excluding "income" from the loop', async () => {
    await applyFxRateToCurrency('USD', 1.1);
    expect(models.expense.find).toHaveBeenCalledTimes(1);
    expect(models.receipt.find).toHaveBeenCalledTimes(1);
    expect(models.item.find).toHaveBeenCalledTimes(1);
    expect(models.subscription.find).toHaveBeenCalledTimes(1);
    expect(models.statement.find).toHaveBeenCalledTimes(1);
    expect(models.bill.find).toHaveBeenCalledTimes(1);
  });

  it('merges currency into fxNeedsRateFilter\'s result, without archived, for expense/item/subscription/statement', async () => {
    await applyFxRateToCurrency('USD', 1.1);
    expect(fxNeedsRateFilterMock).toHaveBeenCalledWith('EUR');
    expect(models.expense.find).toHaveBeenCalledWith({ ...FILTER_MARKER, currency: 'USD' });
    expect(models.item.find).toHaveBeenCalledWith({ ...FILTER_MARKER, currency: 'USD' });
    expect(models.subscription.find).toHaveBeenCalledWith({ ...FILTER_MARKER, currency: 'USD' });
    expect(models.statement.find).toHaveBeenCalledWith({ ...FILTER_MARKER, currency: 'USD' });
  });

  it('additionally scopes receipt and bill queries to archived:{$ne:true}', async () => {
    await applyFxRateToCurrency('USD', 1.1);
    expect(models.receipt.find).toHaveBeenCalledWith({ ...FILTER_MARKER, currency: 'USD', archived: { $ne: true } });
    expect(models.bill.find).toHaveBeenCalledWith({ ...FILTER_MARKER, currency: 'USD', archived: { $ne: true } });
  });

  it('selects the per-kind projection and caps every query at 500 (MAX_BULK)', async () => {
    await applyFxRateToCurrency('USD', 1.1);
    expect(models.expense.findSelect).toHaveBeenCalledWith(FX_APPLY_SELECT_MOCK.expense);
    expect(models.receipt.findSelect).toHaveBeenCalledWith(FX_APPLY_SELECT_MOCK.receipt);
    expect(models.expense.findLimit).toHaveBeenCalledWith(500);
    expect(models.receipt.findLimit).toHaveBeenCalledWith(500);
  });

  it('resolves a shared-collection doc\'s own kind ("income") per-row instead of assuming the loop kind', async () => {
    const expenseDoc = { _id: '507f1f77bcf86cd799439012', kind: 'expense', currency: 'USD' };
    const incomeDoc = { _id: '507f1f77bcf86cd799439013', kind: 'income', currency: 'USD' };
    models.expense.findLean.mockResolvedValueOnce([expenseDoc, incomeDoc]);
    fxApplyPatchMock.mockReturnValue({ fxRate: 1.1 });

    await applyFxRateToCurrency('USD', 1.1);

    expect(fxApplyPatchMock).toHaveBeenCalledWith('expense', expenseDoc, 1.1, 'EUR');
    expect(fxApplyPatchMock).toHaveBeenCalledWith('income', incomeDoc, 1.1, 'EUR');
  });

  it('drops docs whose patch is null and never calls bulkWrite when a model ends up with zero ops', async () => {
    const doc = { _id: '507f1f77bcf86cd799439012', currency: 'USD' };
    models.item.findLean.mockResolvedValueOnce([doc]);
    fxApplyPatchMock.mockReturnValueOnce(null);

    const result = await applyFxRateToCurrency('USD', 1.1);

    expect(models.item.bulkWrite).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, applied: 0 });
  });

  it('bulkWrites one updateOne op per patched doc and sums applied across kinds', async () => {
    const itemDoc = { _id: '507f1f77bcf86cd799439012', currency: 'USD' };
    const billDoc = { _id: '507f1f77bcf86cd799439013', currency: 'USD' };
    models.item.findLean.mockResolvedValueOnce([itemDoc]);
    models.bill.findLean.mockResolvedValueOnce([billDoc]);
    const itemPatch = { fxRate: 1.1, currentPrice: 99 };
    const billPatch = { fxRate: 1.1, amount: 42 };
    fxApplyPatchMock.mockImplementation((kind: string) => (kind === 'item' ? itemPatch : kind === 'bill' ? billPatch : null));

    const result = await applyFxRateToCurrency('USD', 1.1);

    expect(models.item.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: itemDoc._id }, update: { $set: itemPatch } } },
    ]);
    expect(models.bill.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: billDoc._id }, update: { $set: billPatch } } },
    ]);
    expect(result).toEqual({ ok: true, applied: 2 });
    // #297: only the converted bills are offered to the settlement check.
    expect(settleBillsMock).toHaveBeenCalledWith([billDoc._id]);
  });

  it('revalidates money routes only when something was actually applied', async () => {
    await applyFxRateToCurrency('USD', 1.1);
    expect(revalidatePathMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    connectDBMock.mockImplementation(async () => {});
    getAppSettingsMock.mockImplementation(async () => ({ currency: 'EUR' }));
    normalizeCurrencyMock.mockImplementation((code?: string | null) => {
      const c = (code ?? '').trim().toUpperCase();
      return /^[A-Z]{3}$/.test(c) ? c : '';
    });
    fxNeedsRateFilterMock.mockImplementation(() => ({ ...FILTER_MARKER }));
    for (const m of Object.values(models)) {
      m.findLean.mockImplementation(async () => []);
      m.bulkWrite.mockImplementation(async () => ({}));
    }
    models.subscription.findLean.mockResolvedValueOnce([{ _id: VALID_ID, currency: 'USD' }]);
    isValidFxRateMock.mockImplementation((rate: unknown) => {
      const r = Number(rate);
      return Number.isFinite(r) && r > 0 && r <= 1e6;
    });
    fxApplyPatchMock.mockReturnValueOnce({ fxRate: 1.1, amount: 7 });

    const result = await applyFxRateToCurrency('USD', 1.1);
    expect(revalidatePathMock).toHaveBeenCalledTimes(MONEY_ROUTES.length);
    expect(result).toEqual({ ok: true, applied: 1 });
  });

  it('catches a thrown error and reports its message instead of throwing', async () => {
    getAppSettingsMock.mockRejectedValueOnce(new Error('settings down'));
    const result = await applyFxRateToCurrency('USD', 1.1);
    expect(result).toEqual({ ok: false, error: 'settings down' });
  });
});
