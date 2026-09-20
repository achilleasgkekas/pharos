import { describe, it, expect, vi, beforeEach } from 'vitest';

// P78 — bulk field-edit for Expenses/Income (bulkUpdateExpenses). Category-only: unlike the
// Items equivalent (bulkUpdateItems), this does NOT also bulk-add tags — `Expense`
// (models/Expense.ts) has no `tags` field at all, see the action's own doc comment for why that
// scope was cut rather than growing the schema for an "S" item.
//
// Behaviour pinned:
//  - ids are deduped and falsy entries dropped before any DB call.
//  - empty (post-dedup) ids -> {ok:false, updated:0, error:'No records selected'}, no DB call.
//  - category is trimmed; empty/whitespace-only -> {ok:false, updated:0, error:'Nothing to
//    update'}, no DB call (there is nothing else bulk-editable to fall back to here).
//  - the Mongo update is exactly ONE `updateMany({_id:{$in:ids}, kind}, {$set:{category}})` —
//    `kind` is ALWAYS included in the filter (same defensive habit as mergeExpenses: an
//    Income-tab bulk edit can never touch an expense row, whatever ids were sent).
//  - revalidates /expenses AND /income (both tabs read the same collection).
//  - returns {ok:true, updated: res.modifiedCount} on success; a thrown error is caught and
//    returned as {ok:false, updated:0, error: message}, same try/catch idiom as mergeExpenses.

const { connectDBMock, expenseUpdateMany, revalidatePathMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  expenseUpdateMany: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({ modifiedCount: 0 }) as { modifiedCount?: number }),
  revalidatePathMock: vi.fn(),
}));

const expenseModel = { exists: vi.fn(async () => false), updateMany: expenseUpdateMany };

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

import { bulkUpdateExpenses } from './actions';

const ID1 = 'exp1';
const ID2 = 'exp2';

beforeEach(() => {
  vi.clearAllMocks();
  expenseUpdateMany.mockImplementation(async () => ({ modifiedCount: 2 }));
});

describe('bulkUpdateExpenses', () => {
  it('no ids -> "No records selected", never touches the DB', async () => {
    const res = await bulkUpdateExpenses([], { category: 'utilities' }, 'expense');
    expect(res).toEqual({ ok: false, updated: 0, error: 'No records selected' });
    expect(expenseUpdateMany).not.toHaveBeenCalled();
  });

  it('falsy/duplicate ids are filtered before the DB call', async () => {
    await bulkUpdateExpenses([ID1, '', ID1, ID2], { category: 'utilities' }, 'expense');
    expect(expenseUpdateMany).toHaveBeenCalledTimes(1);
    const [filter] = expenseUpdateMany.mock.calls[0];
    expect(filter._id.$in.sort()).toEqual([ID1, ID2].sort());
  });

  it('no category -> "Nothing to update", never touches the DB', async () => {
    const res = await bulkUpdateExpenses([ID1], {}, 'expense');
    expect(res).toEqual({ ok: false, updated: 0, error: 'Nothing to update' });
    expect(expenseUpdateMany).not.toHaveBeenCalled();
  });

  it('a whitespace-only category -> "Nothing to update", never touches the DB', async () => {
    const res = await bulkUpdateExpenses([ID1], { category: '   ' }, 'expense');
    expect(res).toEqual({ ok: false, updated: 0, error: 'Nothing to update' });
    expect(expenseUpdateMany).not.toHaveBeenCalled();
  });

  it('always filters by kind, so an income-tab edit can never touch an expense row', async () => {
    await bulkUpdateExpenses([ID1], { category: 'salary' }, 'income');
    const [filter, update] = expenseUpdateMany.mock.calls[0];
    expect(filter).toEqual({ _id: { $in: [ID1] }, kind: 'income' });
    expect(update).toEqual({ $set: { category: 'salary' } });
  });

  it('the expense-kind call filters kind:"expense"', async () => {
    await bulkUpdateExpenses([ID1], { category: 'utilities' }, 'expense');
    const [filter] = expenseUpdateMany.mock.calls[0];
    expect(filter).toEqual({ _id: { $in: [ID1] }, kind: 'expense' });
  });

  it('revalidates /expenses and /income on success', async () => {
    await bulkUpdateExpenses([ID1], { category: 'utilities' }, 'expense');
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('returns {ok:true, updated: modifiedCount} from the real Mongo result', async () => {
    expenseUpdateMany.mockResolvedValueOnce({ modifiedCount: 5 });
    const res = await bulkUpdateExpenses([ID1, ID2], { category: 'utilities' }, 'expense');
    expect(res).toEqual({ ok: true, updated: 5 });
  });

  it('falls back to targets.length when modifiedCount is missing from the driver result', async () => {
    expenseUpdateMany.mockResolvedValueOnce({});
    const res = await bulkUpdateExpenses([ID1, ID2], { category: 'utilities' }, 'expense');
    expect(res).toEqual({ ok: true, updated: 2 });
  });

  it('a thrown error is caught and returned, not propagated (same idiom as mergeExpenses)', async () => {
    expenseUpdateMany.mockRejectedValueOnce(new Error('boom'));
    const res = await bulkUpdateExpenses([ID1], { category: 'utilities' }, 'expense');
    expect(res).toEqual({ ok: false, updated: 0, error: 'boom' });
  });
});
