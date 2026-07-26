import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/items/actions.ts is a large multi-concern module (see actions.crud.test.ts's header
// for the full concern list). This file covers the DUPLICATE detection + merge concern
// (findDuplicateItems/mergeItems) — the items-side counterpart to
// receipts/actions.duplicates.test.ts. mergeItems touches THREE models in the same call
// (Item itself, plus re-pointing Receipt.itemIds/lineItems.matchedItemId and
// Statement.transactions.matchedItemIds at the survivor), so `currentModel` here dispatches
// on which model token it was given, same as the receipts file.
//
// Real (unmocked) `mongoose` is used for `Types.ObjectId` — mergeItems builds
// `keepOid`/`dOid` via `new Types.ObjectId(...)`, so every id used here must be a valid
// 24-hex string, not an arbitrary label.
//
// Behaviour pinned (findDuplicateItems):
//  - Queries `Item.find({ deletedAt: null }).select(...).lean()`.
//  - Grouping key = `normTitle(title)` (lowercased, strips everything except a-z0-9 and
//    greek letters, collapsed whitespace); keys shorter than 3 chars are skipped entirely
//    (never grouped, even against an identical short title).
//  - Groups with fewer than 2 items are dropped (no lone-item "duplicates").
//  - Within a group, items sort most-complete-first: more linked receipts, then more
//    photos, then higher STATUS_RANK (installed > received > ordered > decided >
//    researching > deferred/sold/broken), then more store links (all descending).
//  - Groups sort biggest-cluster-first (item count only — no further tie-break, unlike
//    the receipts version which tie-breaks on total).
//  - Field defaults on the projected shape: missing title -> 'Untitled', missing num ->
//    '', missing status -> 'researching', missing/invalid currentPrice -> 0, missing
//    links/photos/receiptIds -> a 0 count, thumbPath -> first photo path or ''.
//
// Behaviour pinned (mergeItems):
//  - `keep` not found -> `{ok:false, merged:0, error:'Item to keep not found'}`, and the
//    drops lookup never runs.
//  - `dropIds` is filtered to drop falsy entries and the keepId itself before querying
//    `Item.find({ _id: { $in: targets } })`.
//  - No resulting drops -> `{ok:false, merged:0, error:'No items to merge'}`, keep never
//    saved.
//  - Plain scalar fields (num/specs/notes/purchasedFrom/serialNumber/location) backfill
//    from a drop ONLY while the keep field is still falsy.
//  - `category` backfills from a drop only while keep's is the literal 'other' AND the
//    drop's is a different non-'other' value — an already-specific category is never
//    clobbered.
//  - purchasedPrice/purchasedAt/targetPrice/warrantyUntil backfill on a loose `== null`
//    check, so a keep value of 0 counts as "already set" and blocks the backfill.
//  - tags union case-insensitively deduped, capped at 8 total.
//  - links union by normalized URL: a matching existing link only gets its `price`
//    backfilled (and only if it was null); a non-matching URL is appended as a new link.
//  - priceHistory is concatenated as fresh plain objects (not another doc's subdocs).
//  - photos/attachments/receiptIds union without duplicating existing entries.
//  - `currentPrice` is recomputed from the internal lowestKnownPrice() over the
//    (post-union) links, but only overwritten when a priced link actually exists.
//  - keep.markModified is called for all six mutated array fields (tags/links/
//    priceHistory/photos/attachments/receiptIds), then keep.save() exactly once.
//  - Per dropped item: Receipt.updateMany x3 (itemIds addToSet, itemIds pull,
//    lineItems.$[el].matchedItemId set via arrayFilters), Statement.updateMany x2
//    (transactions.$[t].matchedItemIds addToSet, then pull via arrayFilters), and the
//    drop itself is SOFT-deleted (Item.updateOne $set deletedAt + cleared photos/
//    attachments, never a hard delete).
//  - Revalidates /items, /shopping, /receipts, AND /statements; returns
//    `{ok:true, merged: drops.length}`.

const KEEP_ID = '507f1f77bcf86cd799439011';
const DROP1_ID = '507f1f77bcf86cd799439012';
const DROP2_ID = '507f1f77bcf86cd799439013';

const {
  connectDBMock,
  itemFind,
  itemFindLean,
  itemFindById,
  itemUpdateOne,
  receiptUpdateMany,
  statementUpdateMany,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFind: vi.fn((_q: Record<string, any>) => ({ select: (_s: string) => ({ lean: itemFindLean }) })),
  itemFindLean: vi.fn(async () => [] as Array<Record<string, any>>),
  itemFindById: vi.fn(async (_id: string) => null as Record<string, any> | null),
  itemUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  receiptUpdateMany: vi.fn(async (_q: Record<string, any>, _u: Record<string, any>, _o?: Record<string, any>) => ({})),
  statementUpdateMany: vi.fn(async (_q: Record<string, any>, _u: Record<string, any>, _o?: Record<string, any>) => ({})),
  revalidatePathMock: vi.fn(),
}));

