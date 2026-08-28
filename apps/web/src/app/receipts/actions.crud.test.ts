import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/receipts/actions.ts is a large multi-concern module (756 lines: manual CRUD, the
// shared AI upload/re-scan OCR pipeline, item-library linking, thumbnail backfill,
// duplicate detection/merge, email-inbox import). This file covers ONLY the plain
// manual-entry CRUD slice, the most isolated concern — updateReceipt/quickVerifyReceipt/
// deleteReceipt/archiveReceipt. The upload/rescan OCR pipeline, addReceiptItemsToLibrary,
// duplicate merge, and email import are separate concerns left for their own focused test
// files in later runs.
//
// Like the other tenancy-wrapped modules (expenses, statements, ...), every export runs
// inside `withRequestTenant(...)` and reads its model via `currentModel(ReceiptModel)`
// instead of touching the Mongoose model directly. Both are mocked here as trivial
// pass-throughs — this file does NOT re-test tenant isolation itself (already covered by
// lib/tenancy/*.tenant.test.ts).
//
// Behaviour pinned:
//  - updateReceipt: Zod `UpdateReceiptSchema.parse(data)` runs BEFORE `withRequestTenant`,
//    so an invalid payload throws synchronously (a rejected promise), never touching the
//    DB. `store` is the only field with `.min(1)`; `total` is required-but-no-default;
//    everything else has a schema default. `date` is re-derived via the real `safeDate`.
//    Mirror-on-verify only fires when the UPDATED doc comes back both verified AND has a
//    filePath (fire-and-forget `void`, never awaited/blocking).
//  - quickVerifyReceipt: always force-sets `verified:true` regardless of input; store falls
//    back to 'Unknown store' when blank/whitespace-only; total/subtotal/vatAmount fall back
//    to 0 via `Number(x) || 0` (so NaN AND 0 both resolve to 0, not just missing). Mirror
//    fires whenever the returned doc has a filePath (no separate verified-check needed,
//    since verified is unconditionally true here). No try/catch — a DB error propagates as
//    a rejected promise, unlike updateReceipt's sibling exports elsewhere in the file that
//    DO catch and return a friendly `{ok:false}`.
//  - deleteReceipt: SOFT delete only (`$set deletedAt`), never an actual `deleteOne` — files
//    and item links stay intact for the Trash restore flow. Revalidates both /receipts and
//    /items (item detail pages show linked receipts).
//  - archiveReceipt: a plain boolean flag flip (`$set archived: value`), reversible either
//    direction; only revalidates /receipts (archived receipts aren't items-page-visible).

const {
  connectDBMock,
  receiptFindByIdAndUpdate,
  receiptFindByIdAndUpdateLean,
  receiptFindById,
  receiptFindByIdLean,
  receiptUpdateOne,
  mirrorFileToRemoteMock,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  // quickVerifyReceipt reads the stored currency/rate first (P9) — it submits PRINTED
  // amounts, so it needs the receipt's own FX context to convert them back to base.
  receiptFindById: vi.fn((_id: string) => ({ select: () => ({ lean: receiptFindByIdLean }) })),
  receiptFindByIdLean: vi.fn(async () => null as Record<string, any> | null),
  getAppSettingsMock: vi.fn(async () => ({ defaultWarrantyMonths: 24, defaultVatRate: 24, currency: 'EUR' })),
  receiptFindByIdAndUpdate: vi.fn((_id: string, _update: Record<string, any>, _opts: Record<string, any>) => ({
    lean: receiptFindByIdAndUpdateLean,
  })),
  receiptFindByIdAndUpdateLean: vi.fn(async () => null as Record<string, any> | null),
  receiptUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  mirrorFileToRemoteMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

const receiptModel = {
  findByIdAndUpdate: receiptFindByIdAndUpdate,
  findById: receiptFindById,
  updateOne: receiptUpdateOne,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => receiptModel }));
