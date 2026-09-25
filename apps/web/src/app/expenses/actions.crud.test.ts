import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/expenses/actions.ts is a large multi-concern module (621 lines: manual CRUD, AI
// scan/upload/rescan, recurring auto-generation, CSV import, category-rule backfill). This
// file covers ONLY the plain manual-entry CRUD slice, the most isolated concern —
// updateExpense/addExpense/deleteExpense/settlePerson. The AI scan/upload/rescan pipeline,
// generateDueRecurring, importExpensesCsv, and applyCategoryRulesToExisting are separate
// concerns left for their own focused test files in later runs.
//
// Unlike the other already-tested action modules, this one is tenancy-wrapped (P-series SaaS
// migration): every export runs inside `withRequestTenant(...)` and reads its model via
// `currentModel(ExpenseModel)` instead of touching the Mongoose model directly. In self-hosted
// (SAAS_MODE off) mode `withRequestTenant` is a pass-through and `currentModel` resolves to the
// default-connection model, so both are mocked here as trivial pass-throughs — this file does
// NOT re-test tenant isolation itself (already covered by lib/tenancy/*.tenant.test.ts).
//
// Behaviour pinned:
//  - updateExpense: Zod `UpdateSchema` (date is the only required field, everything else
//    defaults) sets fields directly (no category-rule/inherit logic — that's create-only).
//    vendorKey/cleanSplit/safeDate are left un-mocked (pure/deterministic, already pinned in
//    their own test files) so real normalization is exercised end-to-end.
//  - addExpense: category resolution chain is explicit-category > vendor rule > inherited
//    series > 'other' (explicit only counts when it's not the form default 'other'); same
//    priority chain for recurring/recurringCycle; space/taxCategory fall back to the inherited
//    series when the form left them blank. recurring/taxDeductible are tri-state (#252): left
//    out (AI tool, bill/sale logging) they come from the rule/series; an explicit false (the
//    form) is kept. Always creates verified:true.
//  - deleteExpense: soft delete ($set deletedAt), never hard-deletes.
//  - settlePerson: marks every unsettled split entry matching the name (case-insensitive,
//    trimmed) as settled across ALL expenses; a bulkWrite only fires when something actually
//    changed; blank name is rejected before touching the DB.

const {
  connectDBMock,
  expenseCreate,
  expenseUpdateOne,
  expenseFindOneSortLean,
  expenseFindSelectLean,
  expenseBulkWrite,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  expenseCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'e1' })),
  expenseUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  expenseFindOneSortLean: vi.fn(async () => null as Record<string, any> | null),
  expenseFindSelectLean: vi.fn(async () => [] as Array<Record<string, any>>),
  expenseBulkWrite: vi.fn(async (_ops: any) => ({})),
  getAppSettingsMock: vi.fn(async () => ({ categoryRules: [] as any[] })),
  revalidatePathMock: vi.fn(),
}));

