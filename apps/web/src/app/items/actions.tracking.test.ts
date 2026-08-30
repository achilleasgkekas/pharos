import { describe, it, expect, vi, beforeEach } from 'vitest';

// P72 — shipment / delivery tracking. Companion to actions.crud.test.ts, which owns the
// generic createItem/updateItem/deleteItem surface; this file pins ONLY the parcel slice.
//
// Behaviour pinned:
//  - updateItem persists the three optional tracking fields, and leaving them blank writes
//    '' so an `ordered` item keeps behaving exactly as it did pre-P72.
//  - markItemArrived flips ordered -> received, and is CONDITIONAL on the item still being
//    ordered: the filter carries the status, so a stale tab cannot rewrite an item somebody
//    already moved on to `sold` or `installed`.
//  - The tracking fields survive the flip: they are the record of how the parcel got here.

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

import { updateItem, markItemArrived } from './actions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingsMock.mockResolvedValue({ currency: 'EUR' });
  itemUpdateOne.mockResolvedValue({ matchedCount: 1 });
});

describe('updateItem — tracking fields (P72)', () => {
  it('persists tracking number, carrier and the manual link override', async () => {
    await updateItem(
      'i1',
      formData({
        title: 'Mini PC',
        status: 'ordered',
        trackingNumber: 'AC123456789',
        carrier: 'ACS',
        trackingUrl: 'https://example.com/mine',
      })
    );
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.trackingNumber).toBe('AC123456789');
    expect(update.carrier).toBe('ACS');
    expect(update.trackingUrl).toBe('https://example.com/mine');
  });

  it('writes the empty shape when tracking is left blank (pre-P72 behaviour)', async () => {
    await updateItem('i1', formData({ title: 'Mini PC', status: 'ordered' }));
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.trackingNumber).toBe('');
    expect(update.carrier).toBe('');
    expect(update.trackingUrl).toBe('');
  });
});

describe('markItemArrived (P72)', () => {
  it('flips an ordered item to received and keeps the tracking record', async () => {
    const res = await markItemArrived('i1');
    expect(res.ok).toBe(true);
    const [filter, update] = itemUpdateOne.mock.calls[0];
    // The guard: the status is part of the FILTER, not just the update.
    expect(filter).toEqual({ _id: 'i1', status: 'ordered' });
    expect(update).toEqual({ $set: { status: 'received' } });
    // Nothing clears trackingNumber/carrier/trackingUrl.
    expect(JSON.stringify(update)).not.toContain('tracking');
  });

  it('refuses when the item is no longer ordered, instead of rewriting its status', async () => {
    itemUpdateOne.mockResolvedValue({ matchedCount: 0 });
    const res = await markItemArrived('i1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no longer/i);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('revalidates both item views, since the flip moves it between them', async () => {
    await markItemArrived('i1');
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain('/items');
    expect(paths).toContain('/shopping');
  });
});
