import { describe, it, expect, vi, beforeEach } from 'vitest';

// Focused coverage for `importExpensesCsv` (the bank/generic CSV import slice of
// app/expenses/actions.ts, PA1). The manual CRUD, AI scan/upload/rescan, recurring
// auto-generation and category-rule-backfill concerns of the same module each have
// their own test file (actions.crud/.scan/.recurring.test.ts); this one covers ONLY
// the CSV batch importer.
//
// Behaviour pinned:
//  - Guard clauses run BEFORE any DB call: empty/non-array rows, >500 rows (per-call
//    cap), and Zod schema failures (bad date shape, non-finite amount, missing vendor)
//    all short-circuit with a friendly error and zero connectDB/find/insertMany calls.
//  - `signSplit`: when true, each row's OWN sign picks kind (negative → expense,
//    positive → income) and `opts.kind` is ignored; when false, every row gets
//    `opts.kind`. Either way the stored amount is always `Math.abs(amount)`.
//  - Existing-record dedupe: one bounded `find({date:{$gte,$lt}})` query over the
//    whole batch's date range (min..max+1day), matched via the REAL `csvDedupeKey`
//    (kind|vendorKey|date|amount) — a duplicate of an already-stored row is skipped,
//    not re-inserted.
//  - Intra-batch dedupe: two rows in the SAME call that collide on the same key only
//    insert the first; the rest count toward `skippedDupes` too.
//  - Category/recurring resolution only runs when the CSV row left `category` blank:
//    explicit row category always wins outright (no rule/inherited lookup at all);
//    otherwise a matching vendor category-rule (real `matchCategoryRule`) wins over
//    the inherited-from-series value (real `Expense.findOne(...).sort(...).lean()`
//    per unique kind+vendorKey, cached so repeats don't re-query); falls back to
//    'other' when neither exists. Same priority chain for recurring/recurringCycle.
//  - Every imported row is always `verified:true, aiModel:'csv-import'` — deterministic
//    bank data, never enters an AI review queue.
//  - `insertMany` is skipped entirely (never called) when every row in the batch was
//    a dupe; revalidatePath('/expenses'+'/income') fires on every success path
//    regardless of how many rows actually got imported.
//  - DB/query errors are caught and reported as `{ok:false, error: message}`.
//
// Like the other action-module test files, this one is tenancy-wrapped: every export
// runs inside `withRequestTenant(...)` and reads its model via `currentModel(ExpenseModel)`,
// both mocked here as trivial pass-throughs (self-hosted / SAAS_MODE-off shape).
// `csvDedupeKey` (lib/csvImport) and `matchCategoryRule` (lib/categoryRules) are left
// UN-mocked: both are pure/deterministic and already have their own pinned test files,
// so exercising the real implementations here is more realistic than re-stubbing them.

const {
  connectDBMock,
  expenseFind,
  expenseFindLean,
  expenseFindOne,
  expenseFindOneLean,
  expenseInsertMany,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  const expenseFindLean = vi.fn(async () => [] as Array<Record<string, any>>);
  const expenseFindOneLean = vi.fn(async () => null as Record<string, any> | null);
  return {
    connectDBMock: vi.fn(async () => {}),
    expenseFind: vi.fn((_filter: Record<string, any>) => ({ select: () => ({ lean: expenseFindLean }) })),
    expenseFindLean,
    expenseFindOne: vi.fn((_filter: Record<string, any>) => ({ sort: () => ({ lean: expenseFindOneLean }) })),
    expenseFindOneLean,
    expenseInsertMany: vi.fn(async (_docs: any[]) => ({})),
    getAppSettingsMock: vi.fn(async () => ({ categoryRules: [] as any[] })),
    revalidatePathMock: vi.fn(),
  };
});