const expenseModel = {
  create: expenseCreate,
  updateOne: expenseUpdateOne,
  findOne: () => ({ sort: () => ({ lean: expenseFindOneSortLean }) }),
  find: () => ({ select: () => ({ lean: expenseFindSelectLean }) }),
  bulkWrite: expenseBulkWrite,
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
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/csvImport', () => ({ csvDedupeKey: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { updateExpense, addExpense, deleteExpense, settlePerson } from './actions';

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const RULE_DEI = { id: 'r1', match: 'ΔΕΗ', matchType: 'vendor' as const, category: 'utilities', recurring: true, recurringCycle: 'monthly' as const };

beforeEach(() => {
  vi.clearAllMocks();
  expenseFindOneSortLean.mockResolvedValue(null);
  expenseFindSelectLean.mockResolvedValue([]);
  getAppSettingsMock.mockResolvedValue({ categoryRules: [] });
});

describe('updateExpense', () => {
  it('rejects a missing date before touching the DB (the only required field)', async () => {
    const res = await updateExpense('e1', { vendor: 'ΔΕΗ' } as any);
    expect(res).toEqual({ ok: false, error: 'Invalid data' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(expenseUpdateOne).not.toHaveBeenCalled();
  });

  it('applies schema defaults and sets fields directly (no rule/inherit logic)', async () => {
    const res = await updateExpense('e1', { date: '2026-06-15' } as any);
    expect(res).toEqual({ ok: true });
    expect(expenseUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = expenseUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'e1' });
    const set = update.$set;
    expect(set.kind).toBe('expense');
    expect(set.vendor).toBe('');
    expect(set.vendorKey).toBe('');
    expect(set.category).toBe('other');
    expect(set.space).toBe('');
    expect(set.taxDeductible).toBe(false);
    expect(set.amount).toBe(0);
    expect(set.currency).toBe('EUR');
    expect(set.recurringCycle).toBe('');
    expect(set.split).toEqual([]);
    expect(set.verified).toBe(false);
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('computes vendorKey from the vendor via the real normalizer', async () => {
    await updateExpense('e1', { date: '2026-06-15', vendor: 'ΔΕΗ' } as any);
    const set = expenseUpdateOne.mock.calls[0][1].$set;
    expect(set.vendor).toBe('ΔΕΗ');
    expect(set.vendorKey).toBe('dei');
  });

  it('falls back to a derived period only when the form period is blank', async () => {
    await updateExpense('e1', { date: '2026-06-15', period: '' } as any);
    expect(expenseUpdateOne.mock.calls[0][1].$set.period).toBe('2026-06');

    expenseUpdateOne.mockClear();
    await updateExpense('e1', { date: '2026-06-15', period: '2026-05' } as any);
    expect(expenseUpdateOne.mock.calls[0][1].$set.period).toBe('2026-05');
  });

  it('trims space/taxCategory and cleans the split array via the real cleanSplit', async () => {
    await updateExpense('e1', {
      date: '2026-06-15',
      space: '  cottage  ',
      taxCategory: '  medical  ',
      split: [
        { name: '  Maria  ', share: 12.345, settled: false },
        { name: '   ', share: 5, settled: false }, // blank name -> dropped
      ],
    } as any);
    const set = expenseUpdateOne.mock.calls[0][1].$set;
    expect(set.space).toBe('cottage');
    expect(set.taxCategory).toBe('medical');
    expect(set.split).toEqual([{ name: 'Maria', share: 12.35, settled: false }]);
  });

  it('parses a European day-first date via the real safeDate', async () => {
    await updateExpense('e1', { date: '31/12/2026' } as any);
    const set = expenseUpdateOne.mock.calls[0][1].$set;
    expect(localYmd(set.date as Date)).toBe('2026-12-31');
  });

  it('returns a friendly error when the DB write throws', async () => {
    expenseUpdateOne.mockRejectedValueOnce(new Error('connection lost'));
    const res = await updateExpense('e1', { date: '2026-06-15' } as any);
    expect(res).toEqual({ ok: false, error: 'connection lost' });
  });
});

// Multi-currency (P9). The conversion rule itself is pinned in lib/fx.test.ts; what matters
// here is that BOTH write paths actually run the submitted amount through resolveFx against
// the deployment's base currency, so `amount` in the DB is always base-denominated.
describe('multi-currency (resolveFx wiring)', () => {
  it('converts a foreign amount to the base currency on update, keeping the printed side', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ categoryRules: [], currency: 'EUR' } as any);
    await updateExpense('e1', { date: '2026-06-15', amount: 88, currency: 'USD', fxRate: 0.92 } as any);
    const set = expenseUpdateOne.mock.calls[0][1].$set;
    expect(set.amount).toBe(80.96); // 88 x 0.92, what every aggregation will sum
    expect(set.currency).toBe('USD');
    expect(set.origAmount).toBe(88);
    expect(set.fxRate).toBe(0.92);
  });

  it('leaves a foreign amount alone (no silent 1:1) when no rate was given', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ categoryRules: [], currency: 'EUR' } as any);
    await updateExpense('e1', { date: '2026-06-15', amount: 88, currency: 'USD' } as any);
    const set = expenseUpdateOne.mock.calls[0][1].$set;
    expect(set.amount).toBe(88);
    expect(set.origAmount).toBe(88);
    expect(set.fxRate).toBe(0);
  });

  it('treats an entry in the base currency as plain, whatever base that is', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ categoryRules: [], currency: 'USD' } as any);
    await updateExpense('e1', { date: '2026-06-15', amount: 88, currency: 'USD', fxRate: 0.92 } as any);
    const set = expenseUpdateOne.mock.calls[0][1].$set;
    expect(set.amount).toBe(88); // the stray rate is ignored, not applied
    expect(set.origAmount).toBe(0);
    expect(set.fxRate).toBe(0);
  });

  it('converts on create too', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ categoryRules: [], currency: 'EUR' } as any);
    await addExpense({ date: '2026-06-15', amount: 200, currency: 'GBP', fxRate: 1.15 } as any);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.amount).toBe(230);
    expect(doc.currency).toBe('GBP');
    expect(doc.origAmount).toBe(200);
    expect(doc.fxRate).toBe(1.15);
  });

  it('stores nothing FX-related for an ordinary single-currency entry', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ categoryRules: [], currency: 'EUR' } as any);
    await addExpense({ date: '2026-06-15', amount: 42.5 } as any);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.amount).toBe(42.5);
    expect(doc.currency).toBe('EUR');
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
  });
});

