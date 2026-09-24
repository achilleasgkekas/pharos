import { describe, it, expect, vi, beforeEach } from 'vitest';

// P46 — the database halves of expense duplicate detection: findDuplicateExpenses and
// mergeExpenses. The grouping RULE is pinned separately in lib/expenseDupes.test.ts and
// deliberately left un-mocked here, so this file exercises the real one end-to-end.
//
// Behaviour pinned:
//  - findDuplicateExpenses scopes to ONE tab (kind) and to amount > 0, so the /income
//    modal can never offer to merge an expense and empty drafts never cluster.
//  - mergeExpenses backfills only the fields the survivor is MISSING, never overwrites.
//  - drops are SOFT-deleted (Trash), never hard-deleted: a regretted merge is undoable.
//  - when the survivor adopts a dropped record's file, that record's file reference is
//    cleared first — purgeTrashEntry deletes an expense's filePath unconditionally, so
//    leaving it would let the 30-day auto-purge delete the SURVIVOR's document.
//  - a drop of the other kind is refused at the query level, whatever the client sent.

const { connectDBMock, expenseFindSelectLean, expenseFindByIdMock, expenseFindDropsMock, expenseUpdateOne, revalidatePathMock } =
  vi.hoisted(() => ({
    connectDBMock: vi.fn(async () => {}),
    expenseFindSelectLean: vi.fn(async () => [] as Array<Record<string, any>>),
    expenseFindByIdMock: vi.fn(async (_id: string) => null as Record<string, any> | null),
    expenseFindDropsMock: vi.fn(async (_filter: Record<string, any>) => [] as Array<Record<string, any>>),
    expenseUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
    revalidatePathMock: vi.fn(),
  }));

const expenseModel = {
  // `find` is used two ways: as a chain (.select().lean()) when listing candidates, and
  // awaited directly when loading the drops to merge. Route on the filter shape.
  find: (filter: Record<string, any>) =>
    filter && filter._id
      ? expenseFindDropsMock(filter)
      : { select: () => ({ lean: () => expenseFindSelectLean() }) },
  findById: (id: string) => expenseFindByIdMock(id),
  updateOne: expenseUpdateOne,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => expenseModel }));
vi.mock('@/models/Expense', () => ({ Expense: {} }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseExpenseText: vi.fn(), parseExpenseImage: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrImage: vi.fn(), looksLikeUsableOcr: vi.fn() }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ categoryRules: [] })) }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/csvImport', () => ({ csvDedupeKey: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { findDuplicateExpenses, mergeExpenses } from './actions';

/** A survivor document as Mongoose hands it back: mutable fields plus save(). */
function keepDoc(over: Record<string, any> = {}) {
  return {
    _id: 'keep1',
    paymentSplits: [] as Array<Record<string, any>>,   // #168: the merge carries this over
    kind: 'expense',
    vendor: 'ΔΕΗ',
    vendorKey: 'dei',
    category: 'other',
    period: '',
    paymentMethod: '',
    notes: '',
    space: '',
    taxCategory: '',
    taxDeductible: false,
    recurring: false,
    recurringCycle: '',
    split: [],
    currency: 'EUR',
    origAmount: 0,
    fxRate: 0,
    filePath: '',
    fileType: '',
    thumbPath: '',
    fileSize: 0,
    aiModel: '',
    aiParsedAt: null,
    verified: false,
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    ...over,
  };
}

function dropDoc(over: Record<string, any> = {}) {
  return {
    _id: 'drop1',
    paymentSplits: [] as Array<Record<string, any>>,
    kind: 'expense',
    vendor: 'ΔΕΗ',
    vendorKey: 'dei',
    category: 'other',
    period: '',
    paymentMethod: '',
    notes: '',
    space: '',
    taxCategory: '',
    taxDeductible: false,
    recurring: false,
    recurringCycle: '',
    split: [],
    currency: 'EUR',
    origAmount: 0,
    fxRate: 0,
    filePath: '',
    fileType: '',
    thumbPath: '',
    fileSize: 0,
    aiModel: '',
    aiParsedAt: null,
    verified: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  expenseFindSelectLean.mockResolvedValue([]);
  expenseFindByIdMock.mockResolvedValue(null);
  expenseFindDropsMock.mockResolvedValue([]);
});

