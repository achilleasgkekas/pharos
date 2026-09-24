import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  connectDBMock,
  itemFindById,
  itemUpdateOne,
  addExpenseMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFindById: vi.fn(),
  itemUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  addExpenseMock: vi.fn(async () => ({ ok: true, id: 'inc1' })),
}));

const itemModel = {
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
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('@/app/expenses/actions', () => ({ addExpense: addExpenseMock }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { markMaintenanceDone, markItemReturned, markItemArrived, logSaleAsIncome } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
});

function createQueryMock(doc: any) {
  return {
    select: vi.fn().mockReturnValue({
      lean: async () => doc,
    }),
    lean: async () => doc,
  };
}

describe('markItemArrived', () => {
  it('returns updated item', async () => {
    itemUpdateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const updatedDoc = { _id: 'i0', status: 'received', title: 'Ordered Item' };
    itemFindById.mockImplementation((id: string) => createQueryMock(updatedDoc));

    const res = await markItemArrived('i0');
    expect(res.ok).toBe(true);
    expect((res as any).item).toEqual(JSON.parse(JSON.stringify(updatedDoc)));
  });
});

describe('markMaintenanceDone', () => {
  it('updates lastMaintenanceAt and returns the updated item', async () => {
    const existingDoc = { _id: 'i1', status: 'installed', maintenanceIntervalDays: 30 };
    const updatedDoc = {
      _id: 'i1',
      title: 'Coffee Machine',
      status: 'installed',
      maintenanceIntervalDays: 30,
      lastMaintenanceAt: new Date().toISOString(),
    };

    itemFindById.mockImplementation((id: string) => createQueryMock(updatedDoc));
    itemFindById.mockReturnValueOnce(createQueryMock(existingDoc));

    itemUpdateOne.mockResolvedValueOnce({ matchedCount: 1 });

    const res = await markMaintenanceDone('i1');
    expect(res.ok).toBe(true);
    expect((res as any).item).toEqual(JSON.parse(JSON.stringify(updatedDoc)));
  });
});

describe('markItemReturned', () => {
  it('clears lending info and returns the updated item', async () => {
    const existingDoc = { _id: 'i2', status: 'installed', lentTo: 'John' };
    const updatedDoc = {
      _id: 'i2',
      title: 'Drill',
      status: 'installed',
      lentTo: '',
      lentAt: null,
      expectedReturnAt: null,
    };

    itemFindById.mockImplementation((id: string) => createQueryMock(updatedDoc));
    itemFindById.mockReturnValueOnce(createQueryMock(existingDoc));

    itemUpdateOne.mockResolvedValueOnce({ matchedCount: 1 });

    const res = await markItemReturned('i2');
    expect(res.ok).toBe(true);
    expect((res as any).item).toEqual(JSON.parse(JSON.stringify(updatedDoc)));
  });
});

describe('logSaleAsIncome', () => {
  it('logs income and returns the updated item', async () => {
    const existingDoc = {
      _id: 'i3',
      title: 'Old Phone',
      soldPrice: 100,
      soldAt: new Date('2026-01-01'),
      soldTo: 'Alice',
      soldIncomeId: null,
    };
    const updatedDoc = {
      ...existingDoc,
      soldIncomeId: 'inc1',
    };

    itemFindById.mockImplementation((id: string) => createQueryMock(updatedDoc));
    itemFindById.mockReturnValueOnce(createQueryMock(existingDoc));

    itemUpdateOne.mockResolvedValueOnce({ matchedCount: 1 });

    const res = await logSaleAsIncome('i3');
    expect(res.ok).toBe(true);
    expect((res as any).item).toEqual(JSON.parse(JSON.stringify(updatedDoc)));
  });
});
