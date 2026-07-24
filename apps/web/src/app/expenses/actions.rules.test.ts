import { describe, it, expect, vi, beforeEach } from 'vitest';

// Focused coverage for `applyCategoryRulesToExisting` (the category-rule backfill slice
// of app/expenses/actions.ts, P15's "apply to what I already have" one-off). The manual
// CRUD, AI scan/upload/rescan, recurring auto-generation and CSV import concerns of the
// same module each have their own test file (actions.crud/.scan/.recurring/.csv.test.ts);
// this is the fifth and last slice, closing out coverage of the whole module.
//
// Behaviour pinned:
//  - connectDB() always runs first (even with zero configured rules); when
//    `getAppSettings().categoryRules` is empty, returns {ok:true, updated:0} WITHOUT ever
//    touching the Expense model (no find, no bulkWrite) — the model is only resolved
//    after the empty-rules early return.
//  - The candidate query targets only uncategorised rows: category is 'other', '', or
//    missing ($exists:false), selecting just the fields the rule-match + delta need
//    (vendor notes category recurring recurringCycle), .lean().
//  - Per row: `matchCategoryRule` (real implementation, already pinned in its own
//    categoryRules.test.ts) picks the first matching rule. No match → row skipped
//    entirely (no bulkWrite op). A match whose category equals the row's CURRENT
//    category also gets skipped (`continue` before building the op) — a no-op rewrite
//    never happens even though a rule "matched".
//  - When a real change applies: `$set.category` always gets the rule's category.
//    `recurring`/`recurringCycle` are added to the same $set ONLY when the rule wants
//    recurring AND the row isn't already recurring (`rule.recurring && !r.recurring`);
//    `recurringCycle` is included only when the rule specifies a non-empty cycle. A row
//    that is already recurring keeps its own recurring/cycle untouched even if the
//    matched rule also wants recurring.
//  - `bulkWrite` is called at most once, with one updateOne op per changed row, and is
//    skipped entirely when zero rows actually changed.
//  - revalidatePath('/expenses' + '/income' + '/reports') fires unconditionally on every
//    success path, including the zero-updates case.
//  - Any thrown error (connectDB, getAppSettings, find, bulkWrite) is caught and reported
//    as {ok:false, updated:0, error: message}.
//
// Like the other action-module test files, this one is tenancy-wrapped: the export runs
// inside `withRequestTenant(...)` and reads its model via `currentModel(ExpenseModel)`,
// both mocked here as trivial pass-throughs (self-hosted / SAAS_MODE-off shape).
// `matchCategoryRule` (lib/categoryRules) is left UN-mocked: it's pure/deterministic and
// already has its own pinned test file, so exercising the real implementation here is
// more realistic than re-stubbing it (same idiom as actions.csv.test.ts).

const {
  connectDBMock,
  expenseFind,
  expenseSelect,
  expenseFindLean,
  expenseBulkWrite,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  const expenseFindLean = vi.fn(async () => [] as Array<Record<string, any>>);
  const expenseSelect = vi.fn((_proj: string) => ({ lean: expenseFindLean }));
  return {
    connectDBMock: vi.fn(async () => {}),
    expenseFind: vi.fn((_filter: Record<string, any>) => ({ select: expenseSelect })),
    expenseSelect,
    expenseFindLean,
    expenseBulkWrite: vi.fn(async (_ops: any[]) => ({})),
    getAppSettingsMock: vi.fn(async () => ({ categoryRules: [] as any[] })),
    revalidatePathMock: vi.fn(),
  };
});