describe('findDuplicateExpenses', () => {
  it('scopes the query to one tab and to non-empty amounts', async () => {
    const findSpy = vi.spyOn(expenseModel, 'find');
    await findDuplicateExpenses('income');
    expect(findSpy).toHaveBeenCalledWith({ kind: 'income', amount: { $gt: 0 } });
    findSpy.mockRestore();
  });

  it('groups two copies of the same bill and puts the richer one first', async () => {
    expenseFindSelectLean.mockResolvedValue([
      { _id: 'a', kind: 'expense', vendor: 'ΔΕΗ', vendorKey: 'dei', category: 'other', amount: 62, date: '2026-06-04T00:00:00.000Z' },
      {
        _id: 'b',
        kind: 'expense',
        vendor: 'ΔΕΗ',
        vendorKey: 'dei',
        category: 'utilities',
        amount: 62,
        date: '2026-06-04T00:00:00.000Z',
        verified: true,
        filePath: 'expenses/2026/06/dei.pdf',
        split: [{ name: 'Maria', share: 31 }],
      },
    ]);
    const groups = await findDuplicateExpenses('expense');
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e._id)).toEqual(['b', 'a']);
    expect(groups[0].entries[0].hasFile).toBe(true);
    expect(groups[0].entries[0].splitCount).toBe(1);
  });

  it('returns nothing when the library is clean', async () => {
    expenseFindSelectLean.mockResolvedValue([
      { _id: 'a', kind: 'expense', vendorKey: 'dei', amount: 62, date: '2026-06-04T00:00:00.000Z' },
      { _id: 'b', kind: 'expense', vendorKey: 'ote', amount: 62, date: '2026-06-04T00:00:00.000Z' },
    ]);
    expect(await findDuplicateExpenses('expense')).toEqual([]);
  });
});

