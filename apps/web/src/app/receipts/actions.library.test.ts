import { describe, it, expect, vi, beforeEach } from 'vitest';

// Third slice of app/receipts/actions.ts (756 lines) — `addReceiptItemsToLibrary`, the
// "promote a receipt's line items into the Item library" concern. Unlike the CRUD slice
// (actions.crud.test.ts) and the upload/OCR pipeline slice (actions.upload.test.ts), this
// export reads/writes BOTH the Receipt and Item models in the same call, so the
// `currentModel` mock here dispatches on which model token it was given (see below) instead
// of returning one fixed model like the earlier files. rescanReceiptsBulk, backfillReceiptThumbs,
// duplicate merge, and email-inbox import are separate concerns left for their own files.
//
// Real (unmocked) `mongoose` is used for `Types.ObjectId` — the function builds
// `receipt.itemIds` via `new Types.ObjectId(s)`, so ids used here must be valid 24-hex
// strings, not arbitrary labels like 'r1'.
//
// Behaviour pinned:
//  - Line items with no usable title (blank name AND blank refinedName, after trim) are
//    silently skipped — never reach Item.findOne/create, don't count toward created/linked.
//  - Item title preference: refinedName (trimmed) first, falls back to raw name (trimmed).
//  - The item's price fields are the GROSS (VAT-inclusive) unit price, derived from the
//    line item's (net) `price` and `vatRate`: `price * (1 + vatRate/100)`, rounded to the
//    nearest cent — even though the line item's own price field is documented net, the item
//    library carries what was actually paid.
//  - New item (no existing match by exact title): Item.create with
//    status:'received', category:'other', currentPrice/purchasedPrice = grossUnit,
//    purchasedFrom/purchasedAt from the receipt, tags:[store] (dropped when store is falsy),
//    receiptIds:[receipt._id]. Counts toward `created`.
//  - Existing item matched by title: `linked` is incremented UNCONDITIONALLY, but
//    `item.receiptIds.push(rid)` + `item.save()` only run when the receipt isn't ALREADY in
//    that item's receiptIds (idempotent re-run of the same receipt never double-links or
//    re-saves).
//  - Every processed line item gets `li.matchedItemId` set to the matched/created item's id
//    (mutated in place on the receipt's lineItems array, persisted via `receipt.save()`).
//  - `receipt.itemIds` is replaced with the de-duplicated UNION of its previous contents and
//    every item touched this call — pre-existing unrelated ids are preserved, not dropped.
//  - `warrantyUntil` = receipt.date + (receipt.warrantyMonths, falling back to the settings
//    default when falsy/zero) months. A receipt with warrantyMonths:0 ("no warranty") still
//    gets the default applied, since `0 || default` is truthy-default in JS — pinned as
//    existing behaviour, not something this test file changes.
//  - Revalidates both /receipts and /items on success; a missing receipt short-circuits
//    before any Item read/write and returns `{ok:false, error:'Receipt not found'}`.

const RID = '507f1f77bcf86cd799439011'; // the receipt itself
const EXISTING_UNLINKED_ID = '507f1f77bcf86cd799439012';
const EXISTING_LINKED_ID = '507f1f77bcf86cd799439013';
const NEW_ITEM_ID = '507f1f77bcf86cd799439014';
const PRE_EXISTING_UNRELATED_ID = '507f1f77bcf86cd799439099';

const {
  connectDBMock,
  receiptFindById,
  itemFindOne,
  itemCreate,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  receiptFindById: vi.fn(async (_id: string) => null as Record<string, any> | null),
  itemFindOne: vi.fn(async (_q: { title: string }) => null as Record<string, any> | null),
  itemCreate: vi.fn(async (doc: Record<string, any>) => ({ ...doc, _id: NEW_ITEM_ID })),
  revalidatePathMock: vi.fn(),
}));

const receiptModel = { findById: receiptFindById };
const itemModel = { findOne: itemFindOne, create: itemCreate };

// Distinguishable tokens so currentModel(ReceiptModel) vs currentModel(ItemModel) resolve
// to different mock models — unlike the single-model earlier files in this directory.
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (token: unknown) => (token === 'ITEM_MODEL_TOKEN' ? itemModel : receiptModel),
}));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn(), readFile: vi.fn() }));
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

