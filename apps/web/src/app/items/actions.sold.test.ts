import { describe, it, expect, vi, beforeEach } from 'vitest';

// P55 — resale / disposal proceeds. Companion to actions.crud.test.ts, which owns the
// generic createItem/updateItem/deleteItem surface; this file pins ONLY the sale slice.
//
// Behaviour pinned:
//  - updateItem persists the three optional sale fields, and leaving them blank writes
//    null/null/'' so a bare `sold` status keeps behaving exactly as it did pre-P55.
//  - `soldPrice` is deliberately OUTSIDE the FX pipeline: on a foreign item the purchase
//    price IS converted by the item's rate while the sale price passes through untouched,
//    because that rate belongs to the original receipt and a resale is its own transaction.
//  - logSaleAsIncome is opt-in, and idempotent via `soldIncomeId`: a sale already booked
//    is refused without calling addExpense a second time, which is the whole point of the
//    guard (a double click must not double-count money).
//  - It refuses a sale with no recorded price, and stamps the created Expense id back on
//    the item so the UI can flip from the button to the "already logged" note.

const {
  connectDBMock,
  itemCreate,
  itemFindByIdAndUpdate,
  itemFindById,
  itemUpdateOne,
  getAppSettingsMock,
  revalidatePathMock,
  addExpenseMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'item1' })),
  itemFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  itemFindById: vi.fn((_id: string) => ({ lean: async () => null as Record<string, any> | null })),
  itemUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  getAppSettingsMock: vi.fn(async () => ({ currency: 'EUR' })),
  revalidatePathMock: vi.fn(),
  addExpenseMock: vi.fn(async (_data: Record<string, any>) => ({ ok: true, id: 'inc1' })),
}));

const itemModel = {
  create: itemCreate,
  findByIdAndUpdate: itemFindByIdAndUpdate,
  findById: itemFindById,
  updateOne: itemUpdateOne,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => itemModel }));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/models/Receipt', () => ({ Receipt: {} }));
vi.mock('@/models/Statement', () => ({ Statement: {} }));
vi.mock('@/models/Task', () => ({ Task: {} }));
vi.mock('@/lib/scrape', () => ({ fetchPageText: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/search', () => ({ searchWeb: vi.fn(), searchImages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/app/expenses/actions', () => ({ addExpense: addExpenseMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { updateItem, logSaleAsIncome } from './actions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingsMock.mockResolvedValue({ currency: 'EUR' });
  addExpenseMock.mockResolvedValue({ ok: true, id: 'inc1' });
});

describe('updateItem — sale fields (P55)', () => {
  it('persists sale price, date and buyer on a sold item', async () => {
    await updateItem(
      'i1',
      formData({
        title: 'Old GPU',
        status: 'sold',
        purchasedPrice: '700',
        soldPrice: '200',
        soldAt: '2026-08-20',
        soldTo: 'Skroutz marketplace',
      })
    );
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.soldPrice).toBe(200);
    expect(update.soldTo).toBe('Skroutz marketplace');
    expect(update.soldAt).toBeInstanceOf(Date);
    expect((update.soldAt as Date).toISOString().slice(0, 10)).toBe('2026-08-20');
  });

  it('writes the empty shape when the sale fields are left blank (pre-P55 behaviour)', async () => {
    await updateItem('i1', formData({ title: 'Old GPU', status: 'sold' }));
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.soldPrice).toBeNull();
    expect(update.soldAt).toBeNull();
    expect(update.soldTo).toBe('');
  });

  it('never FX-converts the sale price, even when the item itself is foreign', async () => {
    // Bought for 700 USD at 0.9 -> 630 EUR stored. The sale happened later and locally,
    // so its 200 must stay 200 and NOT become 180.
    await updateItem(
      'i1',
      formData({
        title: 'Old GPU',
        status: 'sold',
        purchasedPrice: '700',
        currency: 'USD',
        fxRate: '0.9',
        soldPrice: '200',
      })
    );
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.purchasedPrice).toBe(630);
    expect(update.soldPrice).toBe(200);
  });
});

describe('logSaleAsIncome (P55)', () => {
  it('books the sale as income and stamps the expense id back on the item', async () => {
    itemFindById.mockReturnValue({
      lean: async () => ({
        _id: 'i1',
        title: 'Old GPU',
        soldPrice: 200,
        soldAt: new Date('2026-08-20T00:00:00.000Z'),
        soldTo: 'Skroutz marketplace',
        soldIncomeId: null,
      }),
    });

    const res = await logSaleAsIncome('i1');

    expect(res.ok).toBe(true);
    expect(res.expenseId).toBe('inc1');
    const [data] = addExpenseMock.mock.calls[0];
    expect(data.kind).toBe('income');
    expect(data.amount).toBe(200);
    expect(data.vendor).toBe('Skroutz marketplace');
    expect(data.date.slice(0, 10)).toBe('2026-08-20');
    // No currency/fxRate is handed over: the sale price is base currency already, and
    // passing the item's receipt rate here would convert it a second time.
    expect(data.currency).toBeUndefined();
    expect(data.fxRate).toBeUndefined();
    expect(itemUpdateOne).toHaveBeenCalledWith({ _id: 'i1' }, { $set: { soldIncomeId: 'inc1' } });
  });

  it('falls back to the item title when no buyer was recorded', async () => {
    itemFindById.mockReturnValue({
      lean: async () => ({ _id: 'i1', title: 'Old GPU', soldPrice: 200, soldAt: null, soldTo: '  ', soldIncomeId: null }),
    });
    await logSaleAsIncome('i1');
    expect(addExpenseMock.mock.calls[0][0].vendor).toBe('Old GPU');
  });

  it('refuses a sale that was already logged, without creating a second income', async () => {
    itemFindById.mockReturnValue({
      lean: async () => ({ _id: 'i1', title: 'Old GPU', soldPrice: 200, soldIncomeId: 'inc1' }),
    });
    const res = await logSaleAsIncome('i1');
    expect(res.ok).toBe(false);
    expect(addExpenseMock).not.toHaveBeenCalled();
    expect(itemUpdateOne).not.toHaveBeenCalled();
  });

  it('refuses when no sale price was recorded', async () => {
    itemFindById.mockReturnValue({
      lean: async () => ({ _id: 'i1', title: 'Old GPU', soldPrice: null, soldIncomeId: null }),
    });
    const res = await logSaleAsIncome('i1');
    expect(res.ok).toBe(false);
    expect(addExpenseMock).not.toHaveBeenCalled();
  });

  it('does not stamp the item when the income could not be created', async () => {
    itemFindById.mockReturnValue({
      lean: async () => ({ _id: 'i1', title: 'Old GPU', soldPrice: 200, soldIncomeId: null }),
    });
    addExpenseMock.mockResolvedValue({ ok: false, error: 'Invalid data' } as any);
    const res = await logSaleAsIncome('i1');
    expect(res.ok).toBe(false);
    expect(itemUpdateOne).not.toHaveBeenCalled();
  });
});