describe('addExpense', () => {
  it('rejects a missing date before touching the DB', async () => {
    const res = await addExpense({ vendor: 'ΔΕΗ' } as any);
    expect(res).toEqual({ ok: false, error: 'Invalid data' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('creates a verified:true record with schema defaults', async () => {
    const res = await addExpense({ date: '2026-06-15' } as any);
    expect(res).toEqual({ ok: true, id: 'e1' });
    expect(expenseCreate).toHaveBeenCalledTimes(1);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.verified).toBe(true);
    expect(doc.category).toBe('other');
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('an explicit (non-"other") category wins over both a matching rule and the inherited series', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindOneSortLean.mockResolvedValue({ category: 'from-series', recurring: false });
    const doc0 = await addExpense({ date: '2026-06-15', vendor: 'ΔΕΗ', category: 'travel' } as any);
    expect(doc0.ok).toBe(true);
    expect(expenseCreate.mock.calls[0][0].category).toBe('travel');
  });

  it('falls back to a matching vendor rule when the form category is the default "other"', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindOneSortLean.mockResolvedValue({ category: 'from-series', recurring: false });
    await addExpense({ date: '2026-06-15', vendor: 'ΔΕΗ', category: 'other' } as any);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.category).toBe('utilities');
    // with the flag left out (a caller that never asked), the rule marks it recurring/monthly
    expect(doc.recurring).toBe(true);
    expect(doc.recurringCycle).toBe('monthly');
  });

  it('falls back to the inherited series category when no rule matches', async () => {
    expenseFindOneSortLean.mockResolvedValue({ category: 'utilities-inherited', recurring: true, recurringCycle: 'quarterly', space: 'cottage', taxDeductible: true, taxCategory: 'medical' });
    await addExpense({ date: '2026-06-15', vendor: 'Unknown Vendor', category: 'other' } as any);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.category).toBe('utilities-inherited');
    expect(doc.recurring).toBe(true);
    expect(doc.recurringCycle).toBe('quarterly');
    expect(doc.space).toBe('cottage');
    expect(doc.taxDeductible).toBe(true);
    expect(doc.taxCategory).toBe('medical');
  });

  it('defaults to "other" when there is neither a rule nor a prior series', async () => {
    await addExpense({ date: '2026-06-15', vendor: 'Brand New Vendor', category: 'other' } as any);
    expect(expenseCreate.mock.calls[0][0].category).toBe('other');
  });

  it('prefers the form space/taxDeductible/taxCategory over the inherited series when the form set them', async () => {
    expenseFindOneSortLean.mockResolvedValue({ category: 'other', space: 'from-series', taxDeductible: true, taxCategory: 'from-series-tax' });
    await addExpense({ date: '2026-06-15', vendor: 'ΔΕΗ', space: 'main house', taxDeductible: false, taxCategory: 'utilities-tax' } as any);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.space).toBe('main house');
    expect(doc.taxCategory).toBe('utilities-tax');
    expect(doc.taxDeductible).toBe(false);
  });

  it('keeps an explicit recurring:false over both a matching rule and the series (#252)', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindOneSortLean.mockResolvedValue({ category: 'from-series', recurring: true, recurringCycle: 'quarterly', taxDeductible: true });
    await addExpense({ date: '2026-06-15', vendor: 'ΔΕΗ', category: 'other', recurring: false, recurringCycle: '', taxDeductible: false } as any);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.category).toBe('utilities'); // the rule still picks the category
    expect(doc.recurring).toBe(false);
    expect(doc.recurringCycle).toBe('');
    expect(doc.taxDeductible).toBe(false);
  });

  it('an explicit recurring:true without a cycle still takes the cycle from the rule', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    await addExpense({ date: '2026-06-15', vendor: 'ΔΕΗ', category: 'other', recurring: true } as any);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.recurring).toBe(true);
    expect(doc.recurringCycle).toBe('monthly');
  });

  it('returns a friendly error when the DB write throws', async () => {
    expenseCreate.mockRejectedValueOnce(new Error('duplicate key'));
    const res = await addExpense({ date: '2026-06-15' } as any);
    expect(res).toEqual({ ok: false, error: 'duplicate key' });
  });
});

