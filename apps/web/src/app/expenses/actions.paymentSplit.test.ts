import { describe, it, expect, vi, beforeEach } from 'vitest';

// P62 — the payment-method split slice of app/expenses/actions.ts: the `paymentSplits`
// field on add/update. Kept in its own file (same convention as the other
// actions.<concern>.test.ts siblings) so the crud file stays about plain CRUD.
// Behaviour pinned:
//  - an absent/empty split stores [] (pre-P62 behaviour);
//  - malformed rows are cleaned, not rejected — a bad split can never block the save.
// Rows used to mirror into a gift card's spend log; gift cards were removed 2026-09-24.

const {
  connectDBMock,
  expenseCreate,
  expenseUpdateOne,
  expenseFindOneSortLean,
  expenseFindSelectLean,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  expenseCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'e1' })),
  expenseUpdateOne: vi.fn(async (_f: Record<string, any>, _u: Record<string, any>) => ({})),
  expenseFindOneSortLean: vi.fn(async () => null as Record<string, any> | null),
  expenseFindSelectLean: vi.fn(async () => [] as Array<Record<string, any>>),
  getAppSettingsMock: vi.fn(async () => ({ categoryRules: [] as any[] })),
  revalidatePathMock: vi.fn(),
}));

const expenseModel = {
  create: expenseCreate,
  updateOne: expenseUpdateOne,
  findOne: () => ({ sort: () => ({ lean: expenseFindOneSortLean }) }),
  find: () => ({ select: () => ({ lean: expenseFindSelectLean }) }),
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async () => expenseModel,
}));
vi.mock('@/models/Expense', () => ({ Expense: { __model: 'expense' } }));
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

import { updateExpense, addExpense } from './actions';

const BASE = { kind: 'expense' as const, vendor: 'IKEA', date: '2026-08-28', amount: 75 };

/** The $set the action handed to Expense.updateOne. */
function setOf() {
  return expenseUpdateOne.mock.calls[0][1].$set as Record<string, any>;
}

beforeEach(() => {
  vi.clearAllMocks();
  expenseFindOneSortLean.mockResolvedValue(null);
  expenseFindSelectLean.mockResolvedValue([]);
  getAppSettingsMock.mockResolvedValue({ categoryRules: [] });
});

describe('paymentSplits field (pre-P62 behaviour is the default)', () => {
  it('stores an empty split when the caller sends none', async () => {
    await updateExpense('e1', BASE);
    expect(setOf().paymentSplits).toEqual([]);
  });

  it('creates with an empty split when the caller sends none', async () => {
    await addExpense(BASE);
    expect(expenseCreate.mock.calls[0][0].paymentSplits).toEqual([]);
  });

  it('cleans the rows it stores (trim, cents, drop the empty ones)', async () => {
    await updateExpense('e1', {
      ...BASE,
      paymentSplits: [{ method: '  Visa ', amount: 45.005 }, { method: '   ', amount: 30 }],
    });
    expect(setOf().paymentSplits).toEqual([{ method: 'Visa', amount: 45.01 }]);
  });

  it('degrades a malformed split to [] instead of failing the whole save', async () => {
    const r = await updateExpense('e1', { ...BASE, paymentSplits: 'not-an-array' as any });
    expect(r.ok).toBe(true);
    expect(setOf().paymentSplits).toEqual([]);
  });

  it('degrades a split whose ROWS are the wrong shape, keeping the rest of the expense', async () => {
    const r = await updateExpense('e1', { ...BASE, paymentSplits: [42, null] as any });
    expect(r.ok).toBe(true);
    expect(setOf().paymentSplits).toEqual([]);
    expect(setOf().vendor).toBe('IKEA');
  });
});