const expenseModel = {
  find: expenseFind,
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

import { applyCategoryRulesToExisting } from './actions';

const RULE_DEI = { id: 'r1', match: 'ΔΕΗ', matchType: 'vendor' as const, category: 'utilities', recurring: true, recurringCycle: 'monthly' as const };
const RULE_NO_CYCLE = { id: 'r2', match: 'Netflix', matchType: 'vendor' as const, category: 'subscriptions', recurring: true, recurringCycle: '' as const };

function existingRow(over: Partial<{ _id: string; vendor: string; notes: string; category: string; recurring: boolean; recurringCycle: string }> = {}) {
  return { _id: 'e1', vendor: 'ΔΕΗ', notes: '', category: 'other', recurring: false, recurringCycle: '', ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  expenseFindLean.mockResolvedValue([]);
  expenseBulkWrite.mockResolvedValue({});
  getAppSettingsMock.mockResolvedValue({ categoryRules: [] });
});

describe('applyCategoryRulesToExisting — no rules configured', () => {
  it('returns updated:0 without ever touching the Expense model', async () => {
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: true, updated: 0 });
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(expenseFind).not.toHaveBeenCalled();
    expect(expenseBulkWrite).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('applyCategoryRulesToExisting — candidate query shape', () => {
  it('queries only uncategorised rows and selects the rule-match + delta fields', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    await applyCategoryRulesToExisting();
    expect(expenseFind).toHaveBeenCalledTimes(1);
    const filter = expenseFind.mock.calls[0][0];
    expect(filter).toEqual({ $or: [{ category: 'other' }, { category: '' }, { category: { $exists: false } }] });
    expect(expenseSelect).toHaveBeenCalledWith('vendor notes category recurring recurringCycle');
  });
});

describe('applyCategoryRulesToExisting — per-row rule matching', () => {
  it('recategorises a row when a rule matches and the category actually differs', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockResolvedValue([existingRow()]);
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: true, updated: 1 });
    expect(expenseBulkWrite).toHaveBeenCalledTimes(1);
    const ops = expenseBulkWrite.mock.calls[0][0];
    expect(ops).toEqual([
      { updateOne: { filter: { _id: 'e1' }, update: { $set: { category: 'utilities', recurring: true, recurringCycle: 'monthly' } } } },
    ]);
  });

  it('skips a row when no rule matches the vendor/notes', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockResolvedValue([existingRow({ _id: 'e2', vendor: 'Unrelated Vendor' })]);
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: true, updated: 0 });
    expect(expenseBulkWrite).not.toHaveBeenCalled();
  });

  it('skips a row whose matched rule category equals its current category (no-op rewrite avoided)', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockResolvedValue([existingRow({ category: 'utilities' })]);
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: true, updated: 0 });
    expect(expenseBulkWrite).not.toHaveBeenCalled();
  });

  it('processes multiple rows, building one op per row that actually changed', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockResolvedValue([
      existingRow({ _id: 'e1' }), // matches, changes
      existingRow({ _id: 'e2', vendor: 'Unrelated' }), // no match
      existingRow({ _id: 'e3', category: 'utilities' }), // matches, unchanged
    ]);
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: true, updated: 1 });
    const ops = expenseBulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter).toEqual({ _id: 'e1' });
  });
});

describe('applyCategoryRulesToExisting — recurring/recurringCycle delta', () => {
  it('does not touch recurring/recurringCycle when the row is already recurring', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockResolvedValue([existingRow({ recurring: true, recurringCycle: 'yearly' })]);
    await applyCategoryRulesToExisting();
    const ops = expenseBulkWrite.mock.calls[0][0];
    expect(ops[0].updateOne.update.$set).toEqual({ category: 'utilities' });
  });

  it('sets recurring:true without a recurringCycle key when the rule has no cycle', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_NO_CYCLE] });
    expenseFindLean.mockResolvedValue([existingRow({ vendor: 'Netflix', category: 'other' })]);
    await applyCategoryRulesToExisting();
    const ops = expenseBulkWrite.mock.calls[0][0];
    expect(ops[0].updateOne.update.$set).toEqual({ category: 'subscriptions', recurring: true });
  });
});

describe('applyCategoryRulesToExisting — revalidation', () => {
  it('revalidates expenses/income/reports even when nothing actually changed', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockResolvedValue([existingRow({ vendor: 'Unrelated' })]);
    const res = await applyCategoryRulesToExisting();
    expect(res.updated).toBe(0);
    expect(expenseBulkWrite).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
  });
});

describe('applyCategoryRulesToExisting — error handling', () => {
  it('returns a friendly error when connectDB throws', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('connection lost'));
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: false, updated: 0, error: 'connection lost' });
  });

  it('returns a friendly error when the candidate query throws', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockRejectedValueOnce(new Error('query failed'));
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: false, updated: 0, error: 'query failed' });
  });

  it('returns a friendly error when bulkWrite throws', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindLean.mockResolvedValue([existingRow()]);
    expenseBulkWrite.mockRejectedValueOnce(new Error('bulk write failed'));
    const res = await applyCategoryRulesToExisting();
    expect(res).toEqual({ ok: false, updated: 0, error: 'bulk write failed' });
  });
});
