import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// app/expenses/actions.ts is a large multi-concern module (621 lines). This file covers
// ONLY the recurring auto-generation concern — generateDueRecurring — a self-contained,
// zero-file/zero-AI date-math loop: seed from the LATEST entry per series (kind+vendorKey),
// step forward by the series' billing cycle, and create any missing periods up to "now".
// The manual CRUD slice, AI scan/upload/rescan, CSV import, and category-rule backfill are
// separate concerns covered by their own focused test files.
//
// Behaviour pinned:
//  - Query pulls recurring:true, recurringCycle not '' / null, amount > 0, sorted date desc.
//  - Series dedupe: only the FIRST (= latest, given the desc sort already applied by Mongo)
//    entry per `kind|vendorKey` becomes a seed; later duplicates of the same series are
//    ignored entirely. Entries with an empty vendorKey are skipped (never seeded).
//  - addCycle: weekly=+7d, quarterly=+3mo, yearly=+1y, anything else (including 'monthly')
//    defaults to +1mo.
//  - For each seed, steps forward from its date and creates one Expense per elapsed period
//    while `next <= now`, capped at 36 iterations per seed (infinite-series guard).
//  - Created docs copy kind/vendor/vendorKey/category/amount/recurringCycle from the seed,
//    stamp aiModel:'recurring-auto', verified:false, and a fixed note.
//  - revalidatePath('/expenses' + '/income') fires only when at least one doc was created.

const {
  connectDBMock,
  expenseCreate,
  expenseFindSortLean,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  expenseCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'new' })),
  expenseFindSortLean: vi.fn(async () => [] as Array<Record<string, any>>),
  revalidatePathMock: vi.fn(),
}));