const itemModel = { find: itemFind, findById: itemFindById, updateOne: itemUpdateOne };
const receiptModel = { updateMany: receiptUpdateMany };
const statementModel = { updateMany: statementUpdateMany };

vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Statement', () => ({ Statement: 'STATEMENT_MODEL_TOKEN' }));
vi.mock('@/models/Task', () => ({ Task: 'TASK_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (token: unknown) =>
    token === 'RECEIPT_MODEL_TOKEN' ? receiptModel : token === 'STATEMENT_MODEL_TOKEN' ? statementModel : itemModel,
}));
vi.mock('@/lib/scrape', () => ({ fetchPageText: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/search', () => ({ searchWeb: vi.fn(), searchImages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { findDuplicateItems, mergeItems } from './actions';

function rawItem(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: '507f1f77bcf86cd799439001',
    title: 'RTX 5080',
    num: '01',
    status: 'received',
    currentPrice: 999,
    links: [],
    photos: [],
    receiptIds: [],
    ...overrides,
  };
}

function makeItemDoc(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: KEEP_ID,
    num: '',
    category: 'other',
    specs: '',
    notes: '',
    purchasedFrom: '',
    purchasedPrice: null as number | null,
    purchasedAt: null as string | null,
    targetPrice: null as number | null,
    warrantyUntil: null as string | null,
    serialNumber: '',
    location: '',
    tags: [] as string[],
    links: [] as { label: string; url: string; price: number | null }[],
    priceHistory: [] as any[],
    photos: [] as string[],
    attachments: [] as any[],
    receiptIds: [] as string[],
    currentPrice: 0,
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  itemFindLean.mockResolvedValue([]);
});

describe('findDuplicateItems', () => {
  it('queries only non-deleted items with the projected fields, via select().lean()', async () => {
    itemFindLean.mockResolvedValue([]);

    await findDuplicateItems();

    expect(connectDBMock).toHaveBeenCalled();
    expect(itemFind).toHaveBeenCalledWith({ deletedAt: null });
  });

  it('skips titles that normalize to fewer than 3 characters, even when repeated', async () => {
    itemFindLean.mockResolvedValue([rawItem({ _id: 'a', title: 'A1' }), rawItem({ _id: 'b', title: 'A1' })]);

    const groups = await findDuplicateItems();

    expect(groups).toEqual([]);
  });

  it('drops groups with only a single item (no duplicate)', async () => {
    itemFindLean.mockResolvedValue([rawItem({ _id: 'a' })]);

    const groups = await findDuplicateItems();

    expect(groups).toEqual([]);
  });

  it('groups two items with the same normalized title, ignoring case and punctuation', async () => {
    itemFindLean.mockResolvedValue([
      rawItem({ _id: 'a', title: 'RTX 5080' }),
      rawItem({ _id: 'b', title: 'rtx-5080!!' }),
    ]);

    const groups = await findDuplicateItems();

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i._id).sort()).toEqual(['a', 'b']);
  });

  it('keeps items in separate groups when the normalized title differs', async () => {
    itemFindLean.mockResolvedValue([
      rawItem({ _id: 'a', title: 'RTX 5080' }),
      rawItem({ _id: 'b', title: 'RTX 5090' }),
    ]);

    const groups = await findDuplicateItems();

    expect(groups).toEqual([]);
  });

  it('sorts items within a group by linked-receipt count first (descending)', async () => {
    itemFindLean.mockResolvedValue([
      rawItem({ _id: 'few', receiptIds: [] }),
      rawItem({ _id: 'many', receiptIds: ['r1', 'r2'] }),
    ]);

    const groups = await findDuplicateItems();

    expect(groups[0].items.map((i) => i._id)).toEqual(['many', 'few']);
  });

  it('falls back to photo count, then STATUS_RANK, then link count when receipt counts tie', async () => {
    itemFindLean.mockResolvedValue([
      rawItem({ _id: 'deferred', status: 'deferred', photos: ['p.jpg'], links: [{}, {}] }),
      rawItem({ _id: 'installed', status: 'installed', photos: ['p.jpg'], links: [{}] }),
    ]);

    const groups = await findDuplicateItems();

    // Same receipts (0) and same photos (1) -> STATUS_RANK decides: installed (6) beats deferred (1).
    expect(groups[0].items.map((i) => i._id)).toEqual(['installed', 'deferred']);
  });

  it('sorts groups biggest-cluster-first (item count only, no further tie-break)', async () => {
    itemFindLean.mockResolvedValue([
      rawItem({ _id: 'p1', title: 'Pair' }),
      rawItem({ _id: 'p2', title: 'Pair' }),
      rawItem({ _id: 't1', title: 'Trio' }),
      rawItem({ _id: 't2', title: 'Trio' }),
      rawItem({ _id: 't3', title: 'Trio' }),
    ]);

    const groups = await findDuplicateItems();

    expect(groups.map((g) => g.items.length)).toEqual([3, 2]);
  });

  it('defaults missing fields on the projected shape', async () => {
    itemFindLean.mockResolvedValue([
      { _id: 'a', title: 'Duplicate Widget' },
      { _id: 'b', title: 'Duplicate Widget' },
    ]);

    const groups = await findDuplicateItems();

    expect(groups).toHaveLength(1);
    for (const it of groups[0].items) {
      expect(it.num).toBe('');
      expect(it.status).toBe('researching');
      expect(it.currentPrice).toBe(0);
      expect(it.links).toBe(0);
      expect(it.photos).toBe(0);
      expect(it.receipts).toBe(0);
      expect(it.thumbPath).toBe('');
    }
  });
});

