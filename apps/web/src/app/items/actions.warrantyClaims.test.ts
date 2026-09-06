import { describe, it, expect, vi, beforeEach } from 'vitest';

// P44 — warranty claims / RMAs on an item. Companion to actions.crud.test.ts (which owns
// the generic create/update surface); this file pins ONLY the claims slice, i.e. that the
// action really hands the normalised array to the model and that an item whose form never
// mentions a claim is written exactly as it was before P44.
//
// The normalisation RULES themselves (the required report date, the ref dedupe, the caps)
// live in lib/warrantyClaims.test.ts — they are pure and do not need the action harness.

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

import { createItem, updateItem } from './actions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingsMock.mockResolvedValue({ currency: 'EUR' });
});

describe('warranty claims (P44)', () => {
  it('persists the claim rows typed on the form', async () => {
    await updateItem(
      'i1',
      formData({
        title: 'RTX 5080',
        warrantyClaims: JSON.stringify([
          { ref: 'RMA-4412', status: 'in-repair', reportedAt: '2026-09-01', lastUpdateAt: '2026-09-04', trackingNumber: 'EL123', notes: 'coil whine' },
        ]),
      })
    );
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.warrantyClaims).toEqual([
      {
        ref: 'RMA-4412',
        status: 'in-repair',
        reportedAt: '2026-09-01',
        lastUpdateAt: '2026-09-04',
        trackingNumber: 'EL123',
        notes: 'coil whine',
      },
    ]);
  });

  it('writes an empty array when the form sends none (pre-P44 behaviour)', async () => {
    await updateItem('i1', formData({ title: 'RTX 5080' }));
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.warrantyClaims).toEqual([]);
  });

  it('applies the same rules on create, dropping a row with no report date', async () => {
    await createItem(
      formData({
        title: 'RTX 5080',
        warrantyClaims: JSON.stringify([
          { ref: ' RMA-7 ', reportedAt: '2026-09-02' },
          { ref: 'RMA-8', reportedAt: '' },
        ]),
      })
    );
    const [doc] = itemCreate.mock.calls[0];
    expect(doc.warrantyClaims).toHaveLength(1);
    expect(doc.warrantyClaims[0].ref).toBe('RMA-7');
  });

  it('stores an unknown status as the state a claim starts in', async () => {
    await updateItem(
      'i1',
      formData({ title: 'RTX 5080', warrantyClaims: JSON.stringify([{ reportedAt: '2026-09-02', status: 'lost-in-post' }]) })
    );
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.warrantyClaims[0].status).toBe('submitted');
  });

  it('never lets malformed JSON fail the whole save', async () => {
    await updateItem('i1', formData({ title: 'RTX 5080', warrantyClaims: '{broken' }));
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.warrantyClaims).toEqual([]);
    expect(update.title).toBe('RTX 5080');
  });
});