vi.mock('@/models/Receipt', () => ({ Receipt: {} }));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn(), readFile: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseReceipt: vi.fn(), parseReceiptText: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrImage: vi.fn(), looksLikeUsableOcr: vi.fn() }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: vi.fn() }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: mirrorFileToRemoteMock }));
vi.mock('@/lib/webhooks', () => ({ dispatchEventWebhooks: vi.fn(async () => ({ sent: 0, total: 0 })) }));
vi.mock('@/lib/htmlReceipt', () => ({ htmlReceiptToText: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { updateReceipt, quickVerifyReceipt, deleteReceipt, archiveReceipt } from './actions';

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  receiptFindByIdAndUpdateLean.mockResolvedValue(null);
  receiptFindByIdLean.mockResolvedValue(null);
  getAppSettingsMock.mockResolvedValue({ defaultWarrantyMonths: 24, defaultVatRate: 24, currency: 'EUR' });
});

describe('updateReceipt', () => {
  it('rejects an invalid payload (blank store) before touching the DB', async () => {
    await expect(updateReceipt('r1', { store: '', date: '2026-06-15', total: 10 } as any)).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(receiptFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a payload missing the required total field before touching the DB', async () => {
    await expect(updateReceipt('r1', { store: 'Skroutz', date: '2026-06-15' } as any)).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('applies schema defaults and re-derives the date via the real safeDate', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({ _id: 'r1', store: 'Skroutz', date: new Date('2026-06-15'), total: 42, verified: false, filePath: '' });
    await updateReceipt('r1', { store: 'Skroutz', date: '15/06/2026', total: 42 } as any);
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(receiptFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update, opts] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('r1');
    expect(update.store).toBe('Skroutz');
    expect(update.total).toBe(42);
    expect(update.subtotal).toBe(0);
    expect(update.vatAmount).toBe(0);
    expect(update.warrantyMonths).toBe(24);
    expect(update.currency).toBe('EUR');
    expect(update.lineItems).toEqual([]);
    expect(update.verified).toBe(false);
    expect(update.date).toBeInstanceOf(Date);
    expect(localYmd(update.date as Date)).toBe('2026-06-15'); // EU day-first parsed
    expect(opts).toEqual({ new: true, select: 'store date total filePath verified' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });

  // P64: per-line spend category. A payload written before the field existed (no
  // `category` key) must still save, as '' — that is the untagged, pre-P64 state.
  it('keeps a per-line category and defaults a missing one to "" (P64)', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({ _id: 'r1', store: 'Skroutz', date: new Date('2026-06-15'), total: 42, verified: false, filePath: '' });
    await updateReceipt('r1', {
      store: 'Skroutz',
      date: '2026-06-15',
      total: 42,
      lineItems: [
        { name: 'Milk', qty: 1, price: 1.5, vatRate: 13, category: 'groceries' },
        { name: 'HDMI cable', qty: 1, price: 8, vatRate: 24 }, // pre-P64 shape
      ],
    } as any);
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.lineItems).toEqual([
      { name: 'Milk', refinedName: '', qty: 1, price: 1.5, vatRate: 13, category: 'groceries' },
      { name: 'HDMI cable', refinedName: '', qty: 1, price: 8, vatRate: 24, category: '' },
    ]);
  });

  it('mirrors the file to remote when the updated doc is verified AND has a filePath', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({
      _id: 'r1', store: 'Skroutz', date: '2026-06-15', total: 42, verified: true, filePath: 'receipts/2026/06/r1.pdf',
    });
    await updateReceipt('r1', { store: 'Skroutz', date: '2026-06-15', total: 42, verified: true } as any);
    expect(mirrorFileToRemoteMock).toHaveBeenCalledTimes(1);
    const [meta, filePath] = mirrorFileToRemoteMock.mock.calls[0];
    expect(meta).toEqual({ kind: 'receipts', store: 'Skroutz', date: '2026-06-15', total: 42, id: 'r1' });
    expect(filePath).toBe('receipts/2026/06/r1.pdf');
  });

  it('does NOT mirror when verified is true but filePath is empty', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({ _id: 'r1', store: 'Skroutz', date: '2026-06-15', total: 42, verified: true, filePath: '' });
    await updateReceipt('r1', { store: 'Skroutz', date: '2026-06-15', total: 42, verified: true } as any);
    expect(mirrorFileToRemoteMock).not.toHaveBeenCalled();
  });

  it('does NOT mirror when the doc has a filePath but is not verified', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({ _id: 'r1', store: 'Skroutz', date: '2026-06-15', total: 42, verified: false, filePath: 'receipts/x.pdf' });
    await updateReceipt('r1', { store: 'Skroutz', date: '2026-06-15', total: 42 } as any);
    expect(mirrorFileToRemoteMock).not.toHaveBeenCalled();
  });

  it('does NOT mirror when findByIdAndUpdate resolves null (record not found)', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce(null);
    await updateReceipt('missing', { store: 'Skroutz', date: '2026-06-15', total: 42 } as any);
    expect(mirrorFileToRemoteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });
});