describe('deleteExpense', () => {
  it('soft-deletes by setting deletedAt, never hard-deleting', async () => {
    const res = await deleteExpense('e1');
    expect(res).toEqual({ ok: true });
    expect(expenseUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = expenseUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'e1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('swallows a DB error and reports ok:false', async () => {
    expenseUpdateOne.mockRejectedValueOnce(new Error('boom'));
    const res = await deleteExpense('e1');
    expect(res).toEqual({ ok: false });
  });
});

describe('settlePerson', () => {
  it('rejects a blank name before touching the DB', async () => {
    const res = await settlePerson('   ');
    expect(res).toEqual({ ok: false, settled: 0, error: 'No name' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('settles every unsettled entry matching the name, case-insensitively and trimmed', async () => {
    expenseFindSelectLean.mockResolvedValue([
      { _id: 'x1', split: [{ name: '  Maria  ', share: 20, settled: false }, { name: 'John', share: 10, settled: false }] },
      { _id: 'x2', split: [{ name: 'MARIA', share: 15, settled: false }] },
      { _id: 'x3', split: [{ name: 'Maria', share: 5, settled: true }] }, // already settled -> not recounted
    ]);
    const res = await settlePerson('maria');
    expect(res).toEqual({ ok: true, settled: 2 });
    expect(expenseBulkWrite).toHaveBeenCalledTimes(1);
    const ops = expenseBulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(2); // x1 and x2 changed; x3 untouched (no unsettled match)
    const x1Op = ops.find((o: any) => o.updateOne.filter._id === 'x1');
    expect(x1Op.updateOne.update.$set.split).toEqual([
      { name: '  Maria  ', share: 20, settled: true },
      { name: 'John', share: 10, settled: false },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('skips the bulkWrite entirely when nothing matches', async () => {
    expenseFindSelectLean.mockResolvedValue([{ _id: 'x1', split: [{ name: 'John', share: 10, settled: false }] }]);
    const res = await settlePerson('maria');
    expect(res).toEqual({ ok: true, settled: 0 });
    expect(expenseBulkWrite).not.toHaveBeenCalled();
  });

  it('returns a friendly error when the query throws', async () => {
    expenseFindSelectLean.mockRejectedValueOnce(new Error('read timeout'));
    const res = await settlePerson('maria');
    expect(res).toEqual({ ok: false, settled: 0, error: 'read timeout' });
  });
});