import { addReceiptItemsToLibrary } from './actions';

type LineItem = { name?: string; refinedName?: string; qty?: number; price?: number; vatRate?: number; matchedItemId?: unknown };

function makeReceiptDoc(overrides: Partial<{
  _id: string; store: string; date: Date; warrantyMonths: number; lineItems: LineItem[]; itemIds: string[];
}> = {}) {
  return {
    _id: RID,
    store: 'Skroutz',
    date: new Date('2026-01-10T00:00:00.000Z'),
    warrantyMonths: 0,
    lineItems: [],
    itemIds: [],
    save: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeItemDoc(id: string, receiptIds: string[] = []) {
  return { _id: id, receiptIds: [...receiptIds], save: vi.fn(async () => {}) };
}

/** Mirrors the function's own warranty-months math, for expected-value comparisons. */
function expectedWarrantyUntil(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();
  itemCreate.mockImplementation(async (doc: Record<string, any>) => ({ ...doc, _id: NEW_ITEM_ID }));
});

describe('addReceiptItemsToLibrary', () => {
  it('returns an error and never touches Item when the receipt is not found', async () => {
    receiptFindById.mockResolvedValue(null);

    const result = await addReceiptItemsToLibrary('missing-id');

    expect(result).toEqual({ ok: false, created: 0, linked: 0, error: 'Receipt not found' });
    expect(connectDBMock).toHaveBeenCalled();
    expect(itemFindOne).not.toHaveBeenCalled();
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it('skips line items with no usable title (blank name and refinedName)', async () => {
    const receipt = makeReceiptDoc({
      lineItems: [
        { name: '', refinedName: '', price: 5, qty: 1, vatRate: 24 },
        { name: '   ', refinedName: '  ', price: 9, qty: 1, vatRate: 24 },
      ],
    });
    receiptFindById.mockResolvedValue(receipt);

    const result = await addReceiptItemsToLibrary('r1');

    expect(result).toEqual({ ok: true, created: 0, linked: 0 });
    expect(itemFindOne).not.toHaveBeenCalled();
    expect(receipt.itemIds).toEqual([]);
  });

  it('creates a new Item using the GROSS (VAT-inclusive) unit price, preferring refinedName for the title', async () => {
    const receipt = makeReceiptDoc({
      lineItems: [{ name: 'raw widget', refinedName: ' Widget Pro ', price: 10, qty: 2, vatRate: 24 }],
    });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(null);

    const result = await addReceiptItemsToLibrary('r1');

    expect(result).toEqual({ ok: true, created: 1, linked: 0 });
    expect(itemFindOne).toHaveBeenCalledWith({ title: 'Widget Pro' });
    expect(itemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Widget Pro',
        status: 'received',
        category: 'other',
        currentPrice: 12.4, // 10 * 1.24
        purchasedPrice: 12.4,
        purchasedFrom: 'Skroutz',
        purchasedAt: receipt.date,
        tags: ['Skroutz'],
      })
    );
    // matchedItemId mutated in place on the receipt's own lineItems array.
    expect(receipt.lineItems[0].matchedItemId).toBe(NEW_ITEM_ID);
    expect(receipt.itemIds.map(String)).toEqual([NEW_ITEM_ID]);
    expect(receipt.save).toHaveBeenCalledTimes(1);
  });

  it('falls back to the raw name when refinedName is blank, and rounds the gross price to the nearest cent', async () => {
    const receipt = makeReceiptDoc({
      lineItems: [{ name: 'Raw Name', refinedName: '', price: 19.99, qty: 1, vatRate: 13 }],
    });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(null);

    await addReceiptItemsToLibrary('r1');

    expect(itemFindOne).toHaveBeenCalledWith({ title: 'Raw Name' });
    expect(itemCreate).toHaveBeenCalledWith(expect.objectContaining({ currentPrice: 22.59, purchasedPrice: 22.59 }));
  });

  it('drops the tags array to empty when the receipt has no store name', async () => {
    const receipt = makeReceiptDoc({ store: '', lineItems: [{ refinedName: 'Widget', price: 5, vatRate: 0 }] });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(null);

    await addReceiptItemsToLibrary('r1');

    expect(itemCreate).toHaveBeenCalledWith(expect.objectContaining({ tags: [], currentPrice: 5 }));
  });

  it('links an existing unlinked Item (matched by title) without creating a new one', async () => {
    const existing = makeItemDoc(EXISTING_UNLINKED_ID, []);
    const receipt = makeReceiptDoc({ lineItems: [{ refinedName: 'Existing Widget', price: 5, vatRate: 24 }] });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(existing);

    const result = await addReceiptItemsToLibrary('r1');

    expect(result).toEqual({ ok: true, created: 0, linked: 1 });
    expect(itemCreate).not.toHaveBeenCalled();
    expect(existing.receiptIds.map(String)).toEqual([RID]);
    expect(existing.save).toHaveBeenCalledTimes(1);
  });

  it('counts an already-linked existing Item toward `linked` WITHOUT re-pushing or re-saving it (idempotent re-run)', async () => {
    const existing = makeItemDoc(EXISTING_LINKED_ID, [RID]); // already linked from a previous run
    const receipt = makeReceiptDoc({ lineItems: [{ refinedName: 'Already Linked', price: 5, vatRate: 24 }] });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(existing);

    const result = await addReceiptItemsToLibrary('r1');

    expect(result).toEqual({ ok: true, created: 0, linked: 1 });
    expect(existing.receiptIds.map(String)).toEqual([RID]); // unchanged, no duplicate
    expect(existing.save).not.toHaveBeenCalled();
  });

  it('merges receipt.itemIds as a de-duplicated union, preserving pre-existing unrelated ids', async () => {
    const receipt = makeReceiptDoc({
      itemIds: [PRE_EXISTING_UNRELATED_ID, EXISTING_UNLINKED_ID], // EXISTING_UNLINKED_ID already present too
      lineItems: [{ refinedName: 'Widget', price: 5, vatRate: 24 }],
    });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(makeItemDoc(EXISTING_UNLINKED_ID, [RID]));

    await addReceiptItemsToLibrary('r1');

    const ids = receipt.itemIds.map(String).sort();
    expect(ids).toEqual([EXISTING_UNLINKED_ID, PRE_EXISTING_UNRELATED_ID].sort());
  });

  it('computes warrantyUntil from receipt.warrantyMonths, but falls back to the settings default when it is 0', async () => {
    const receipt = makeReceiptDoc({ warrantyMonths: 0, lineItems: [{ refinedName: 'Widget', price: 5, vatRate: 24 }] });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(null);

    await addReceiptItemsToLibrary('r1');

    const expected = expectedWarrantyUntil(receipt.date, 24); // 0 is falsy -> settings default (24)
    expect(itemCreate).toHaveBeenCalledWith(expect.objectContaining({ warrantyUntil: expected }));
  });

  it('processes multiple line items in one receipt, aggregating created/linked correctly (mixed new/linked/already-linked/skipped)', async () => {
    const unlinked = makeItemDoc(EXISTING_UNLINKED_ID, []);
    const alreadyLinked = makeItemDoc(EXISTING_LINKED_ID, [RID]);
    const receipt = makeReceiptDoc({
      lineItems: [
        { refinedName: 'Brand New Item', price: 5, vatRate: 24 }, // -> created
        { refinedName: 'Unlinked Existing', price: 5, vatRate: 24 }, // -> linked (pushed)
        { refinedName: 'Already Linked', price: 5, vatRate: 24 }, // -> linked (no push)
        { name: '', refinedName: '' }, // -> skipped entirely
      ],
    });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockImplementation(async ({ title }: { title: string }) => {
      if (title === 'Unlinked Existing') return unlinked;
      if (title === 'Already Linked') return alreadyLinked;
      return null;
    });

    const result = await addReceiptItemsToLibrary('r1');

    expect(result).toEqual({ ok: true, created: 1, linked: 2 });
    expect(itemCreate).toHaveBeenCalledTimes(1);
  });

  it('revalidates both /receipts and /items on success', async () => {
    const receipt = makeReceiptDoc({ lineItems: [{ refinedName: 'Widget', price: 5, vatRate: 24 }] });
    receiptFindById.mockResolvedValue(receipt);
    itemFindOne.mockResolvedValue(null);

    await addReceiptItemsToLibrary('r1');

    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
  });
});
