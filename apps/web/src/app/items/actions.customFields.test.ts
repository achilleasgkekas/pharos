import { describe, it, expect, vi, beforeEach } from 'vitest';

// P70 — user-defined key/value attributes on an item. Companion to actions.crud.test.ts
// (which owns the generic create/update surface); this file pins ONLY the custom-fields
// slice, i.e. that the action actually hands the normalised array to the model and that an
// item without any is written exactly as it was before P70.
//
// The normalisation RULES themselves (dedupe, caps, dropped keyless rows) live in
// lib/customFields.test.ts — they are pure and do not need the action harness.

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

describe('custom fields (P70)', () => {
  it('persists the attributes typed on the form', async () => {
    await updateItem(
      'i1',
      formData({
        title: 'Switch',
        customFields: JSON.stringify([
          { key: 'MAC', value: '3C:22:FB:01' },
          { key: 'Rack unit', value: 'U14' },
        ]),
      })
    );
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.customFields).toEqual([
      { key: 'MAC', value: '3C:22:FB:01' },
      { key: 'Rack unit', value: 'U14' },
    ]);
  });

  it('writes an empty array when the form sends none (pre-P70 behaviour)', async () => {
    await updateItem('i1', formData({ title: 'Switch' }));
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.customFields).toEqual([]);
  });

  it('applies the same rules on create', async () => {
    await createItem(
      formData({
        title: 'Switch',
        customFields: JSON.stringify([
          { key: '  Firmware  ', value: ' 1.4.2 ' },
          { key: '', value: 'keyless row is dropped' },
        ]),
      })
    );
    const [doc] = itemCreate.mock.calls[0];
    expect(doc.customFields).toEqual([{ key: 'Firmware', value: '1.4.2' }]);
  });

  it('never lets malformed JSON fail the whole save', async () => {
    await updateItem('i1', formData({ title: 'Switch', customFields: '{broken' }));
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.customFields).toEqual([]);
    expect(update.title).toBe('Switch');
  });
});