const expenseModel = {
  find: expenseFind,
  findOne: expenseFindOne,
  insertMany: expenseInsertMany,
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
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { importExpensesCsv } from './actions';

const RULE_DEI = { id: 'r1', match: 'ΔΕΗ', matchType: 'vendor' as const, category: 'utilities', recurring: true, recurringCycle: 'monthly' as const };

function row(over: Partial<{ vendor: string; amount: number; date: string; category: string; notes: string }> = {}) {
  return { vendor: 'ΔΕΗ', amount: 45.9, date: '2026-06-15', category: '', notes: '', ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  expenseFindLean.mockResolvedValue([]);
  expenseFindOneLean.mockResolvedValue(null);
  getAppSettingsMock.mockResolvedValue({ categoryRules: [] });
});

describe('importExpensesCsv — guard clauses', () => {
  it('rejects an empty rows array before touching the DB', async () => {
    const res = await importExpensesCsv([], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'No rows to import' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects a non-array rows argument', async () => {
    const res = await importExpensesCsv(null as any, { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'No rows to import' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects more than the 500-row per-call cap before touching the DB', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => row({ vendor: `V${i}`, date: '2026-06-15' }));
    const res = await importExpensesCsv(rows, { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'Too many rows (max 500 per batch)' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('accepts exactly 500 rows (the cap is inclusive)', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => row({ vendor: `V${i}`, amount: i + 1 }));
    const res = await importExpensesCsv(rows, { kind: 'expense', signSplit: false });
    expect(res.ok).toBe(true);
  });

  it('rejects rows that fail Zod validation (bad date shape) before touching the DB', async () => {
    const res = await importExpensesCsv([row({ date: '15/06/2026' })], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'Invalid rows' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects rows with a non-finite amount', async () => {
    const res = await importExpensesCsv([row({ amount: NaN })], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'Invalid rows' });
  });

  it('rejects rows with a blank vendor', async () => {
    const res = await importExpensesCsv([row({ vendor: '' })], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'Invalid rows' });
  });
});

describe('importExpensesCsv — sign / kind routing', () => {
  it('signSplit:true routes a negative amount to expense and a positive one to income, both stored as positive', async () => {
    const res = await importExpensesCsv(
      [row({ vendor: 'A', amount: -45.9 }), row({ vendor: 'B', amount: 100 })],
      { kind: 'expense', signSplit: true }
    );
    expect(res).toEqual({ ok: true, imported: 2, skippedDupes: 0 });
    const docs = expenseInsertMany.mock.calls[0][0];
    const a = docs.find((d: any) => d.vendor === 'A');
    const b = docs.find((d: any) => d.vendor === 'B');
    expect(a.kind).toBe('expense');
    expect(a.amount).toBe(45.9);
    expect(b.kind).toBe('income');
    expect(b.amount).toBe(100);
  });

  it('signSplit:false forces every row to opts.kind regardless of sign, amount still stored positive', async () => {
    const res = await importExpensesCsv([row({ amount: -45.9 })], { kind: 'income', signSplit: false });
    expect(res.ok).toBe(true);
    const doc = expenseInsertMany.mock.calls[0][0][0];
    expect(doc.kind).toBe('income');
    expect(doc.amount).toBe(45.9);
  });
});

describe('importExpensesCsv — existing-record dedupe', () => {
  it('skips a row that matches an existing record via the real csvDedupeKey', async () => {
    expenseFindLean.mockResolvedValue([
      { kind: 'expense', vendorKey: 'dei', date: '2026-06-15T00:00:00.000Z', amount: 45.9 },
    ]);
    const res = await importExpensesCsv([row()], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: true, imported: 0, skippedDupes: 1 });
    expect(expenseInsertMany).not.toHaveBeenCalled();
  });

  it('does not skip when kind, vendorKey, date or amount differ from the existing record', async () => {
    expenseFindLean.mockResolvedValue([
      { kind: 'income', vendorKey: 'dei', date: '2026-06-15T00:00:00.000Z', amount: 45.9 },
    ]);
    const res = await importExpensesCsv([row()], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: true, imported: 1, skippedDupes: 0 });
  });

  it('bounds the existing-record query to the batch date range (min..max+1day)', async () => {
    await importExpensesCsv(
      [row({ vendor: 'A', date: '2026-06-10' }), row({ vendor: 'B', date: '2026-06-20' })],
      { kind: 'expense', signSplit: false }
    );
    expect(expenseFind).toHaveBeenCalledTimes(1);
    const filter = expenseFind.mock.calls[0][0];
    expect(filter.date.$gte.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(filter.date.$lt.toISOString()).toBe('2026-06-21T00:00:00.000Z');
  });
});

describe('importExpensesCsv — intra-batch dedupe', () => {
  it('imports only the first of two identical rows in the same batch, counting the rest as skipped', async () => {
    const res = await importExpensesCsv([row(), row()], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: true, imported: 1, skippedDupes: 1 });
    expect(expenseInsertMany.mock.calls[0][0]).toHaveLength(1);
  });

  it('never calls insertMany when every row in the batch is a dupe of an existing record', async () => {
    expenseFindLean.mockResolvedValue([
      { kind: 'expense', vendorKey: 'dei', date: '2026-06-15T00:00:00.000Z', amount: 45.9 },
    ]);
    const res = await importExpensesCsv([row(), row()], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: true, imported: 0, skippedDupes: 2 });
    expect(expenseInsertMany).not.toHaveBeenCalled();
    // still revalidates even though nothing was actually written
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });
});

describe('importExpensesCsv — category/recurring resolution chain', () => {
  it('an explicit row category wins outright, skipping both the rule and series lookup', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindOneLean.mockResolvedValue({ category: 'from-series', recurring: true, recurringCycle: 'yearly' });
    const res = await importExpensesCsv([row({ category: 'travel' })], { kind: 'expense', signSplit: false });
    expect(res.ok).toBe(true);
    const doc = expenseInsertMany.mock.calls[0][0][0];
    expect(doc.category).toBe('travel');
    expect(doc.recurring).toBe(false); // no rule/inherit consulted at all
    expect(expenseFindOne).not.toHaveBeenCalled();
  });

  it('a matching vendor rule wins over the inherited series when the row category is blank', async () => {
    getAppSettingsMock.mockResolvedValue({ categoryRules: [RULE_DEI] });
    expenseFindOneLean.mockResolvedValue({ category: 'from-series', recurring: false, recurringCycle: '' });
    const res = await importExpensesCsv([row({ category: '' })], { kind: 'expense', signSplit: false });
    expect(res.ok).toBe(true);
    const doc = expenseInsertMany.mock.calls[0][0][0];
    expect(doc.category).toBe('utilities');
    expect(doc.recurring).toBe(true);
    expect(doc.recurringCycle).toBe('monthly');
  });

  it('falls back to the inherited series when no rule matches', async () => {
    expenseFindOneLean.mockResolvedValue({ category: 'utilities-inherited', recurring: true, recurringCycle: 'quarterly' });
    const res = await importExpensesCsv([row({ vendor: 'Unknown Vendor', category: '' })], { kind: 'expense', signSplit: false });
    const doc = expenseInsertMany.mock.calls[0][0][0];
    expect(doc.category).toBe('utilities-inherited');
    expect(doc.recurring).toBe(true);
    expect(doc.recurringCycle).toBe('quarterly');
  });

  it('defaults to "other" / not-recurring when neither a rule nor a prior series exists', async () => {
    const res = await importExpensesCsv([row({ vendor: 'Brand New Vendor', category: '' })], { kind: 'expense', signSplit: false });
    const doc = expenseInsertMany.mock.calls[0][0][0];
    expect(doc.category).toBe('other');
    expect(doc.recurring).toBe(false);
    expect(doc.recurringCycle).toBe('');
  });

  it('caches the inherited-series lookup per unique kind+vendorKey (one findOne for two same-vendor rows)', async () => {
    await importExpensesCsv(
      [row({ vendor: 'ΔΕΗ', date: '2026-06-10', category: '' }), row({ vendor: 'ΔΕΗ', date: '2026-06-11', category: '' })],
      { kind: 'expense', signSplit: false }
    );
    expect(expenseFindOne).toHaveBeenCalledTimes(1);
  });
});

describe('importExpensesCsv — record shape', () => {
  it('always stores verified:true and aiModel:csv-import (deterministic, no AI review queue)', async () => {
    await importExpensesCsv([row()], { kind: 'expense', signSplit: false });
    const doc = expenseInsertMany.mock.calls[0][0][0];
    expect(doc.verified).toBe(true);
    expect(doc.aiModel).toBe('csv-import');
  });

  it('derives vendorKey via the real normalizer and period from the row date', async () => {
    await importExpensesCsv([row({ vendor: 'ΔΕΗ', date: '2026-03-05' })], { kind: 'expense', signSplit: false });
    const doc = expenseInsertMany.mock.calls[0][0][0];
    expect(doc.vendorKey).toBe('dei');
    expect(doc.period).toBe('2026-03');
  });
});

describe('importExpensesCsv — error handling', () => {
  it('returns a friendly error when the existing-record query throws', async () => {
    expenseFindLean.mockRejectedValueOnce(new Error('connection lost'));
    const res = await importExpensesCsv([row()], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'connection lost' });
  });

  it('returns a friendly error when insertMany throws', async () => {
    expenseInsertMany.mockRejectedValueOnce(new Error('duplicate key'));
    const res = await importExpensesCsv([row()], { kind: 'expense', signSplit: false });
    expect(res).toEqual({ ok: false, error: 'duplicate key' });
  });
});