describe('mergeExpenses', () => {
  it('refuses when the survivor no longer exists', async () => {
    expect(await mergeExpenses('gone', ['drop1'])).toEqual({ ok: false, merged: 0, error: 'Record to keep not found' });
  });

  it('refuses a merge into itself without touching the database', async () => {
    expenseFindByIdMock.mockResolvedValue(keepDoc());
    const res = await mergeExpenses('keep1', ['keep1']);
    expect(res.ok).toBe(false);
    expect(expenseFindDropsMock).not.toHaveBeenCalled();
    expect(expenseUpdateOne).not.toHaveBeenCalled();
  });

  it('refuses when none of the drops resolve', async () => {
    expenseFindByIdMock.mockResolvedValue(keepDoc());
    expenseFindDropsMock.mockResolvedValue([]);
    const res = await mergeExpenses('keep1', ['drop1']);
    expect(res).toEqual({ ok: false, merged: 0, error: 'No records to merge' });
    expect(expenseUpdateOne).not.toHaveBeenCalled();
  });

  it('loads the drops constrained to the survivor kind, so income and expense never mix', async () => {
    expenseFindByIdMock.mockResolvedValue(keepDoc({ kind: 'income' }));
    expenseFindDropsMock.mockResolvedValue([dropDoc({ kind: 'income' })]);
    await mergeExpenses('keep1', ['drop1']);
    expect(expenseFindDropsMock).toHaveBeenCalledWith({ _id: { $in: ['drop1'] }, kind: 'income' });
  });

  it('backfills every field the survivor is missing', async () => {
    const keep = keepDoc();
    expenseFindByIdMock.mockResolvedValue(keep);
    expenseFindDropsMock.mockResolvedValue([
      dropDoc({
        category: 'utilities',
        period: '2026-06',
        paymentMethod: 'Mastercard',
        notes: 'bimonthly bill',
        space: 'athens',
        taxCategory: 'home-office',
        taxDeductible: true,
        recurring: true,
        recurringCycle: 'monthly',
        split: [{ name: 'Maria', share: 31, settled: false }],
        verified: true,
      }),
    ]);

    const res = await mergeExpenses('keep1', ['drop1']);
    expect(res).toEqual({ ok: true, merged: 1 });
    expect(keep.category).toBe('utilities');
    expect(keep.period).toBe('2026-06');
    expect(keep.paymentMethod).toBe('Mastercard');
    expect(keep.notes).toBe('bimonthly bill');
    expect(keep.space).toBe('athens');
    expect(keep.taxCategory).toBe('home-office');
    expect(keep.taxDeductible).toBe(true);
    expect(keep.recurring).toBe(true);
    expect(keep.recurringCycle).toBe('monthly');
    expect(keep.split).toHaveLength(1);
    expect(keep.verified).toBe(true);
    expect(keep.save).toHaveBeenCalled();
  });

  it('never overwrites a field the survivor already has', async () => {
    const keep = keepDoc({ category: 'rent', notes: 'mine', paymentMethod: 'cash', verified: true });
    expenseFindByIdMock.mockResolvedValue(keep);
    expenseFindDropsMock.mockResolvedValue([
      dropDoc({ category: 'utilities', notes: 'theirs', paymentMethod: 'card', verified: false }),
    ]);
    await mergeExpenses('keep1', ['drop1']);
    expect(keep.category).toBe('rent');
    expect(keep.notes).toBe('mine');
    expect(keep.paymentMethod).toBe('cash');
    expect(keep.verified).toBe(true);
  });

  it('takes the foreign-currency provenance from whichever copy has it', async () => {
    const keep = keepDoc();
    expenseFindByIdMock.mockResolvedValue(keep);
    expenseFindDropsMock.mockResolvedValue([dropDoc({ currency: 'USD', origAmount: 70, fxRate: 0.92 })]);
    await mergeExpenses('keep1', ['drop1']);
    expect(keep.currency).toBe('USD');
    expect(keep.origAmount).toBe(70);
    expect(keep.fxRate).toBe(0.92);
  });

  it('soft-deletes the drops instead of destroying them', async () => {
    expenseFindByIdMock.mockResolvedValue(keepDoc());
    expenseFindDropsMock.mockResolvedValue([dropDoc({ _id: 'd1' }), dropDoc({ _id: 'd2' })]);
    const res = await mergeExpenses('keep1', ['d1', 'd2']);
    expect(res).toEqual({ ok: true, merged: 2 });
    expect(expenseUpdateOne).toHaveBeenCalledTimes(2);
    for (const call of expenseUpdateOne.mock.calls) {
      expect((call[1] as any).$set.deletedAt).toBeInstanceOf(Date);
    }
  });

  it('adopts a dropped record file AND clears the reference on the trashed copy', async () => {
    // The purge trap: purgeTrashEntry unlinks an expense's filePath/thumbPath without
    // checking whether anything else points at it, so an un-cleared reference would make
    // the 30-day auto-purge delete the SURVIVOR's document.
    const keep = keepDoc();
    expenseFindByIdMock.mockResolvedValue(keep);
    expenseFindDropsMock.mockResolvedValue([
      dropDoc({
        _id: 'd1',
        filePath: 'expenses/2026/06/dei.pdf',
        fileType: 'pdf',
        thumbPath: 'expenses/2026/06/dei.jpg',
        fileSize: 1234,
        aiModel: 'ocr-pdf+claude',
      }),
    ]);

    await mergeExpenses('keep1', ['d1']);
    expect(keep.filePath).toBe('expenses/2026/06/dei.pdf');
    expect(keep.thumbPath).toBe('expenses/2026/06/dei.jpg');
    expect(keep.aiModel).toBe('ocr-pdf+claude');

    const set = (expenseUpdateOne.mock.calls[0][1] as any).$set;
    expect(set.filePath).toBe('');
    expect(set.thumbPath).toBe('');
    expect(set.fileSize).toBe(0);
  });

  it('leaves the file reference alone on a drop whose file was NOT adopted', async () => {
    // The survivor already has its own document, so the drop keeps pointing at its own
    // file and purge is free to clean it up.
    const keep = keepDoc({ filePath: 'expenses/2026/06/mine.pdf' });
    expenseFindByIdMock.mockResolvedValue(keep);
    expenseFindDropsMock.mockResolvedValue([dropDoc({ _id: 'd1', filePath: 'expenses/2026/06/theirs.pdf' })]);
    await mergeExpenses('keep1', ['d1']);
    expect(keep.filePath).toBe('expenses/2026/06/mine.pdf');
    const set = (expenseUpdateOne.mock.calls[0][1] as any).$set;
    expect(set.filePath).toBeUndefined();
  });

  it('refreshes both money tabs and the reports', async () => {
    expenseFindByIdMock.mockResolvedValue(keepDoc());
    expenseFindDropsMock.mockResolvedValue([dropDoc()]);
    await mergeExpenses('keep1', ['drop1']);
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain('/expenses');
    expect(paths).toContain('/income');
    expect(paths).toContain('/reports');
  });

  it('reports a database failure instead of throwing at the client', async () => {
    expenseFindByIdMock.mockRejectedValue(new Error('connection lost'));
    expect(await mergeExpenses('keep1', ['drop1'])).toEqual({ ok: false, merged: 0, error: 'connection lost' });
  });
});

describe('mergeExpenses and the money it was paid with (#168)', () => {
  const split = [{ method: 'Cash', amount: 50 }];

  it('adopts the payment split from a dropped copy when the survivor has none', async () => {
    const keep = keepDoc({ paymentSplits: [] });
    expenseFindByIdMock.mockResolvedValue(keep);
    expenseFindDropsMock.mockResolvedValue([dropDoc({ paymentSplits: split })]);
    await mergeExpenses('keep1', ['drop1']);
    expect(keep.paymentSplits).toEqual(split);
  });

  it('never overwrites a split the survivor already has', async () => {
    const own = [{ method: 'Visa', amount: 20 }];
    const keep = keepDoc({ paymentSplits: own });
    expenseFindByIdMock.mockResolvedValue(keep);
    expenseFindDropsMock.mockResolvedValue([dropDoc({ paymentSplits: split })]);
    await mergeExpenses('keep1', ['drop1']);
    expect(keep.paymentSplits).toEqual(own);
  });
});
