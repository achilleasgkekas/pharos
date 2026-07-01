import { describe, expect, it } from 'vitest';
import {
  normalizeInstallmentDesc,
  installmentOrigin,
  installmentSignature,
  installmentKey,
  installmentGroupKey,
  computeInstallmentPlans,
  plansForItem,
  shortMonth,
} from './installments';
import type { SerializedStatement, SerializedTransaction } from '@/types';

// installments.ts groups the per-statement "ΔΟΣΗ 3/12" lines of one physical purchase
// back into a single plan, so we can show payoff progress. The tricky invariants:
//  - the same purchase must keep merging across statements (stable signature), while
//    two same-merchant purchases started in different months stay separate (origin);
//  - a manual `planKey` override merges differently-worded charges into one plan;
//  - payoff month is projected from the LATEST charge (UTC month math, timezone-safe).
// These deterministic helpers take no DB and no clock input we can't supply, so we
// assert exact values.

let idc = 0;
const nextId = () => `tx${++idc}`;

function mkTx(p: {
  date: string;
  amount: number;
  description?: string;
  current?: number;
  total?: number;
  originalPurchase?: string;
  planKey?: string | null;
  itemIds?: string[];
  noInstallment?: boolean;
}): SerializedTransaction {
  return {
    _id: nextId(),
    date: p.date,
    description: p.description ?? '',
    amount: p.amount,
    category: 'shopping',
    installmentInfo: p.noInstallment
      ? null
      : {
          currentInstallment: p.current ?? 1,
          totalInstallments: p.total ?? 12,
          originalPurchase: p.originalPurchase ?? '',
          planKey: p.planKey ?? null,
        },
    matchedItemIds: p.itemIds ?? [],
    matchedReceiptId: null,
  };
}

