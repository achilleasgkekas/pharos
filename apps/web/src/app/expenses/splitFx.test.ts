import { describe, it, expect, vi, beforeEach } from 'vitest';
import { equalSplit } from '@/lib/split';
import { paymentSplitRemainder, paymentSplitsBalance } from '@/lib/paymentSplit';
import { convertToBase } from '@/lib/fx';

const {
  connectDBMock,
  expenseCreate,
  expenseUpdateOne,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  expenseCreate: vi.fn(async (_doc: Record<string, any>) => ({ _id: 'e1' })),
  expenseUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  getAppSettingsMock: vi.fn(async () => ({ currency: 'EUR' })),
  revalidatePathMock: vi.fn(),
}));

const expenseModel = {
  create: expenseCreate,
  updateOne: expenseUpdateOne,
  findOne: () => ({ sort: () => ({ lean: vi.fn().mockResolvedValue(null) }) }),
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

import { addExpense, updateExpense } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingsMock.mockResolvedValue({ currency: 'EUR', categoryRules: [] } as any);
});

describe('equal splitting foreign-currency expenses', () => {
  it('demonstrates that equalSplit on printed amount yields wrong base-currency share ratio when saved', async () => {
    const printedAmount = 100; // 100 USD
    const fxRate = 0.90; // 1 USD = 0.90 EUR
    // Incorrect usage: equalSplit derived from printed amount (100 USD)
    const wrongSplit = equalSplit(printedAmount, ['Bob'], true);
    expect(wrongSplit).toEqual([{ name: 'Bob', share: 50, settled: false }]);

    await addExpense({
      date: '2026-06-15',
      amount: printedAmount,
      currency: 'USD',
      fxRate,
      split: wrongSplit,
    } as any);

    const savedDoc = expenseCreate.mock.calls[0][0];
    // Expense is saved converted to base currency (90 EUR)
    expect(savedDoc.amount).toBe(90);
    // But Bob's share saved as 50 EUR, which is 55.5% of the expense instead of 45 EUR (50%)
    expect(savedDoc.split[0].share).toBe(50);
    expect(savedDoc.split[0].share).not.toBe(savedDoc.amount / 2);
  });

  it('correctly saves base-currency share ratio when equalSplit uses converted base amount', async () => {
    const printedAmount = 100; // 100 USD
    const fxRate = 0.90; // 1 USD = 0.90 EUR
    const baseAmount = convertToBase(printedAmount, fxRate); // 90 EUR
    expect(baseAmount).toBe(90);

    // Correct usage: equalSplit derived from converted base amount
    const correctSplit = equalSplit(baseAmount, ['Bob'], true);
    expect(correctSplit).toEqual([{ name: 'Bob', share: 45, settled: false }]);

    await addExpense({
      date: '2026-06-15',
      amount: printedAmount,
      currency: 'USD',
      fxRate,
      split: correctSplit,
    } as any);

    const savedDoc = expenseCreate.mock.calls[0][0];
    expect(savedDoc.amount).toBe(90); // 90 EUR
    expect(savedDoc.split[0].share).toBe(45); // 45 EUR = 50% of expense
  });

  it('correctly saves base-currency share ratio on update when equalSplit uses converted base amount', async () => {
    const printedAmount = 200; // 200 USD
    const fxRate = 0.85; // 1 USD = 0.85 EUR
    const baseAmount = convertToBase(printedAmount, fxRate); // 170 EUR

    const correctSplit = equalSplit(baseAmount, ['Alice', 'Bob'], true); // 170 / 3 = 56.66 for Alice and Bob, 56.68 for self
    expect(correctSplit).toEqual([
      { name: 'Alice', share: 56.66, settled: false },
      { name: 'Bob', share: 56.66, settled: false },
    ]);

    await updateExpense('e1', {
      date: '2026-06-15',
      amount: printedAmount,
      currency: 'USD',
      fxRate,
      split: correctSplit,
    } as any);

    const set = expenseUpdateOne.mock.calls[0][1].$set;
    expect(set.amount).toBe(170); // 170 EUR
    expect(set.split[0].share).toBe(56.66);
    expect(set.split[1].share).toBe(56.66);
  });
});

// #205 — the SAME mistake as above, one line further down the form. The per-person split was
// taught to work in base currency; the PAYMENT split (which method paid, and from which gift
// card) kept receiving the printed foreign figure. It matters more here than for a per-person
// share, because a gift card's balance is real stored money in base currency: `syncGiftCardUses`
// deducts the split amount straight off the card.
describe('payment splits are allocated against the BASE amount', () => {
  const printedAmount = 1000;   // ¥1000
  const rate = 0.0061;          // EUR per JPY
  const baseAmount = convertToBase(printedAmount, rate); // ≈ €6.10

  it('a split that covers the purchase balances against the base amount, not the printed one', () => {
    const splits = [{ method: 'Gift card', amount: baseAmount, giftCardId: 'g1' }];
    expect(paymentSplitsBalance(baseAmount, splits)).toBe(true);
    // Judged against the printed figure, the very same full payment looks like a ¥993 shortfall —
    // which is what the editor showed, and what the pre-filled "rest" row then offered to charge.
    expect(paymentSplitsBalance(printedAmount, splits)).toBe(false);
  });

  it('the remainder a fresh row pre-fills is the base amount left, not the printed amount left', () => {
    expect(paymentSplitRemainder(baseAmount, [])).toBeCloseTo(6.1, 2);
    // The old behaviour: a new row arrived pre-filled with 1000, and accepting it drained €1000
    // off a card holding euros.
    expect(paymentSplitRemainder(printedAmount, [])).toBe(1000);
  });
});