describe('quickVerifyReceipt', () => {
  it('always sets verified:true and $set-updates only the headline fields', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({ _id: 'r1', store: 'Skroutz', date: '2026-06-15', total: 99, filePath: '' });
    const res = await quickVerifyReceipt('r1', { store: 'Skroutz', date: '2026-06-15', total: 99 });
    expect(res).toEqual({ ok: true });
    const [id, update, opts] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('r1');
    expect(update.$set.store).toBe('Skroutz');
    expect(update.$set.total).toBe(99);
    expect(update.$set.subtotal).toBe(0);
    expect(update.$set.vatAmount).toBe(0);
    expect(update.$set.verified).toBe(true);
    expect(update.$set.date).toBeInstanceOf(Date);
    expect(opts).toEqual({ new: true, select: 'store date total filePath verified' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });

  it('falls back store to "Unknown store" when blank/whitespace-only', async () => {
    await quickVerifyReceipt('r1', { store: '   ', date: '2026-06-15', total: 10 });
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.$set.store).toBe('Unknown store');
  });

  it('falls total/subtotal/vatAmount back to 0 when NaN (Number(x) || 0)', async () => {
    await quickVerifyReceipt('r1', { store: 'X', date: '2026-06-15', total: NaN, subtotal: NaN, vatAmount: NaN });
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.$set.total).toBe(0);
    expect(update.$set.subtotal).toBe(0);
    expect(update.$set.vatAmount).toBe(0);
  });

  it('mirrors whenever the returned doc has a filePath (no separate verified check needed)', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({ _id: 'r1', store: 'Skroutz', date: '2026-06-15', total: 42, filePath: 'receipts/r1.pdf' });
    await quickVerifyReceipt('r1', { store: 'Skroutz', date: '2026-06-15', total: 42 });
    expect(mirrorFileToRemoteMock).toHaveBeenCalledTimes(1);
    const [meta] = mirrorFileToRemoteMock.mock.calls[0];
    expect(meta).toEqual({ kind: 'receipts', store: 'Skroutz', date: '2026-06-15', total: 42, id: 'r1' });
  });

  it('does not mirror when the returned doc has no filePath', async () => {
    receiptFindByIdAndUpdateLean.mockResolvedValueOnce({ _id: 'r1', store: 'Skroutz', date: '2026-06-15', total: 42, filePath: '' });
    await quickVerifyReceipt('r1', { store: 'Skroutz', date: '2026-06-15', total: 42 });
    expect(mirrorFileToRemoteMock).not.toHaveBeenCalled();
  });

  it('propagates a DB error as a rejected promise (no try/catch here, unlike updateReceipt)', async () => {
    receiptFindByIdAndUpdate.mockImplementationOnce(() => {
      throw new Error('connection lost');
    });
    await expect(quickVerifyReceipt('r1', { store: 'X', date: '2026-06-15', total: 1 })).rejects.toThrow('connection lost');
  });
});