function mkStmt(period: string, card: string, transactions: SerializedTransaction[]): SerializedStatement {
  return {
    _id: `st-${period}-${card}`,
    card,
    last4: '0000',
    cardId: null,
    period,
    statementDate: `${period}-05`,
    dueDate: null,
    totalAmount: 0,
    minimumPayment: 0,
    paidAmount: 0,
    currency: 'EUR',
    transactions,
    filePath: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

describe('normalizeInstallmentDesc', () => {
  it('strips a leading "ΔΟΣΗ N/M" counter and lowercases', () => {
    expect(normalizeInstallmentDesc('ΔΟΣΗ 3/12 KOTSOVOLOS')).toBe('kotsovolos');
  });

  it('strips an "installment N/M" counter', () => {
    expect(normalizeInstallmentDesc('installment 5/36 apple')).toBe('apple');
  });

  it('strips a bare inline "NN/MM" counter', () => {
    expect(normalizeInstallmentDesc('PLAISIO 09/12')).toBe('plaisio');
  });

  it('collapses whitespace and drops punctuation', () => {
    expect(normalizeInstallmentDesc('Apple  Watch!! (Series-9)')).toBe('apple watch series 9');
  });

  it('preserves Greek letters (including final sigma)', () => {
    expect(normalizeInstallmentDesc('ΚΩΤΣΟΒΟΛΟΣ 3/36')).toBe('κωτσοβολος');
  });

  it('makes the same purchase collapse regardless of installment number', () => {
    expect(normalizeInstallmentDesc('ΔΟΣΗ 3/12 PLAISIO')).toBe(
      normalizeInstallmentDesc('ΔΟΣΗ 4/12 PLAISIO'),
    );
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeInstallmentDesc('')).toBe('');
    expect(normalizeInstallmentDesc('   ')).toBe('');
    // @ts-expect-error — defensive: callers sometimes pass undefined
    expect(normalizeInstallmentDesc(undefined)).toBe('');
  });
});

describe('installmentOrigin', () => {
  it('derives the purchase month from period minus (installment - 1)', () => {
    // PLAISIO 8/12 on 2026-04 → purchase month = 2026-04 minus 7 = 2025-09
    expect(installmentOrigin('2026-04', 8)).toBe('2025-09');
  });

  it('gives the SAME origin for the next installment a month later', () => {
    // 8/12 on 2026-04 and 9/12 on 2026-05 both trace back to 2025-09
    expect(installmentOrigin('2026-05', 9)).toBe('2025-09');
  });

  it('treats installment #1 as the purchase month itself', () => {
    expect(installmentOrigin('2026-04', 1)).toBe('2026-04');
  });

  it('rolls the year back correctly across January', () => {
    // 3/12 on 2026-01 → 2026-01 minus 2 = 2025-11
    expect(installmentOrigin('2026-01', 3)).toBe('2025-11');
  });

  it('returns empty string when period is malformed or installment missing', () => {
    expect(installmentOrigin('2026/04', 8)).toBe('');
    expect(installmentOrigin('', 8)).toBe('');
    expect(installmentOrigin('2026-04', undefined)).toBe('');
    expect(installmentOrigin('2026-04', 0)).toBe('');
  });
});

describe('installmentSignature', () => {
  it('is merchant|total|origin, preferring originalPurchase over description', () => {
    const tx = mkTx({ date: '2026-04-15', amount: -39.47, description: 'PLAISIO 8/12', current: 8, total: 12, originalPurchase: 'PLAISIO' });
    expect(installmentSignature(tx, '2026-04')).toBe('plaisio|12|2025-09');
  });

  it('falls back to description when originalPurchase is empty', () => {
    const tx = mkTx({ date: '2026-04-15', amount: -39.47, description: 'PLAISIO 8/12', current: 8, total: 12 });
    expect(installmentSignature(tx, '2026-04')).toBe('plaisio|12|2025-09');
  });

  it('matches across statements for the same purchase', () => {
    const a = mkTx({ date: '2026-04-15', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO' });
    const b = mkTx({ date: '2026-05-15', amount: -39.47, current: 9, total: 12, originalPurchase: 'PLAISIO' });
    expect(installmentSignature(a, '2026-04')).toBe(installmentSignature(b, '2026-05'));
  });
});

describe('installmentKey', () => {
  it('is desc:<signature> for a normal installment charge', () => {
    const tx = mkTx({ date: '2026-04-15', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO' });
    expect(installmentKey(tx, '2026-04')).toBe('desc:plaisio|12|2025-09');
  });

  it('is null when the charge is not an installment', () => {
    const tx = mkTx({ date: '2026-04-15', amount: -10, noInstallment: true });
    expect(installmentKey(tx, '2026-04')).toBeNull();
  });

  it('is null when the description normalizes to an empty merchant', () => {
    const tx = mkTx({ date: '2026-04-15', amount: -10, description: '--- ///', current: 3, total: 12 });
    expect(installmentKey(tx, '2026-04')).toBeNull();
  });
});

describe('installmentGroupKey', () => {
  it('returns the manual planKey override when set', () => {
    const tx = mkTx({ date: '2026-04-15', amount: -20, current: 2, total: 6, originalPurchase: 'QUEST ONLINE', planKey: 'quest-plan' });
    expect(installmentGroupKey(tx, '2026-04')).toBe('quest-plan');
  });

  it('returns the bare signature (no desc: prefix) when unlinked', () => {
    const tx = mkTx({ date: '2026-04-15', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO' });
    expect(installmentGroupKey(tx, '2026-04')).toBe('plaisio|12|2025-09');
  });

  it('is empty string for a non-installment or empty-merchant charge', () => {
    expect(installmentGroupKey(mkTx({ date: '2026-04-15', amount: -10, noInstallment: true }), '2026-04')).toBe('');
    expect(installmentGroupKey(mkTx({ date: '2026-04-15', amount: -10, description: '///', current: 3, total: 12 }), '2026-04')).toBe('');
  });
});

describe('computeInstallmentPlans', () => {
  it('merges the same purchase across two statements into one plan', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO' })]),
      mkStmt('2026-05', 'Mastercard', [mkTx({ date: '2026-05-15', amount: -39.47, current: 9, total: 12, originalPurchase: 'PLAISIO' })]),
    ]);
    expect(plans).toHaveLength(1);
    const p = plans[0];
    expect(p.key).toBe('plaisio|12|2025-09');
    expect(p.totalInstallments).toBe(12);
    expect(p.paidInstallments).toBe(9);
    expect(p.remainingInstallments).toBe(3);
    expect(p.occurrences).toBe(2);
    expect(p.perAmount).toBeCloseTo(39.47, 2);
    expect(p.paidAmount).toBeCloseTo(78.94, 2);
    expect(p.totalAmount).toBeCloseTo(473.64, 2);
    expect(p.remainingAmount).toBeCloseTo(118.41, 2);
    expect(p.done).toBe(false);
    expect(p.merged).toBe(false);
    expect(p.card).toBe('Mastercard');
    expect(p.firstDate).toBe('2026-04-15');
    expect(p.lastDate).toBe('2026-05-15');
  });

  it('projects payoff from the latest charge month + remaining installments (UTC)', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO' })]),
      mkStmt('2026-05', 'Mastercard', [mkTx({ date: '2026-05-15', amount: -39.47, current: 9, total: 12, originalPurchase: 'PLAISIO' })]),
    ]);
    // lastPeriod 2026-05 start (UTC) + 3 remaining months = 2026-08-01
    expect(plans[0].projectedEndDate).toBe('2026-08-01T00:00:00.000Z');
  });

  it('keeps two same-merchant purchases from different origin months separate', () => {
    // Both PLAISIO/12, but one started 2025-09 (8/12 on 2026-04) and one 2026-01 (2/12 on 2026-02)
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO' })]),
      mkStmt('2026-02', 'Mastercard', [mkTx({ date: '2026-02-15', amount: -12.5, current: 2, total: 12, originalPurchase: 'PLAISIO' })]),
    ]);
    expect(plans).toHaveLength(2);
    expect(new Set(plans.map((p) => p.key))).toEqual(new Set(['plaisio|12|2025-09', 'plaisio|12|2026-01']));
  });

  it('merges differently-worded charges via a manual planKey', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -20, current: 2, total: 6, originalPurchase: 'QUEST ONLINE', planKey: 'quest-plan' })]),
      mkStmt('2026-05', 'Mastercard', [mkTx({ date: '2026-05-15', amount: -20, current: 3, total: 6, originalPurchase: 'QUEST ONLINE KALLITHEA', planKey: 'quest-plan' })]),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].key).toBe('quest-plan');
    expect(plans[0].merged).toBe(true);
    expect(plans[0].paidInstallments).toBe(3);
    expect(plans[0].occurrences).toBe(2);
  });

  it('leaves differently-worded charges as separate plans without a planKey', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -20, current: 2, total: 6, originalPurchase: 'QUEST ONLINE' })]),
      mkStmt('2026-05', 'Mastercard', [mkTx({ date: '2026-05-15', amount: -20, current: 3, total: 6, originalPurchase: 'QUEST ONLINE KALLITHEA' })]),
    ]);
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.merged === false)).toBe(true);
  });

  it('flags a fully-paid plan as done', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -39.47, current: 12, total: 12, originalPurchase: 'PLAISIO' })]),
    ]);
    expect(plans[0].done).toBe(true);
    expect(plans[0].remainingInstallments).toBe(0);
    expect(plans[0].remainingAmount).toBeCloseTo(0, 2);
    // done plans project payoff to their own last charge month (no months to go)
    expect(plans[0].projectedEndDate).toBe('2026-04-01T00:00:00.000Z');
  });

  it('does not mark a plan done when totalInstallments is unknown (0)', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -39.47, current: 1, total: 0, originalPurchase: 'PLAISIO' })]),
    ]);
    expect(plans[0].done).toBe(false);
  });

  it('unions matched item ids across all charges of a plan', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [mkTx({ date: '2026-04-15', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO', itemIds: ['itemA'] })]),
      mkStmt('2026-05', 'Mastercard', [mkTx({ date: '2026-05-15', amount: -39.47, current: 9, total: 12, originalPurchase: 'PLAISIO', itemIds: ['itemB', 'itemA'] })]),
    ]);
    expect(plans[0].itemIds.sort()).toEqual(['itemA', 'itemB']);
  });

  it('ignores non-installment transactions', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [
        mkTx({ date: '2026-04-15', amount: -50, noInstallment: true }),
        mkTx({ date: '2026-04-16', amount: -39.47, current: 8, total: 12, originalPurchase: 'PLAISIO' }),
      ]),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].key).toBe('plaisio|12|2025-09');
  });

  it('sorts active plans before done plans', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [
        mkTx({ date: '2026-04-10', amount: -10, current: 12, total: 12, originalPurchase: 'DONE STORE' }),
        mkTx({ date: '2026-04-11', amount: -20, current: 3, total: 12, originalPurchase: 'ACTIVE STORE' }),
      ]),
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0].done).toBe(false);
    expect(plans[1].done).toBe(true);
  });

  it('returns an empty array when there are no statements', () => {
    expect(computeInstallmentPlans([])).toEqual([]);
  });
});

describe('plansForItem', () => {
  it('returns only plans linked to the given item id', () => {
    const plans = computeInstallmentPlans([
      mkStmt('2026-04', 'Mastercard', [
        mkTx({ date: '2026-04-10', amount: -20, current: 3, total: 12, originalPurchase: 'STORE A', itemIds: ['itemA'] }),
        mkTx({ date: '2026-04-11', amount: -30, current: 4, total: 12, originalPurchase: 'STORE B', itemIds: ['itemB'] }),
      ]),
    ]);
    const forA = plansForItem(plans, 'itemA');
    expect(forA).toHaveLength(1);
    expect(forA[0].label).toBe('STORE A');
    expect(plansForItem(plans, 'itemZ')).toEqual([]);
  });
});

describe('shortMonth', () => {
  it('formats an ISO date as "Mon YYYY"', () => {
    // midday UTC so the label is timezone-stable across reasonable offsets
    expect(shortMonth('2026-08-15T12:00:00.000Z')).toBe('Aug 2026');
  });

  it('returns empty string for an invalid date', () => {
    expect(shortMonth('not-a-date')).toBe('');
    expect(shortMonth('')).toBe('');
  });
});