describe('mergeItems', () => {
  it('returns an error and never looks up drops when the keep item is not found', async () => {
    itemFindById.mockResolvedValue(null);

    const result = await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(result).toEqual({ ok: false, merged: 0, error: 'Item to keep not found' });
    expect(itemFind).not.toHaveBeenCalled();
  });

  it('filters out the keepId and falsy ids before querying, returning an error when nothing is left to merge', async () => {
    const keep = makeItemDoc();
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([]) as any);

    const result = await mergeItems(KEEP_ID, [KEEP_ID, '', DROP1_ID]);

    expect(itemFind).toHaveBeenCalledWith({ _id: { $in: [DROP1_ID] } });
    expect(result).toEqual({ ok: false, merged: 0, error: 'No items to merge' });
    expect(keep.save).not.toHaveBeenCalled();
  });

  it('backfills falsy scalar fields from a drop, and never overwrites an already-set keep value', async () => {
    const keep = makeItemDoc({ num: '', specs: 'kept specs', notes: '', location: '' });
    const drop1 = { _id: DROP1_ID, num: '07', specs: 'dropped specs', notes: 'dropped notes', location: 'shelf B' };
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(keep.num).toBe('07');
    expect(keep.specs).toBe('kept specs'); // already set -> untouched
    expect(keep.notes).toBe('dropped notes');
    expect(keep.location).toBe('shelf B');
  });

  it('backfills category only while keep is the literal "other", never clobbering an already-specific category', async () => {
    const keepOther = makeItemDoc({ category: 'other' });
    itemFindById.mockResolvedValue(keepOther);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID, category: 'network' }]) as any);
    await mergeItems(KEEP_ID, [DROP1_ID]);
    expect(keepOther.category).toBe('network');

    vi.clearAllMocks();
    const keepSpecific = makeItemDoc({ category: 'network' });
    itemFindById.mockResolvedValue(keepSpecific);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID, category: 'storage' }]) as any);
    await mergeItems(KEEP_ID, [DROP1_ID]);
    expect(keepSpecific.category).toBe('network');
  });

  it('treats a keep value of 0 as already-set for purchasedPrice/targetPrice (loose null check)', async () => {
    const keep = makeItemDoc({ purchasedPrice: 0, targetPrice: 0, purchasedAt: null, warrantyUntil: null });
    const drop1 = { _id: DROP1_ID, purchasedPrice: 250, targetPrice: 199, purchasedAt: '2026-01-01', warrantyUntil: '2028-01-01' };
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(keep.purchasedPrice).toBe(0); // 0 !== null -> not backfilled
    expect(keep.targetPrice).toBe(0);
    expect(keep.purchasedAt).toBe('2026-01-01'); // was actually null -> backfilled
    expect(keep.warrantyUntil).toBe('2028-01-01');
  });

  it('unions tags case-insensitively deduped, capped at 8 total', async () => {
    const keep = makeItemDoc({ tags: ['gpu', 'nvidia', 'gaming', 'high-end', 'watercooled', 'rgb', 'flagship'] });
    const drop1 = { _id: DROP1_ID, tags: ['GPU', 'new-tag-1', 'new-tag-2'] };
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(keep.tags).toHaveLength(8); // 7 existing + only 1 of the 2 new tags fits the cap
    expect(keep.tags.filter((t) => t.toLowerCase() === 'gpu')).toHaveLength(1); // case-insensitive dedup
  });

  it('backfills a null price on a matching link (by normalized URL) instead of duplicating it', async () => {
    const keep = makeItemDoc({ links: [{ label: 'Skroutz', url: 'https://skroutz.gr/p/1', price: null }] });
    const drop1 = { _id: DROP1_ID, links: [{ label: 'Skroutz', url: 'http://www.skroutz.gr/p/1/', price: 549 }] };
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(keep.links).toHaveLength(1);
    expect(keep.links[0].price).toBe(549);
  });

  it('appends a non-matching link as new and concatenates priceHistory as plain objects', async () => {
    const keep = makeItemDoc({ links: [], priceHistory: [] });
    const drop1 = {
      _id: DROP1_ID,
      links: [{ label: 'xpatit', url: 'https://xpatit.gr/p/2', price: 620 }],
      priceHistory: [{ price: 620, store: 'xpatit', url: 'https://xpatit.gr/p/2', currency: 'EUR', date: '2026-02-01', inStock: true }],
    };
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(keep.links).toHaveLength(1);
    expect(keep.links[0]).toEqual({ label: 'xpatit', url: 'https://xpatit.gr/p/2', price: 620 });
    expect(keep.priceHistory).toEqual([
      { price: 620, store: 'xpatit', url: 'https://xpatit.gr/p/2', currency: 'EUR', date: '2026-02-01', inStock: true },
    ]);
  });

  it('unions photos, attachments, and receiptIds without duplicating existing entries', async () => {
    const keep = makeItemDoc({
      photos: ['a.jpg'],
      attachments: [{ path: 'docs/manual.pdf', name: 'manual', mimeType: 'application/pdf', size: 10, uploadedAt: 'x' }],
      receiptIds: ['507f1f77bcf86cd799439021'],
    });
    const drop1 = {
      _id: DROP1_ID,
      photos: ['a.jpg', 'b.jpg'],
      attachments: [{ path: 'docs/manual.pdf', name: 'dup', mimeType: 'application/pdf', size: 10, uploadedAt: 'y' }, { path: 'docs/warranty.pdf', name: 'warranty', mimeType: 'application/pdf', size: 5, uploadedAt: 'z' }],
      receiptIds: ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022'],
    };
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(keep.photos).toEqual(['a.jpg', 'b.jpg']);
    expect(keep.attachments.map((a: any) => a.path)).toEqual(['docs/manual.pdf', 'docs/warranty.pdf']);
    expect(keep.receiptIds.map(String).sort()).toEqual(
      ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022'].sort()
    );
  });

  it('recomputes currentPrice from the cheapest priced link after the union, but leaves it alone when no link has a price', async () => {
    const keepWithPrice = makeItemDoc({ currentPrice: 999, links: [{ label: 'A', url: 'https://a.example/1', price: 999 }] });
    itemFindById.mockResolvedValue(keepWithPrice);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID, links: [{ label: 'B', url: 'https://b.example/2', price: 620 }] }]) as any);
    await mergeItems(KEEP_ID, [DROP1_ID]);
    expect(keepWithPrice.currentPrice).toBe(620);

    vi.clearAllMocks();
    const keepNoPrice = makeItemDoc({ currentPrice: 50, links: [] });
    itemFindById.mockResolvedValue(keepNoPrice);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID, links: [] }]) as any);
    await mergeItems(KEEP_ID, [DROP1_ID]);
    expect(keepNoPrice.currentPrice).toBe(50); // untouched — no priced link to recompute from
  });

  it('marks all six mutated array fields modified and saves exactly once', async () => {
    const keep = makeItemDoc();
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID }]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    for (const field of ['tags', 'links', 'priceHistory', 'photos', 'attachments', 'receiptIds']) {
      expect(keep.markModified).toHaveBeenCalledWith(field);
    }
    expect(keep.save).toHaveBeenCalledTimes(1);
  });

  it('re-points each dropped item\'s receipt/statement references at the survivor', async () => {
    const keep = makeItemDoc();
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID }]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(receiptUpdateMany).toHaveBeenCalledTimes(3);
    const [addToSet, pull, lineItemsSet] = receiptUpdateMany.mock.calls;
    expect(String(addToSet[0].itemIds)).toBe(DROP1_ID);
    expect(String(addToSet[1].$addToSet.itemIds)).toBe(KEEP_ID);
    expect(String(pull[0].itemIds)).toBe(DROP1_ID);
    expect(String(pull[1].$pull.itemIds)).toBe(DROP1_ID);
    expect(String(lineItemsSet[0]['lineItems.matchedItemId'])).toBe(DROP1_ID);
    expect(String(lineItemsSet[1].$set['lineItems.$[el].matchedItemId'])).toBe(KEEP_ID);
    expect(String(lineItemsSet[2]!.arrayFilters[0]!['el.matchedItemId'])).toBe(DROP1_ID);

    expect(statementUpdateMany).toHaveBeenCalledTimes(2);
    const [stmtAdd, stmtPull] = statementUpdateMany.mock.calls;
    expect(String(stmtAdd[0]['transactions.matchedItemIds'])).toBe(DROP1_ID);
    expect(String(stmtAdd[1].$addToSet['transactions.$[t].matchedItemIds'])).toBe(KEEP_ID);
    expect(String(stmtPull[1].$pull['transactions.$[t].matchedItemIds'])).toBe(DROP1_ID);
  });

  it('soft-deletes each drop (never a hard delete), clearing its photos/attachments so shared files survive', async () => {
    const keep = makeItemDoc();
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID }]) as any);

    await mergeItems(KEEP_ID, [DROP1_ID]);

    expect(itemUpdateOne).toHaveBeenCalledWith(
      { _id: DROP1_ID },
      { $set: { deletedAt: expect.any(Date), photos: [], attachments: [] } }
    );
  });

  it('revalidates every surface an item can appear on and reports merged = drops.length', async () => {
    const keep = makeItemDoc();
    itemFindById.mockResolvedValue(keep);
    itemFind.mockReturnValue(Promise.resolve([{ _id: DROP1_ID }, { _id: DROP2_ID }]) as any);

    const result = await mergeItems(KEEP_ID, [DROP1_ID, DROP2_ID]);

    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
    expect(result).toEqual({ ok: true, merged: 2 });
  });
});
