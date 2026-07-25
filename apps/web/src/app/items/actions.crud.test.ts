import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/items/actions.ts is a large multi-concern module (1590 lines: manual CRUD, photo/
// document uploads, AI enrichment [fill/specs/info], URL import + preview-approve, price
// tracking [log/target/refresh/candidates], duplicate detection/merge). This file covers
// ONLY the plain manual-entry CRUD slice — createItem/updateItem/deleteItem — the most
// isolated concern, same split used for statements/expenses/receipts/subscriptions.
//
// Like the other tenancy-wrapped modules, every export runs inside
// `withRequestTenant(...)` and reads its model via `currentModel(ItemModel)` instead of
// touching the Mongoose model directly. Both are mocked here as trivial pass-throughs —
// this file does NOT re-test tenant isolation itself (already covered by
// lib/tenancy/*.tenant.test.ts). `lib/fx.ts` (resolveItemPrices) is NOT mocked — it is a
// pure function, and the multi-currency wiring (which field money flows through which
// resolver call) is exactly what's worth pinning here; its own conversion arithmetic is
// unit-tested in lib/fx.test.ts.
//
// Behaviour pinned:
//  - createItem/updateItem: Zod `ItemFormSchema.parse(raw)` runs BEFORE `withRequestTenant`,
//    so a missing/blank title throws synchronously, never touching the DB. `links` is a
//    JSON-encoded string parsed by the internal `parseLinks` (malformed JSON -> `[]`,
//    entries without a url dropped, non-positive/non-finite price -> null). `tags` is a
//    comma-separated string split+trimmed+filtered by the internal `parseTags`.
//  - The headline `currentPrice` written to the DB is the CHEAPEST store-link price when
//    any link carries one (raw, as printed — link prices are explicitly NOT FX-converted,
//    per the code comment), falling back to the FX-resolved manual `currentPrice` only
//    when there are no priced links.
//  - `resolveItemFx` anchors the FX conversion on `purchasedPrice` when present and > 0,
//    otherwise on `currentPrice` — so `origAmount` (the remembered printed figure) reflects
//    whichever one was the anchor, not always the headline price.
//  - deleteItem: SOFT delete only (`$set deletedAt` via updateOne), never an actual
//    `deleteOne` — files and receipt/statement links stay intact for the Trash restore
//    flow. Revalidates /items, /shopping, /receipts, AND /statements (all four surfaces
//    that can reference an item).

const {
  connectDBMock,
  itemCreate,
  itemFindByIdAndUpdate,
  itemUpdateOne,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'item1' })),
  itemFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  itemUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  getAppSettingsMock: vi.fn(async () => ({ currency: 'EUR' })),
  revalidatePathMock: vi.fn(),
}));

const itemModel = {
  create: itemCreate,
  findByIdAndUpdate: itemFindByIdAndUpdate,
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
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { createItem, updateItem, deleteItem } from './actions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingsMock.mockResolvedValue({ currency: 'EUR' });
});

