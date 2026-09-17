import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sixth slice of app/receipts/actions.ts — the duplicate detection + merge concern
// (findDuplicateReceipts/mergeReceipts). Like actions.library.test.ts, this touches BOTH
// the Receipt and Item models in the same call (mergeReceipts re-points item links), so
// `currentModel` dispatches on which model token it was given.
//
// Real (unmocked) `mongoose` is used for `Types.ObjectId` — mergeReceipts builds
// `keepOid`/`dOid` via `new Types.ObjectId(...)`, so every id used here must be a valid
// 24-hex string, not an arbitrary label.
//
// Behaviour pinned (findDuplicateReceipts):
//  - Queries `Receipt.find({ total: { $gt: 0 } }).select(...).lean()` — drafts/zero-total
//    receipts are excluded entirely before grouping (they'd false-positive en masse).
//  - Grouping key = normalized store (lowercased, strips everything except a-z0-9 and greek
//    letters, capped at 20 chars) + total.toFixed(2) + local day (`Y-M-D`, NOT zero-padded).
//    Two receipts differing only by time-of-day, case, or punctuation in the store name
//    still collide into the same group; a missing/invalid date buckets under 'nodate'.
//  - Groups with fewer than 2 receipts are dropped entirely (no lone-receipt "duplicates").
//  - Within a group, receipts sort most-complete-first: verified > more line items > more
//    linked items (all descending).
//  - Groups themselves sort biggest-cluster-first, tie-broken by the leading receipt's total
//    (descending).
//  - Field defaults on the projected shape: missing store -> 'Unknown', missing
//    fileType/thumbPath/filePath/aiModel -> '', missing lineItems/itemIds -> a 0 count.
//
// Behaviour pinned (mergeReceipts):
//  - `keep` not found -> `{ok:false, merged:0, error:'Receipt to keep not found'}`, and the
//    drops lookup never runs.
//  - `dropIds` is filtered to drop falsy entries and the keepId itself before querying.
//  - No resulting drops (empty targets, or Receipt.find comes back empty) ->
//    `{ok:false, merged:0, error:'No receipts to merge'}`.
//  - lineItems/subtotal/vatAmount are backfilled from a drop ONLY while keep's own
//    lineItems are still empty — the first drop with items wins, later drops don't
//    overwrite it.
//  - verified/warrantyMonths/paymentMethod/notes are backfilled the same "keep wins unless
//    falsy" way, first truthy drop value sticks.
//  - keep.itemIds becomes the de-duplicated union of its own ids plus every drop's ids;
//    keep.markModified('lineItems')/('itemIds') and keep.save() are always called once.
//  - Per dropped receipt: Item.updateMany is called TWICE (addToSet the keep id, then pull
//    the dropped id) to re-point linked items. Receipt.deleteMany removes every dropped doc
//    in one call before their file + thumb are best-effort deleted (a storage rejection is
//    swallowed, but a database rejection leaves storage intact).
//  - Revalidates both /receipts and /items; returns `{ok:true, merged: drops.length}`.

const KEEP_ID = '507f1f77bcf86cd799439011';
const DROP1_ID = '507f1f77bcf86cd799439012';
const DROP2_ID = '507f1f77bcf86cd799439013';

const {
  connectDBMock,
  receiptFind,
  receiptFindLean,
  receiptFindById,
  receiptDeleteMany,
  itemUpdateMany,
  deleteFileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  receiptFind: vi.fn((_q: Record<string, any>) => ({ select: (_s: string) => ({ lean: receiptFindLean }) })),
  receiptFindLean: vi.fn(async () => [] as Array<Record<string, any>>),
  receiptFindById: vi.fn(async (_id: string) => null as Record<string, any> | null),
  receiptDeleteMany: vi.fn(async (_q: Record<string, any>) => ({})),
  itemUpdateMany: vi.fn(async (_q: Record<string, any>, _u: Record<string, any>) => ({})),
  deleteFileMock: vi.fn(async (_p: string) => {}),
  revalidatePathMock: vi.fn(),
}));

const receiptModel = { find: receiptFind, findById: receiptFindById, deleteMany: receiptDeleteMany };
const itemModel = { updateMany: itemUpdateMany };

vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (token: unknown) => (token === 'ITEM_MODEL_TOKEN' ? itemModel : receiptModel),
}));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: deleteFileMock, readFile: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseReceipt: vi.fn(), parseReceiptText: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrImage: vi.fn(), looksLikeUsableOcr: vi.fn() }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: vi.fn() }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ defaultWarrantyMonths: 24, defaultVatRate: 24 })) }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({ dispatchEventWebhooks: vi.fn(async () => ({ sent: 0, total: 0 })) }));
vi.mock('@/lib/htmlReceipt', () => ({ htmlReceiptToText: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { findDuplicateReceipts, mergeReceipts } from './actions';

function rawReceipt(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: '507f1f77bcf86cd799439001',
    store: 'Skroutz',
    date: '2026-01-10T09:00:00.000Z',
    total: 19.99,
    verified: false,
    lineItems: [],
    itemIds: [],
    fileType: 'application/pdf',
    thumbPath: 'thumbs/x.jpg',
    filePath: 'receipts/x.pdf',
    aiModel: 'ocr+qwen',
    ...overrides,
  };
}

function makeReceiptDoc(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: KEEP_ID,
    lineItems: [] as Array<Record<string, any>>,
    subtotal: 0,
    vatAmount: 0,
    verified: false,
    warrantyMonths: 0,
    paymentMethod: '',
    notes: '',
    itemIds: [] as string[],
    filePath: '',
    thumbPath: '',
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  receiptFindLean.mockResolvedValue([]);
});

describe('findDuplicateReceipts', () => {
  it('queries only positive-total receipts with the projected fields, via select().lean()', async () => {
    receiptFindLean.mockResolvedValue([]);

    await findDuplicateReceipts();

    expect(connectDBMock).toHaveBeenCalled();
    expect(receiptFind).toHaveBeenCalledWith({ total: { $gt: 0 } });
  });

  it('drops groups with only a single receipt (no duplicate)', async () => {
    receiptFindLean.mockResolvedValue([rawReceipt({ _id: 'a' })]);

    const groups = await findDuplicateReceipts();

    expect(groups).toEqual([]);
  });

  it('groups two receipts with the same normalized store, total, and day, ignoring case/punctuation/time-of-day', async () => {
    receiptFindLean.mockResolvedValue([
      rawReceipt({ _id: 'a', store: 'Skroutz', total: 19.99, date: '2026-01-10T09:00:00.000Z' }),
      rawReceipt({ _id: 'b', store: 'SKROUTZ!!', total: 19.99, date: '2026-01-10T21:45:00.000Z' }),
    ]);

    const groups = await findDuplicateReceipts();

    expect(groups).toHaveLength(1);
    expect(groups[0].receipts.map((r) => r._id).sort()).toEqual(['a', 'b']);
  });

  it('keeps receipts in separate groups when the total differs', async () => {
    receiptFindLean.mockResolvedValue([
      rawReceipt({ _id: 'a', store: 'Skroutz', total: 19.99 }),
      rawReceipt({ _id: 'b', store: 'Skroutz', total: 20.0 }),
    ]);

    const groups = await findDuplicateReceipts();

    expect(groups).toEqual([]);
  });

  it('keeps receipts in separate groups when the day differs', async () => {
    receiptFindLean.mockResolvedValue([
      rawReceipt({ _id: 'a', store: 'Skroutz', total: 19.99, date: '2026-01-10T09:00:00.000Z' }),
      rawReceipt({ _id: 'b', store: 'Skroutz', total: 19.99, date: '2026-01-11T09:00:00.000Z' }),
    ]);

    const groups = await findDuplicateReceipts();

    expect(groups).toEqual([]);
  });

  it('buckets receipts with a missing/invalid date under a shared "nodate" key', async () => {
    receiptFindLean.mockResolvedValue([
      rawReceipt({ _id: 'a', store: 'Skroutz', total: 19.99, date: null }),
      rawReceipt({ _id: 'b', store: 'Skroutz', total: 19.99, date: undefined }),
    ]);

    const groups = await findDuplicateReceipts();

    expect(groups).toHaveLength(1);
    expect(groups[0].receipts.map((r) => r._id).sort()).toEqual(['a', 'b']);
  });

  it('sorts receipts within a group most-complete-first: verified, then more line items, then more linked items', async () => {
    receiptFindLean.mockResolvedValue([
      rawReceipt({ _id: 'bare', verified: false, lineItems: [], itemIds: [] }),
      rawReceipt({ _id: 'verified', verified: true, lineItems: [], itemIds: [] }),
      rawReceipt({ _id: 'unverified-but-detailed', verified: false, lineItems: [{}, {}], itemIds: ['x'] }),
    ]);

    const groups = await findDuplicateReceipts();

    expect(groups).toHaveLength(1);
    expect(groups[0].receipts.map((r) => r._id)).toEqual(['verified', 'unverified-but-detailed', 'bare']);
  });

  it('sorts groups biggest-cluster-first, tie-broken by the leading receipt total (descending)', async () => {
    receiptFindLean.mockResolvedValue([
      // Group "cheap" (2 receipts, total 5)
      rawReceipt({ _id: 'c1', store: 'Cheap', total: 5, date: '2026-02-01T00:00:00.000Z' }),
      rawReceipt({ _id: 'c2', store: 'Cheap', total: 5, date: '2026-02-01T00:00:00.000Z' }),
      // Group "big" (3 receipts, total 100) -- larger cluster, should sort first
      rawReceipt({ _id: 'b1', store: 'Big', total: 100, date: '2026-02-02T00:00:00.000Z' }),
      rawReceipt({ _id: 'b2', store: 'Big', total: 100, date: '2026-02-02T00:00:00.000Z' }),
      rawReceipt({ _id: 'b3', store: 'Big', total: 100, date: '2026-02-02T00:00:00.000Z' }),
      // Group "mid" (2 receipts, total 50) -- same cluster size as "cheap", higher total
      rawReceipt({ _id: 'm1', store: 'Mid', total: 50, date: '2026-02-03T00:00:00.000Z' }),
      rawReceipt({ _id: 'm2', store: 'Mid', total: 50, date: '2026-02-03T00:00:00.000Z' }),
    ]);

    const groups = await findDuplicateReceipts();

    expect(groups.map((g) => g.receipts[0].store)).toEqual(['Big', 'Mid', 'Cheap']);
  });

  it('defaults missing fields on the projected shape (store, fileType, thumbPath, filePath, aiModel, counts)', async () => {
    receiptFindLean.mockResolvedValue([
      { _id: 'a', total: 19.99 }, // everything else absent
      { _id: 'b', total: 19.99 },
    ]);

    const groups = await findDuplicateReceipts();

    expect(groups).toHaveLength(1);
    for (const r of groups[0].receipts) {
      expect(r.store).toBe('Unknown');
      expect(r.fileType).toBe('');
      expect(r.thumbPath).toBe('');
      expect(r.filePath).toBe('');
      expect(r.aiModel).toBe('');
      expect(r.lineItemCount).toBe(0);
      expect(r.itemCount).toBe(0);
    }
  });
});

describe('mergeReceipts', () => {
  it('returns an error and never looks up drops when the keep receipt is not found', async () => {
    receiptFindById.mockResolvedValue(null);

    const result = await mergeReceipts(KEEP_ID, [DROP1_ID]);

    expect(result).toEqual({ ok: false, merged: 0, error: 'Receipt to keep not found' });
    expect(receiptFind).not.toHaveBeenCalled();
  });

  it('filters out the keepId and falsy ids before querying, returning an error when nothing is left to merge', async () => {
    const keep = makeReceiptDoc();
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([]) as any);

    const result = await mergeReceipts(KEEP_ID, [KEEP_ID, '', DROP1_ID]);

    expect(receiptFind).toHaveBeenCalledWith({ _id: { $in: [DROP1_ID] } });
    expect(result).toEqual({ ok: false, merged: 0, error: 'No receipts to merge' });
    expect(keep.save).not.toHaveBeenCalled();
  });

  it('backfills lineItems/subtotal/vatAmount from the first drop that has them, and does not let a later drop overwrite it', async () => {
    const keep = makeReceiptDoc({ lineItems: [], subtotal: 0, vatAmount: 0 });
    const drop1 = { _id: DROP1_ID, lineItems: [{ name: 'A' }], subtotal: 10, vatAmount: 2, itemIds: [] };
    const drop2 = { _id: DROP2_ID, lineItems: [{ name: 'B' }], subtotal: 999, vatAmount: 999, itemIds: [] };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1, drop2]) as any);

    await mergeReceipts(KEEP_ID, [DROP1_ID, DROP2_ID]);

    expect(keep.lineItems).toEqual([{ name: 'A' }]);
    expect(keep.subtotal).toBe(10);
    expect(keep.vatAmount).toBe(2);
  });

  it('backfills verified/warrantyMonths/paymentMethod/notes only while the keep field is still falsy', async () => {
    const keep = makeReceiptDoc({
      verified: false,
      warrantyMonths: 0,
      paymentMethod: '',
      notes: '',
    });
    const drop1 = {
      _id: DROP1_ID,
      lineItems: [],
      itemIds: [],
      verified: true,
      warrantyMonths: 12,
      paymentMethod: 'Visa',
      notes: 'from drop1',
    };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeReceipts(KEEP_ID, [DROP1_ID]);

    expect(keep.verified).toBe(true);
    expect(keep.warrantyMonths).toBe(12);
    expect(keep.paymentMethod).toBe('Visa');
    expect(keep.notes).toBe('from drop1');
  });

  it('does not overwrite already-truthy keep fields with a drop value', async () => {
    const keep = makeReceiptDoc({
      verified: true,
      warrantyMonths: 24,
      paymentMethod: 'Mastercard',
      notes: 'kept note',
    });
    const drop1 = {
      _id: DROP1_ID,
      lineItems: [],
      itemIds: [],
      verified: false,
      warrantyMonths: 6,
      paymentMethod: 'Visa',
      notes: 'ignored',
    };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeReceipts(KEEP_ID, [DROP1_ID]);

    expect(keep.warrantyMonths).toBe(24);
    expect(keep.paymentMethod).toBe('Mastercard');
    expect(keep.notes).toBe('kept note');
  });

  it('unions itemIds across all drops, de-duplicated, and marks lineItems/itemIds modified before saving once', async () => {
    const keep = makeReceiptDoc({ itemIds: ['507f1f77bcf86cd799439021'] });
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022'] };
    const drop2 = { _id: DROP2_ID, lineItems: [], itemIds: ['507f1f77bcf86cd799439023'] };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1, drop2]) as any);

    await mergeReceipts(KEEP_ID, [DROP1_ID, DROP2_ID]);

    expect(keep.itemIds.map(String).sort()).toEqual(
      ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022', '507f1f77bcf86cd799439023'].sort()
    );
    expect(keep.markModified).toHaveBeenCalledWith('lineItems');
    expect(keep.markModified).toHaveBeenCalledWith('itemIds');
    expect(keep.save).toHaveBeenCalledTimes(1);
  });

  it('re-points each dropped receipt\'s linked items to the survivor via addToSet then pull', async () => {
    const keep = makeReceiptDoc();
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: [] };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeReceipts(KEEP_ID, [DROP1_ID]);

    expect(itemUpdateMany).toHaveBeenCalledTimes(2);
    const [addCall, pullCall] = itemUpdateMany.mock.calls;
    expect(addCall[0]).toEqual({ receiptIds: expect.anything() });
    expect(addCall[1]).toEqual({ $addToSet: { receiptIds: expect.anything() } });
    expect(String(addCall[0].receiptIds)).toBe(DROP1_ID);
    expect(String(addCall[1].$addToSet.receiptIds)).toBe(KEEP_ID);
    expect(pullCall[1]).toEqual({ $pull: { receiptIds: expect.anything() } });
    expect(String(pullCall[0].receiptIds)).toBe(DROP1_ID);
    expect(String(pullCall[1].$pull.receiptIds)).toBe(DROP1_ID);
  });

  it('best-effort deletes each drop\'s file + thumbnail, swallowing a delete rejection instead of failing the merge', async () => {
    // The survivor has its own scan, so the drop's copy is redundant and must go (#91: a
    // fileless survivor would adopt it instead, see the next tests).
    const keep = makeReceiptDoc({ filePath: 'receipts/k.pdf', thumbPath: 'thumbs/k.jpg' });
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: [], filePath: 'receipts/d1.pdf', thumbPath: 'thumbs/d1.jpg' };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1]) as any);
    deleteFileMock.mockRejectedValueOnce(new Error('file already gone'));
    deleteFileMock.mockRejectedValueOnce(new Error('thumb already gone'));

    const result = await mergeReceipts(KEEP_ID, [DROP1_ID]);

    expect(deleteFileMock).toHaveBeenCalledWith('receipts/d1.pdf');
    expect(deleteFileMock).toHaveBeenCalledWith('thumbs/d1.jpg');
    expect(result.ok).toBe(true);
  });

  it('skips deleteFile entirely when a drop has no filePath/thumbPath', async () => {
    const keep = makeReceiptDoc();
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: [], filePath: '', thumbPath: '' };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeReceipts(KEEP_ID, [DROP1_ID]);

    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('does not delete drop files when deleting their receipt documents fails', async () => {
    const keep = makeReceiptDoc();
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: [], filePath: 'receipts/d1.pdf', thumbPath: 'thumbs/d1.jpg' };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1]) as any);
    receiptDeleteMany.mockRejectedValueOnce(new Error('database disconnected'));

    await expect(mergeReceipts(KEEP_ID, [DROP1_ID])).rejects.toThrow('database disconnected');

    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  // #91: a fileless survivor (legacy / manually created, sorted first because verified)
  // used to keep "No scan file" while the only real scan was deleted with the drop.
  it('adopts a drop\'s scan when the survivor has none, and does not delete the adopted file', async () => {
    const keep = makeReceiptDoc({ verified: true, filePath: '', thumbPath: '' });
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: [], filePath: '', thumbPath: '' };
    const drop2 = {
      _id: DROP2_ID,
      lineItems: [],
      itemIds: [],
      filePath: 'receipts/d2.pdf',
      thumbPath: 'thumbs/d2.jpg',
      fileType: 'application/pdf',
      fileSize: 12345,
    };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1, drop2]) as any);

    const result = await mergeReceipts(KEEP_ID, [DROP1_ID, DROP2_ID]);

    expect(result.ok).toBe(true);
    expect(keep.filePath).toBe('receipts/d2.pdf');
    expect(keep.thumbPath).toBe('thumbs/d2.jpg');
    expect((keep as Record<string, any>).fileType).toBe('application/pdf');
    expect((keep as Record<string, any>).fileSize).toBe(12345);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('keeps the survivor\'s own scan and still deletes the drop\'s file when both have one', async () => {
    const keep = makeReceiptDoc({ filePath: 'receipts/k.pdf', thumbPath: 'thumbs/k.jpg' });
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: [], filePath: 'receipts/d1.pdf', thumbPath: 'thumbs/d1.jpg' };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1]) as any);

    await mergeReceipts(KEEP_ID, [DROP1_ID]);

    expect(keep.filePath).toBe('receipts/k.pdf');
    expect(keep.thumbPath).toBe('thumbs/k.jpg');
    expect(deleteFileMock).toHaveBeenCalledWith('receipts/d1.pdf');
    expect(deleteFileMock).toHaveBeenCalledWith('thumbs/d1.jpg');
  });

  it('hard-deletes every dropped receipt in one call, revalidates /receipts and /items, and reports merged = drops.length', async () => {
    const keep = makeReceiptDoc();
    const drop1 = { _id: DROP1_ID, lineItems: [], itemIds: [] };
    const drop2 = { _id: DROP2_ID, lineItems: [], itemIds: [] };
    receiptFindById.mockResolvedValue(keep);
    receiptFind.mockReturnValue(Promise.resolve([drop1, drop2]) as any);

    const result = await mergeReceipts(KEEP_ID, [DROP1_ID, DROP2_ID]);

    expect(receiptDeleteMany).toHaveBeenCalledWith({ _id: { $in: [DROP1_ID, DROP2_ID] } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(result).toEqual({ ok: true, merged: 2 });
  });
});
