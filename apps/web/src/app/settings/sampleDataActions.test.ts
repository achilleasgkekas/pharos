import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/sampleDataActions.ts (103 lines) is a small, standalone concern (NOT part
// of the giant app/settings/actions.ts) — the "Load/clear sample data" demo mode (P1).
// Three exports: getSampleDataStatus (read), loadSampleData (wipe+reseed all four
// isSample:true collections), clearSampleData (wipe only). Tenant-scoped the same way as
// items/receipts/expenses actions: every export's DB work runs inside
// `withRequestTenant(...)` and reads its model via `currentModel(XModel)` instead of the
// Mongoose model directly — both mocked here as trivial pass-throughs (tenant isolation
// itself already has its own coverage in lib/tenancy/*.tenant.test.ts).
//
// Behaviour pinned:
//  - getSampleDataStatus: NO write gate (read-only) — requireAdmin is never called.
//    Counts all four collections filtered strictly by {isSample:true}; `loaded` is just
//    "does any collection have at least one sample row".
//  - loadSampleData: requireAdmin() runs OUTSIDE/BEFORE withRequestTenant (a gate
//    rejection never even opens a tenant context) — same ordering as
//    settings/users.actions.ts. Inside the tenant: connectDB -> currentModel for all four
//    -> getLocale() -> buildSampleData(now, locale) -> a `Promise.all` of the four
//    deleteMany({isSample:true}) calls THEN (strictly after, not interleaved) a second
//    `Promise.all` of the four insertMany(data.X) calls -> revalidateAffected() -> returns
//    fresh counts (a second countDocuments pass, not the pre-insert numbers). Idempotent:
//    old sample rows are always fully replaced, real (isSample:false/absent) rows are
//    never touched because every query is scoped by isSample:true.
//  - clearSampleData: requireAdmin() first (same ordering), deleteMany({isSample:true}) on
//    all four, revalidateAffected(), returns bare {ok:true} (no counts, unlike load).
//  - revalidateAffected (both mutating actions) touches 9 paths: '/', '/items',
//    '/shopping', '/receipts', '/expenses', '/income', '/subscriptions', '/reports',
//    '/settings'.

const {
  ITEM_SENTINEL,
  RECEIPT_SENTINEL,
  EXPENSE_SENTINEL,
  SUBSCRIPTION_SENTINEL,
  connectDBMock,
  currentModelMock,
  itemModel,
  receiptModel,
  expenseModel,
  subscriptionModel,
  requireAdminMock,
  withRequestTenantMock,
  getLocaleMock,
  buildSampleDataMock,
  revalidatePathMock,
  callOrder,
} = vi.hoisted(() => {
  const ITEM_SENTINEL = { __model: 'Item' };
  const RECEIPT_SENTINEL = { __model: 'Receipt' };
  const EXPENSE_SENTINEL = { __model: 'Expense' };
  const SUBSCRIPTION_SENTINEL = { __model: 'Subscription' };
  const callOrder: string[] = [];
  const mkModel = (name: string, countDocuments = 0) => ({
    countDocuments: vi.fn(async (_filter: Record<string, unknown>) => countDocuments),
    deleteMany: vi.fn(async (_filter: Record<string, unknown>) => {
      callOrder.push(`delete:${name}`);
      return { deletedCount: 0 };
    }),
    insertMany: vi.fn(async (_docs: unknown[]) => {
      callOrder.push(`insert:${name}`);
      return [];
    }),
  });
  return {
    ITEM_SENTINEL,
    RECEIPT_SENTINEL,
    EXPENSE_SENTINEL,
    SUBSCRIPTION_SENTINEL,
    callOrder,
    connectDBMock: vi.fn(async () => {}),
    itemModel: mkModel('item'),
    receiptModel: mkModel('receipt'),
    expenseModel: mkModel('expense'),
    subscriptionModel: mkModel('subscription'),
    currentModelMock: vi.fn(async (_m: unknown) => ({}) as Record<string, unknown>),
    requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Achilleas' })),
    withRequestTenantMock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    getLocaleMock: vi.fn(async (): Promise<string> => 'en'),
    buildSampleDataMock: vi.fn((_now: Date, _locale: string) => ({
      items: [{ title: 'Sample item' }],
      receipts: [{ store: 'Sample store' }],
      expenses: [{ vendor: 'Sample vendor' }],
      subscriptions: [{ name: 'Sample sub' }],
    })),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Item', () => ({ Item: ITEM_SENTINEL }));
vi.mock('@/models/Receipt', () => ({ Receipt: RECEIPT_SENTINEL }));
vi.mock('@/models/Expense', () => ({ Expense: EXPENSE_SENTINEL }));
vi.mock('@/models/Subscription', () => ({ Subscription: SUBSCRIPTION_SENTINEL }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: withRequestTenantMock }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: currentModelMock }));
vi.mock('@/lib/auth', () => ({ requireAdmin: requireAdminMock }));
vi.mock('@/lib/i18n/server', () => ({ getLocale: getLocaleMock }));
vi.mock('@/lib/sampleData', () => ({ buildSampleData: buildSampleDataMock }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import { getSampleDataStatus, loadSampleData, clearSampleData } from './sampleDataActions';

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  connectDBMock.mockImplementation(async () => {});
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Achilleas' }));
  withRequestTenantMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  getLocaleMock.mockImplementation(async (): Promise<string> => 'en');
  buildSampleDataMock.mockImplementation(() => ({
    items: [{ title: 'Sample item' }],
    receipts: [{ store: 'Sample store' }],
    expenses: [{ vendor: 'Sample vendor' }],
    subscriptions: [{ name: 'Sample sub' }],
  }));
  currentModelMock.mockImplementation(async (m: unknown) => {
    if (m === ITEM_SENTINEL) return itemModel;
    if (m === RECEIPT_SENTINEL) return receiptModel;
    if (m === EXPENSE_SENTINEL) return expenseModel;
    if (m === SUBSCRIPTION_SENTINEL) return subscriptionModel;
    throw new Error('unexpected model passed to currentModel');
  });
  for (const m of [itemModel, receiptModel, expenseModel, subscriptionModel]) {
    m.countDocuments.mockImplementation(async () => 0);
    m.deleteMany.mockImplementation(async () => {
      callOrder.push(`delete:${m === itemModel ? 'item' : m === receiptModel ? 'receipt' : m === expenseModel ? 'expense' : 'subscription'}`);
      return { deletedCount: 0 };
    });
    m.insertMany.mockImplementation(async () => {
      callOrder.push(`insert:${m === itemModel ? 'item' : m === receiptModel ? 'receipt' : m === expenseModel ? 'expense' : 'subscription'}`);
      return [];
    });
  }
});

const ALL_REVALIDATED_PATHS = ['/', '/items', '/shopping', '/receipts', '/expenses', '/income', '/subscriptions', '/reports', '/settings'];

describe('getSampleDataStatus', () => {
  it('has no write gate (read-only)', async () => {
    await getSampleDataStatus();
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('runs inside withRequestTenant', async () => {
    await getSampleDataStatus();
    expect(withRequestTenantMock).toHaveBeenCalled();
  });

  it('reports loaded:false when every collection is empty', async () => {
    const r = await getSampleDataStatus();
    expect(r).toEqual({ loaded: false, counts: { items: 0, receipts: 0, expenses: 0, subscriptions: 0 } });
  });

  it('reports loaded:true when at least one collection has sample rows', async () => {
    itemModel.countDocuments.mockResolvedValue(3);
    const r = await getSampleDataStatus();
    expect(r).toEqual({ loaded: true, counts: { items: 3, receipts: 0, expenses: 0, subscriptions: 0 } });
  });

  it('sums arbitrary counts across all four collections into loaded', async () => {
    itemModel.countDocuments.mockResolvedValue(1);
    receiptModel.countDocuments.mockResolvedValue(2);
    expenseModel.countDocuments.mockResolvedValue(0);
    subscriptionModel.countDocuments.mockResolvedValue(4);
    const r = await getSampleDataStatus();
    expect(r).toEqual({ loaded: true, counts: { items: 1, receipts: 2, expenses: 0, subscriptions: 4 } });
  });

  it('filters strictly by isSample:true on every collection', async () => {
    await getSampleDataStatus();
    for (const m of [itemModel, receiptModel, expenseModel, subscriptionModel]) {
      expect(m.countDocuments).toHaveBeenCalledWith({ isSample: true });
    }
  });
});

describe('loadSampleData', () => {
  it('requires admin BEFORE opening a tenant context', async () => {
    requireAdminMock.mockRejectedValue(new Error('Forbidden: admin access required'));
    await expect(loadSampleData()).rejects.toThrow('Forbidden');
    expect(withRequestTenantMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('deletes every sample row on all four collections before inserting any', async () => {
    await loadSampleData();
    const deleteIdx = callOrder.map((c, i) => (c.startsWith('delete:') ? i : -1)).filter((i) => i >= 0);
    const insertIdx = callOrder.map((c, i) => (c.startsWith('insert:') ? i : -1)).filter((i) => i >= 0);
    expect(deleteIdx.length).toBe(4);
    expect(insertIdx.length).toBe(4);
    expect(Math.max(...deleteIdx)).toBeLessThan(Math.min(...insertIdx));
  });

  it('deletes and inserts scoped by isSample:true / the built sample docs', async () => {
    await loadSampleData();
    for (const m of [itemModel, receiptModel, expenseModel, subscriptionModel]) {
      expect(m.deleteMany).toHaveBeenCalledWith({ isSample: true });
    }
    expect(itemModel.insertMany).toHaveBeenCalledWith([{ title: 'Sample item' }]);
    expect(receiptModel.insertMany).toHaveBeenCalledWith([{ store: 'Sample store' }]);
    expect(expenseModel.insertMany).toHaveBeenCalledWith([{ vendor: 'Sample vendor' }]);
    expect(subscriptionModel.insertMany).toHaveBeenCalledWith([{ name: 'Sample sub' }]);
  });

  it('builds the sample set from the current locale, not a hardcoded one', async () => {
    getLocaleMock.mockResolvedValue('el');
    await loadSampleData();
    expect(buildSampleDataMock).toHaveBeenCalledWith(expect.any(Date), 'el');
  });

  it('revalidates all nine affected paths', async () => {
    await loadSampleData();
    for (const p of ALL_REVALIDATED_PATHS) expect(revalidatePathMock).toHaveBeenCalledWith(p);
    expect(revalidatePathMock).toHaveBeenCalledTimes(ALL_REVALIDATED_PATHS.length);
  });

  it('returns ok:true with FRESH counts (post-insert, not pre-insert zeros)', async () => {
    itemModel.countDocuments.mockResolvedValue(1);
    receiptModel.countDocuments.mockResolvedValue(1);
    expenseModel.countDocuments.mockResolvedValue(1);
    subscriptionModel.countDocuments.mockResolvedValue(1);
    const r = await loadSampleData();
    expect(r).toEqual({ ok: true, counts: { items: 1, receipts: 1, expenses: 1, subscriptions: 1 } });
  });
});

describe('clearSampleData', () => {
  it('requires admin BEFORE opening a tenant context', async () => {
    requireAdminMock.mockRejectedValue(new Error('Forbidden: admin access required'));
    await expect(clearSampleData()).rejects.toThrow('Forbidden');
    expect(withRequestTenantMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('deletes every sample row on all four collections and never inserts', async () => {
    await clearSampleData();
    for (const m of [itemModel, receiptModel, expenseModel, subscriptionModel]) {
      expect(m.deleteMany).toHaveBeenCalledWith({ isSample: true });
      expect(m.insertMany).not.toHaveBeenCalled();
    }
  });

  it('revalidates all nine affected paths', async () => {
    await clearSampleData();
    for (const p of ALL_REVALIDATED_PATHS) expect(revalidatePathMock).toHaveBeenCalledWith(p);
    expect(revalidatePathMock).toHaveBeenCalledTimes(ALL_REVALIDATED_PATHS.length);
  });

  it('returns a bare {ok:true} with no counts field', async () => {
    const r = await clearSampleData();
    expect(r).toEqual({ ok: true });
  });
});