describe('createItem', () => {
  it('rejects a missing title before touching the DB', async () => {
    await expect(createItem(formData({ currentPrice: '10' }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it('rejects a blank title before touching the DB', async () => {
    await expect(createItem(formData({ title: '' }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('applies schema defaults, parses tags/links, and creates with the plain manual price', async () => {
    await createItem(formData({ title: 'Widget', currentPrice: '150', tags: 'a, b ,,c' }));
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(itemCreate).toHaveBeenCalledTimes(1);
    const [doc] = itemCreate.mock.calls[0];
    expect(doc.title).toBe('Widget');
    expect(doc.category).toBe('other');
    expect(doc.status).toBe('researching');
    expect(doc.currentPrice).toBe(150);
    expect(doc.purchasedPrice).toBeNull();
    expect(doc.targetPrice).toBeNull();
    expect(doc.currency).toBe('EUR');
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
    expect(doc.tags).toEqual(['a', 'b', 'c']);
    expect(doc.links).toEqual([]);
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
  });

  it('falls back links to [] on malformed JSON, dropping urlless entries and non-positive prices', async () => {
    await createItem(
      formData({ title: 'Widget', links: 'not json' })
    );
    expect(itemCreate.mock.calls[0][0].links).toEqual([]);

    await createItem(
      formData({
        title: 'Widget2',
        links: JSON.stringify([{ label: 'no url' }, { label: 'Skroutz', url: 'https://skroutz.gr/x', price: '-5' }]),
      })
    );
    const links = itemCreate.mock.calls[1][0].links;
    expect(links).toEqual([{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: null }]);
  });

  it('derives the headline currentPrice from the cheapest store-link price, unconverted', async () => {
    await createItem(
      formData({
        title: 'Widget',
        currentPrice: '150',
        currency: 'USD',
        fxRate: '0.9',
        links: JSON.stringify([
          { label: 'Skroutz', url: 'https://skroutz.gr/x', price: '99.5' },
          { label: 'Amazon', url: 'https://amazon.de/x', price: '120' },
        ]),
      })
    );
    const doc = itemCreate.mock.calls[0][0];
    // The FX-resolved manual price (150 x 0.9 = 135) is NOT what lands here — the
    // cheapest link price (99.5, exactly as printed on the shop page) wins instead.
    expect(doc.currentPrice).toBe(99.5);
  });

  it('falls back to the FX-resolved manual price when no link carries a price', async () => {
    await createItem(
      formData({
        title: 'Widget',
        currentPrice: '150',
        currency: 'USD',
        fxRate: '0.9',
        links: JSON.stringify([{ label: 'Amazon', url: 'https://amazon.de/x' }]),
      })
    );
    const doc = itemCreate.mock.calls[0][0];
    expect(doc.currentPrice).toBe(135); // 150 x 0.9, converted since no link had a price
    expect(doc.links).toEqual([{ label: 'Amazon', url: 'https://amazon.de/x', price: null }]);
  });

  it('converts all three money fields with one rate, anchoring on purchasedPrice when present', async () => {
    await createItem(
      formData({
        title: 'Widget',
        currentPrice: '150',
        purchasedPrice: '130',
        targetPrice: '100',
        currency: 'USD',
        fxRate: '0.9',
      })
    );
    const doc = itemCreate.mock.calls[0][0];
    expect(doc.currentPrice).toBe(135); // 150 x 0.9
    expect(doc.purchasedPrice).toBe(117); // 130 x 0.9
    expect(doc.targetPrice).toBe(90); // 100 x 0.9
    expect(doc.currency).toBe('USD');
    expect(doc.fxRate).toBe(0.9);
    expect(doc.origAmount).toBe(130); // the anchor (purchasedPrice), not currentPrice
  });

  it('anchors on currentPrice when purchasedPrice is absent', async () => {
    await createItem(formData({ title: 'Widget', currentPrice: '150', currency: 'USD', fxRate: '0.9' }));
    const doc = itemCreate.mock.calls[0][0];
    expect(doc.origAmount).toBe(150);
    expect(doc.currentPrice).toBe(135);
  });

  it('does not convert (fxRate 0) when the currency is blank, whatever the base is', async () => {
    getAppSettingsMock.mockResolvedValue({ currency: 'USD' });
    await createItem(formData({ title: 'Widget', currentPrice: '150' }));
    const doc = itemCreate.mock.calls[0][0];
    expect(doc.currentPrice).toBe(150);
    expect(doc.currency).toBe('USD');
    expect(doc.fxRate).toBe(0);
    expect(doc.origAmount).toBe(0);
  });
});

describe('updateItem', () => {
  it('rejects a blank title before touching the DB', async () => {
    await expect(updateItem('i1', formData({ title: '' }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(itemFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('updates the given id with the resolved fields and revalidates /items', async () => {
    await updateItem('i1', formData({ title: 'Widget', currentPrice: '150', currency: 'USD', fxRate: '0.9' }));
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(itemFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, doc] = itemFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('i1');
    expect(doc.title).toBe('Widget');
    expect(doc.currentPrice).toBe(135);
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
  });

  it('also prefers the cheapest link price over the resolved manual price', async () => {
    await updateItem(
      'i1',
      formData({
        title: 'Widget',
        currentPrice: '150',
        links: JSON.stringify([{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: '80' }]),
      })
    );
    const [, doc] = itemFindByIdAndUpdate.mock.calls[0];
    expect(doc.currentPrice).toBe(80);
  });
});

describe('deleteItem', () => {
  it('soft-deletes via $set deletedAt, never a hard delete', async () => {
    await deleteItem('i1');
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(itemUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = itemUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'i1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
  });

  it('revalidates /items, /shopping, /receipts, and /statements', async () => {
    await deleteItem('i1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
  });
});