// Multi-currency (P9). The conversion rule itself is pinned in lib/fx.test.ts; what
// matters here is that the receipt write paths actually run the SUBMITTED (printed)
// amounts through it against the deployment's base currency, so what lands in the DB is
// base-denominated — for the whole money side, not just the headline total, since reports
// sum `vatAmount` and the item library copies line prices into Item.purchasedPrice.
describe('multi-currency (resolveFx wiring)', () => {
  it('converts the whole money side with one rate on update, keeping the printed total', async () => {
    await updateReceipt('r1', {
      store: 'Amazon', date: '2026-06-15', total: 88, subtotal: 80, vatAmount: 8,
      currency: 'USD', fxRate: 0.92,
      lineItems: [{ name: 'Cable', qty: 2, price: 10 }],
    } as any);
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.total).toBe(80.96); // 88 x 0.92 — what every aggregation sums
    expect(update.subtotal).toBe(73.6);
    expect(update.vatAmount).toBe(7.36);
    expect(update.lineItems[0].price).toBe(9.2);
    expect(update.currency).toBe('USD');
    expect(update.origAmount).toBe(88); // printed total kept verbatim for round-tripping
    expect(update.fxRate).toBe(0.92);
  });

  it('leaves a foreign receipt alone (no silent 1:1) when no rate was given', async () => {
    await updateReceipt('r1', {
      store: 'Amazon', date: '2026-06-15', total: 88, subtotal: 80, vatAmount: 8, currency: 'USD',
      lineItems: [{ name: 'Cable', qty: 1, price: 10 }],
    } as any);
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.total).toBe(88);
    expect(update.subtotal).toBe(80);
    expect(update.vatAmount).toBe(8);
    expect(update.lineItems[0].price).toBe(10);
    expect(update.origAmount).toBe(88);
    expect(update.fxRate).toBe(0); // flagged for the UI, not guessed
  });

  it('treats a receipt in the base currency as plain, whatever base that is', async () => {
    getAppSettingsMock.mockResolvedValue({ defaultWarrantyMonths: 24, defaultVatRate: 24, currency: 'USD' });
    await updateReceipt('r1', { store: 'Amazon', date: '2026-06-15', total: 88, subtotal: 80, currency: 'USD' } as any);
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.total).toBe(88);
    expect(update.subtotal).toBe(80);
    expect(update.origAmount).toBe(0);
    expect(update.fxRate).toBe(0);
  });

  it('re-saving an unchanged foreign receipt does not double-convert it', async () => {
    // The form submits the PRINTED amounts back (origAmount for the total), so one
    // round-trip through the same rate must land on the same stored values.
    const submit = { store: 'Amazon', date: '2026-06-15', total: 88, subtotal: 80, vatAmount: 8, currency: 'USD', fxRate: 0.92 };
    await updateReceipt('r1', submit as any);
    const first = receiptFindByIdAndUpdate.mock.calls[0][1];
    await updateReceipt('r1', submit as any);
    const second = receiptFindByIdAndUpdate.mock.calls[1][1];
    expect(second.total).toBe(first.total);
    expect(second.subtotal).toBe(first.subtotal);
    expect(second.origAmount).toBe(88);
  });

  it('quick-verify converts its printed total with the rate already on the receipt', async () => {
    receiptFindByIdLean.mockResolvedValueOnce({ currency: 'USD', fxRate: 0.92 });
    await quickVerifyReceipt('r1', { store: 'Amazon', date: '2026-06-15', total: 88, vatAmount: 8 });
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.$set.total).toBe(80.96);
    expect(update.$set.vatAmount).toBe(7.36);
    expect(update.$set.currency).toBe('USD');
    expect(update.$set.origAmount).toBe(88);
    expect(update.$set.fxRate).toBe(0.92);
    expect(update.$set.verified).toBe(true);
  });

  it('quick-verify on an ordinary receipt stores the total untouched', async () => {
    receiptFindByIdLean.mockResolvedValueOnce({ currency: 'EUR', fxRate: 0 });
    await quickVerifyReceipt('r1', { store: 'Skroutz', date: '2026-06-15', total: 42 });
    const [, update] = receiptFindByIdAndUpdate.mock.calls[0];
    expect(update.$set.total).toBe(42);
    expect(update.$set.origAmount).toBe(0);
    expect(update.$set.fxRate).toBe(0);
  });
});

describe('deleteReceipt', () => {
  it('soft-deletes via $set deletedAt, never a hard delete', async () => {
    await deleteReceipt('r1');
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(receiptUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = receiptUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'r1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
  });

  it('revalidates both /receipts and /items (item detail shows linked receipts)', async () => {
    await deleteReceipt('r1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
  });
});

describe('archiveReceipt', () => {
  it('sets archived:true and returns ok', async () => {
    const res = await archiveReceipt('r1', true);
    expect(res).toEqual({ ok: true });
    const [filter, update] = receiptUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'r1' });
    expect(update).toEqual({ $set: { archived: true } });
  });

  it('can flip archived back to false (reversible)', async () => {
    await archiveReceipt('r1', false);
    const [, update] = receiptUpdateOne.mock.calls[0];
    expect(update).toEqual({ $set: { archived: false } });
  });

  it('only revalidates /receipts, not /items', async () => {
    revalidatePathMock.mockClear();
    await archiveReceipt('r1', true);
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });
});