const findFilterCalls: Array<Record<string, any>> = [];
const expenseModel = {
  create: expenseCreate,
  find: (filter: Record<string, any>) => {
    findFilterCalls.push(filter);
    return { sort: () => ({ lean: expenseFindSortLean }) };
  },
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

import { generateDueRecurring } from './actions';

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fixed "now": 2026-03-15 12:00 local. Stepping uses UTC setters (addCycleUTC, #103); seeds that
// sit on a month boundary are built with Date.UTC, like the UTC-midnight dates the app stores.
const NOW = new Date(2026, 2, 15, 12, 0, 0);

beforeEach(() => {
  vi.clearAllMocks();
  findFilterCalls.length = 0;
  expenseFindSortLean.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateDueRecurring', () => {
  it('queries recurring, non-blank-cycle, positive-amount records', async () => {
    await generateDueRecurring();
    expect(findFilterCalls).toEqual([{ recurring: true, recurringCycle: { $nin: ['', null] }, amount: { $gt: 0 } }]);
  });

  it('creates nothing and skips revalidate when there are no recurring series', async () => {
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 0 });
    expect(expenseCreate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('skips a series whose vendorKey is empty', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: '', vendorKey: '', category: 'other', amount: 10, date: new Date(2026, 0, 1), recurringCycle: 'monthly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 0 });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('dedupes to only the first (latest) entry per kind|vendorKey series, ignoring later duplicates', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'DEH', vendorKey: 'dei', category: 'utilities', amount: 50, date: new Date(2026, 1, 10), recurringCycle: 'monthly' },
      { kind: 'expense', vendor: 'OldDEH', vendorKey: 'dei', category: 'wrong-cat', amount: 999, date: new Date(2025, 0, 1), recurringCycle: 'monthly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 1 });
    expect(expenseCreate).toHaveBeenCalledTimes(1);
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.vendor).toBe('DEH');
    expect(doc.category).toBe('utilities');
    expect(doc.amount).toBe(50);
  });

  it('treats income and expense series with the same vendorKey as distinct (kind is part of the dedupe key)', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'Acme', vendorKey: 'acme', category: 'other', amount: 30, date: new Date(2026, 1, 10), recurringCycle: 'monthly' },
      { kind: 'income', vendor: 'Acme', vendorKey: 'acme', category: 'salary', amount: 1000, date: new Date(2026, 1, 10), recurringCycle: 'monthly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 2 });
    const kinds = expenseCreate.mock.calls.map((c) => c[0].kind).sort();
    expect(kinds).toEqual(['expense', 'income']);
  });

  it('steps a monthly series forward and creates exactly the one due period', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'ΔΕΗ', vendorKey: 'dei', category: 'utilities', amount: 60, date: new Date(2026, 1, 10), recurringCycle: 'monthly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 1 });
    const doc = expenseCreate.mock.calls[0][0];
    expect(localYmd(doc.date)).toBe('2026-03-10');
    expect(doc.period).toBe('2026-03');
    expect(doc.kind).toBe('expense');
    expect(doc.vendorKey).toBe('dei');
    expect(doc.recurring).toBe(true);
    expect(doc.recurringCycle).toBe('monthly');
    expect(doc.aiModel).toBe('recurring-auto');
    expect(doc.verified).toBe(false);
    expect(doc.notes).toBe('Auto-generated from recurring series');
  });

  it('copies taxonomy fields (space, taxDeductible, taxCategory) from the seed record', async () => {
    expenseFindSortLean.mockResolvedValue([
      {
        kind: 'expense',
        vendor: 'Cosmote',
        vendorKey: 'cosmote',
        category: 'utilities',
        space: 'Office',
        taxDeductible: true,
        taxCategory: 'Telecommunications',
        amount: 45,
        date: new Date(2026, 1, 10),
        recurringCycle: 'monthly',
      },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 1 });
    const doc = expenseCreate.mock.calls[0][0];
    expect(doc.space).toBe('Office');
    expect(doc.taxDeductible).toBe(true);
    expect(doc.taxCategory).toBe('Telecommunications');
  });

  it('steps a weekly series forward by 7 days', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'Gym', vendorKey: 'gym', category: 'health', amount: 20, date: new Date(2026, 2, 7), recurringCycle: 'weekly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 1 });
    expect(localYmd(expenseCreate.mock.calls[0][0].date)).toBe('2026-03-14');
  });

  it('steps a quarterly series forward by 3 months', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'Insurance', vendorKey: 'insurance', category: 'insurance', amount: 200, date: new Date(Date.UTC(2025, 11, 1)), recurringCycle: 'quarterly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 1 });
    // Stored dates are UTC midnight (safeDate('YYYY-MM-DD')); stepping is UTC-exact since #103.
    expect((expenseCreate.mock.calls[0][0].date as Date).toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(expenseCreate.mock.calls[0][0].period).toBe('2026-03');
  });

  it('steps a yearly series forward by 1 year', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'income', vendor: 'Domain renewal', vendorKey: 'domain-renewal', category: 'other', amount: 15, date: new Date(2025, 2, 1), recurringCycle: 'yearly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 1 });
    expect(localYmd(expenseCreate.mock.calls[0][0].date)).toBe('2026-03-01');
  });

  it('defaults an unrecognized cycle string to monthly stepping', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'Mystery', vendorKey: 'mystery', category: 'other', amount: 5, date: new Date(2026, 1, 10), recurringCycle: 'biannual' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 1 });
    expect(localYmd(expenseCreate.mock.calls[0][0].date)).toBe('2026-03-10');
  });

  it('creates one entry per elapsed period when several are overdue at once', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'ΔΕΗ', vendorKey: 'dei', category: 'utilities', amount: 60, date: new Date(2025, 11, 10), recurringCycle: 'monthly' },
    ]);
    const res = await generateDueRecurring();
    // Dec 10 -> Jan 10, Feb 10, Mar 10 (all <= 2026-03-15) -> 3 periods due.
    expect(res).toEqual({ created: 3 });
    const dates = expenseCreate.mock.calls.map((c) => localYmd(c[0].date)).sort();
    expect(dates).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  });

  it('caps at 36 created entries per series even when far more periods are overdue (infinite-series guard)', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'Ancient sub', vendorKey: 'ancient-sub', category: 'other', amount: 9, date: new Date(2010, 0, 1), recurringCycle: 'monthly' },
    ]);
    const res = await generateDueRecurring();
    expect(res).toEqual({ created: 36 });
    expect(expenseCreate).toHaveBeenCalledTimes(36);
  });

  it('calls revalidatePath for /expenses and /income only when something was created', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'ΔΕΗ', vendorKey: 'dei', category: 'utilities', amount: 60, date: new Date(2026, 1, 10), recurringCycle: 'monthly' },
    ]);
    await generateDueRecurring();
    expect(revalidatePathMock).toHaveBeenCalledWith('/expenses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/income');
  });

  it('does not call revalidatePath when a seed exists but no period is due yet', async () => {
    expenseFindSortLean.mockResolvedValue([
      { kind: 'expense', vendor: 'ΔΕΗ', vendorKey: 'dei', category: 'utilities', amount: 60, date: new Date(2026, 2, 14), recurringCycle: 'monthly' },
    ]);
    const res = await generateDueRecurring();
    // next due = 2026-04-14, which is after NOW (2026-03-15) -> nothing created.
    expect(res).toEqual({ created: 0 });
    expect(expenseCreate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
