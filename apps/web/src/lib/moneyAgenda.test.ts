import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SerializedStatement, SerializedTransaction } from '@/types';

// lib/moneyAgenda.ts `computeMoneyAgenda()` — the shared 3-month "money agenda" builder
// behind both the /api/v1 calendar route and the .ics feed. Never directly unit-tested
// before. It fans out to 5 collections (Subscription/Statement/Item/Voucher/Expense),
// builds a rolling [now .. now+3mo) window, then per-source projects future occurrences:
//  - subscription renewals step forward by billingCycle (guarded at 8 iterations);
//  - card installments come from the already-tested `computeInstallmentPlans` (kept REAL
//    here, not mocked, since it's pure/deterministic and has its own suite in
//    installments.test.ts) aggregated to one pinned line per month;
//  - recurring bills/income dedupe to the latest entry per (kind|vendorKey) series and
//    project forward, but only push occurrences strictly AFTER `now` (past periods are
//    someone else's job — generateDueRecurring backfills those as real Expense docs);
//  - warranty/voucher expiries are amount-less reminders.
// `now` is an injectable parameter (no fake timers needed) so every case below pins an
// exact window against a fixed clock.

const {
  connectDBMock,
  subscriptionFind,
  statementFind,
  itemFind,
  voucherFind,
  expenseFind,
  billFind,
  goalFind,
} = vi.hoisted(() => {
  function selectLean(rows: unknown[]) {
    return { select: () => ({ lean: async () => rows }) };
  }
  return {
    connectDBMock: vi.fn(async () => {}),
    subscriptionFind: vi.fn((_f: Record<string, unknown>) => selectLean([])),
    statementFind: vi.fn(() => ({ lean: async () => [] as unknown[] })),
    itemFind: vi.fn((_f: Record<string, unknown>) => selectLean([])),
    voucherFind: vi.fn((_f: Record<string, unknown>) => selectLean([])),
    expenseFind: vi.fn((_f: Record<string, unknown>) => ({ sort: () => selectLean([]) })),
    billFind: vi.fn((_f: Record<string, unknown>) => selectLean([])),
    goalFind: vi.fn((_f: Record<string, unknown>) => selectLean([])),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subscriptionFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { find: voucherFind } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind } }));
vi.mock('@/models/Goal', () => ({ Goal: { find: goalFind } }));
// The five models now resolve through `currentModel` so the reads follow the caller's tenant.
// SAAS_MODE is off in tests, where the real helper is the identity anyway; stubbing it keeps this
// suite free of a Mongo connection while the mocked models above stay the ones under test.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { computeMoneyAgenda } from './moneyAgenda';

// Fixed "now": 2026-03-15 (local). windowStart = 2026-03-01, windowEnd = 2026-06-01,
// so the 3 agenda months are Mar/Apr/May 2026.
const NOW = new Date(2026, 2, 15);

function setRows(opts: {
  subs?: unknown[];
  statements?: unknown[];
  items?: unknown[];
  vouchers?: unknown[];
  recurring?: unknown[];
  bills?: unknown[];
  goals?: unknown[];
}) {
  function selectLean(rows: unknown[]) {
    return { select: () => ({ lean: async () => rows }) };
  }
  subscriptionFind.mockImplementation(() => selectLean(opts.subs ?? []));
  statementFind.mockImplementation(() => ({ lean: async () => opts.statements ?? [] }));
  itemFind.mockImplementation(() => selectLean(opts.items ?? []));
  voucherFind.mockImplementation(() => selectLean(opts.vouchers ?? []));
  expenseFind.mockImplementation(() => ({ sort: () => selectLean(opts.recurring ?? []) }));
  billFind.mockImplementation(() => selectLean(opts.bills ?? []));
  goalFind.mockImplementation(() => selectLean(opts.goals ?? []));
}

let idc = 0;
const nextId = () => `tx${++idc}`;

function mkTx(p: { current: number; total: number; originalPurchase?: string }): SerializedTransaction {
  return {
    _id: nextId(),
    date: '2026-01-05',
    description: p.originalPurchase ?? 'ΔΟΣΗ ITEM',
    amount: 0,
    category: 'shopping',
    installmentInfo: {
      currentInstallment: p.current,
      totalInstallments: p.total,
      originalPurchase: p.originalPurchase ?? 'ITEM',
      planKey: null,
    },
    matchedItemIds: [],
    matchedReceiptId: null,
  };
}

/** A statement whose single transaction is installment #`current` of `total`, with a
 *  fixed perAmount (via computeInstallmentPlans' perAmountAtMax = amount at highest
 *  installment number seen so far). */
function mkInstallmentStatement(period: string, current: number, total: number, amount: number, label = 'ITEM'): SerializedStatement {
  const tx = mkTx({ current, total, originalPurchase: label });
  tx.amount = amount;
  return {
    _id: `st-${period}`,
    card: 'Visa',
    last4: '0000',
    cardId: null,
    period,
    statementDate: `${period}-05`,
    dueDate: null,
    totalAmount: amount,
    minimumPayment: 0,
    paidAmount: 0,
    currency: 'EUR',
    transactions: [tx],
    filePath: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  idc = 0;
  setRows({});
});

describe('computeMoneyAgenda — window structure', () => {
  it('returns exactly 3 months keyed current + next 2, all zeroed when every source is empty', async () => {
    const { months, dueThisMonth } = await computeMoneyAgenda(NOW);
    expect(months.map((m) => m.key)).toEqual(['2026-03', '2026-04', '2026-05']);
    for (const m of months) {
      expect(m.entries).toEqual([]);
      expect(m.out).toBe(0);
      expect(m.inc).toBe(0);
    }
    expect(dueThisMonth).toBe(0);
  });

  it('labels each month with the full localized month name and year', async () => {
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].label).toContain('2026');
    expect(months[0].label.toLowerCase()).toContain('march');
    expect(months[1].label.toLowerCase()).toContain('april');
    expect(months[2].label.toLowerCase()).toContain('may');
  });

  it('calls connectDB before querying', async () => {
    await computeMoneyAgenda(NOW);
    expect(connectDBMock).toHaveBeenCalled();
  });

  it('queries each collection with the documented filters', async () => {
    await computeMoneyAgenda(NOW);
    expect(subscriptionFind).toHaveBeenCalledWith({ active: true, nextRenewal: { $ne: null }, deletedAt: null });
    expect(statementFind).toHaveBeenCalledWith({ deletedAt: null });
    expect(itemFind).toHaveBeenCalledWith({ warrantyUntil: { $gte: new Date(2026, 2, 1), $lt: new Date(2026, 5, 1) }, deletedAt: null });
    expect(voucherFind).toHaveBeenCalledWith({ used: false, expiresAt: { $gte: new Date(2026, 2, 1), $lt: new Date(2026, 5, 1) }, deletedAt: null });
    expect(expenseFind).toHaveBeenCalledWith({ recurring: true, recurringCycle: { $nin: ['', null] }, amount: { $gt: 0 }, deletedAt: null });
  });
});

describe('computeMoneyAgenda — subscription renewals', () => {
  it('steps a monthly renewal starting at windowStart into all 3 months', async () => {
    setRows({ subs: [{ name: 'Netflix', amount: 15, billingCycle: 'monthly', nextRenewal: new Date(2026, 2, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    for (const m of months) {
      expect(m.entries).toHaveLength(1);
      expect(m.entries[0]).toMatchObject({ kind: 'renewal', label: 'Netflix', amount: 15, sub: 'Renews monthly' });
      expect(m.out).toBe(15);
    }
  });

  it('falls back to "Subscription" when name is missing, and amount 0 when missing', async () => {
    setRows({ subs: [{ billingCycle: 'monthly', nextRenewal: new Date(2026, 2, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0]).toMatchObject({ label: 'Subscription', amount: 0 });
    expect(months[0].out).toBe(0);
  });

  it('a yearly renewal inside the window pushes exactly once', async () => {
    setRows({ subs: [{ name: 'Domain', amount: 12, billingCycle: 'yearly', nextRenewal: new Date(2026, 3, 10) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries).toHaveLength(0);
    expect(months[1].entries).toHaveLength(1);
    expect(months[1].entries[0]).toMatchObject({ label: 'Domain', sub: 'Renews yearly' });
    expect(months[2].entries).toHaveLength(0);
  });

  it('a quarterly renewal steps by 3 months (may land only once in a 3-month window)', async () => {
    setRows({ subs: [{ name: 'Insurance', amount: 30, billingCycle: 'quarterly', nextRenewal: new Date(2026, 2, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries).toHaveLength(1);
    expect(months[1].entries).toHaveLength(0);
    expect(months[2].entries).toHaveLength(0);
  });

  it('a weekly renewal steps by 7 days and can land multiple times in one month', async () => {
    setRows({ subs: [{ name: 'Weekly box', amount: 5, billingCycle: 'weekly', nextRenewal: new Date(2026, 2, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    // Mar 1, 8, 15, 22, 29 all land in March. The step ceiling covers a whole quarter of
    // weeks now, so the cheapest cycle is no longer the one truncated out of the window.
    expect(months[0].entries).toHaveLength(5);
    expect(months[0].entries.every((e) => e.kind === 'renewal')).toBe(true);
    expect(months.flatMap((m) => m.entries)).toHaveLength(14);
  });

  it('steps forward past occurrences before windowStart without pushing them', async () => {
    // nextRenewal is 2 months before the window; monthly cycle steps into the window.
    setRows({ subs: [{ name: 'Old sub', amount: 9, billingCycle: 'monthly', nextRenewal: new Date(2026, 0, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    // Steps: Jan1(<start,skip) Feb1(<start,skip) Mar1(push) Apr1(push) May1(push)
    expect(months[0].entries).toHaveLength(1);
    expect(months[1].entries).toHaveLength(1);
    expect(months[2].entries).toHaveLength(1);
  });

  it('a long-overdue weekly renewal is seeded into the window instead of being lost', async () => {
    // 2 years stale. `nextRenewal` is a snapshot nothing advances, and the loop used to
    // spend its whole step budget catching up: the subscription reached neither the agenda
    // nor the safe-to-spend figure built on it. Seeding at windowStart is what fixes it.
    setRows({ subs: [{ name: 'Ancient', amount: 1, billingCycle: 'weekly', nextRenewal: new Date(2024, 2, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months.every((m) => m.entries.length > 0)).toBe(true);
    expect(months.flatMap((m) => m.entries).every((e) => e.label === 'Ancient')).toBe(true);
  });

  it('an unrecognized billing cycle string is echoed verbatim into the sub label (fallback)', async () => {
    setRows({ subs: [{ name: 'Odd', amount: 1, billingCycle: 'biweekly', nextRenewal: new Date(2026, 2, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    // Falls through addCycle's else-branch too (treated as monthly stepping).
    expect(months[0].entries[0].sub).toBe('Renews biweekly');
  });
});

describe('computeMoneyAgenda — card installments', () => {
  it('pushes one pinned aggregated line per month while remainingInstallments covers it', async () => {
    // installment 10 of 12 -> remaining = 2: due in month0 (>=1) and month1 (>=2), not month2 (>=3).
    setRows({ statements: [mkInstallmentStatement('2026-01', 10, 12, 50, 'Laptop')] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries).toHaveLength(1);
    expect(months[0].entries[0]).toMatchObject({ pinned: true, kind: 'installments', label: 'Installments', sub: '1 active plan', amount: 50 });
    expect(months[0].out).toBe(50);
    expect(months[1].entries).toHaveLength(1);
    expect(months[1].out).toBe(50);
    expect(months[2].entries).toHaveLength(0);
  });

  it('aggregates multiple active plans into one line with a plural count and summed amount', async () => {
    setRows({
      statements: [
        mkInstallmentStatement('2026-01', 10, 12, 50, 'Laptop'),
        mkInstallmentStatement('2026-02', 2, 6, 30, 'Monitor'),
      ],
    });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0]).toMatchObject({ sub: '2 active plans', amount: 80 });
  });

  it('a fully paid plan (remainingInstallments 0) contributes no installment line', async () => {
    setRows({ statements: [mkInstallmentStatement('2026-01', 12, 12, 50, 'Done')] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months.every((m) => m.entries.length === 0)).toBe(true);
  });

  it('feeds the statements through JSON round-tripping (plain lean objects, not documents)', async () => {
    // A lean() result is already plain, but moneyAgenda explicitly re-serializes it;
    // pin that this doesn't crash or drop fields on a realistic multi-field statement.
    setRows({ statements: [mkInstallmentStatement('2026-01', 5, 10, 20)] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0].amount).toBe(20);
  });
});

describe('computeMoneyAgenda — recurring bills/income', () => {
  it('projects a recurring expense forward and labels it "bill" with the vendor name', async () => {
    setRows({
      recurring: [{ kind: 'expense', vendor: 'ΔΕΗ', vendorKey: 'dei', amount: 60, date: new Date(2026, 1, 20), recurringCycle: 'monthly' }],
    });
    const { months } = await computeMoneyAgenda(NOW);
    // latest date Feb 20 + 1mo = Mar 20 (> now Mar 15) -> pushed into month0.
    expect(months[0].entries).toHaveLength(1);
    expect(months[0].entries[0]).toMatchObject({ kind: 'bill', label: 'ΔΕΗ', sub: 'Expected monthly', amount: 60 });
    expect(months[0].out).toBe(60);
  });

  it('projects a recurring income series and labels it "income" (counts toward inc, not out)', async () => {
    setRows({
      recurring: [{ kind: 'income', vendor: 'Employer', vendorKey: 'employer', amount: 2000, date: new Date(2026, 1, 25), recurringCycle: 'monthly' }],
    });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0]).toMatchObject({ kind: 'income', label: 'Employer', amount: 2000 });
    expect(months[0].inc).toBe(2000);
    expect(months[0].out).toBe(0);
  });

  it('falls back to "Income"/"Bill" default labels when vendor is missing', async () => {
    setRows({
      recurring: [
        { kind: 'income', vendorKey: 'a', amount: 100, date: new Date(2026, 1, 20), recurringCycle: 'monthly' },
        { kind: 'expense', vendorKey: 'b', amount: 50, date: new Date(2026, 1, 20), recurringCycle: 'monthly' },
      ],
    });
    const { months } = await computeMoneyAgenda(NOW);
    const labels = months[0].entries.map((e) => e.label).sort();
    expect(labels).toEqual(['Bill', 'Income']);
  });

  it('only projects occurrences strictly AFTER now, never the seed date itself if it is <= now', async () => {
    // Latest entry IS today; next step (+1mo, Apr 15) is the first occurrence after now.
    setRows({ recurring: [{ kind: 'expense', vendor: 'Rent', vendorKey: 'rent', amount: 500, date: new Date(2026, 2, 15), recurringCycle: 'monthly' }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries).toHaveLength(0);
    expect(months[1].entries).toHaveLength(1);
  });

  it('dedupes a series to only its first (latest, per the mocked desc sort) entry per kind|vendorKey', async () => {
    setRows({
      recurring: [
        { kind: 'expense', vendor: 'Rent', vendorKey: 'rent', amount: 500, date: new Date(2026, 1, 20), recurringCycle: 'monthly' },
        { kind: 'expense', vendor: 'Rent (old amount)', vendorKey: 'rent', amount: 450, date: new Date(2026, 0, 20), recurringCycle: 'monthly' },
      ],
    });
    const { months } = await computeMoneyAgenda(NOW);
    // The 2nd (older) entry never becomes its own seed, but the 1st (kept) seed still
    // projects one occurrence per month across the window (Mar/Apr/May 20th) — dedupe
    // is about which entry SEEDS the series, not about capping it to one occurrence.
    const rentEntries = months.flatMap((m) => m.entries).filter((e) => e.label.startsWith('Rent'));
    expect(rentEntries).toHaveLength(3);
    expect(rentEntries.every((e) => e.amount === 500)).toBe(true);
  });

  it('skips entries with an empty/missing vendorKey entirely', async () => {
    setRows({ recurring: [{ kind: 'expense', vendor: 'Nokey', vendorKey: '', amount: 10, date: new Date(2026, 1, 20), recurringCycle: 'monthly' }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months.every((m) => m.entries.length === 0)).toBe(true);
  });

  it('income and expense series with the same vendorKey are tracked as separate series (kind is part of the dedupe key)', async () => {
    setRows({
      recurring: [
        { kind: 'income', vendor: 'Same', vendorKey: 'same', amount: 100, date: new Date(2026, 1, 20), recurringCycle: 'monthly' },
        { kind: 'expense', vendor: 'Same', vendorKey: 'same', amount: 40, date: new Date(2026, 1, 20), recurringCycle: 'monthly' },
      ],
    });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].inc).toBe(100);
    expect(months[0].out).toBe(40);
  });
});

describe('computeMoneyAgenda — expiries (warranty / voucher)', () => {
  it('pushes a warranty expiry with a null amount that does not affect out/inc', async () => {
    setRows({ items: [{ title: 'Apple Watch', warrantyUntil: new Date(2026, 2, 20) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0]).toMatchObject({ kind: 'warranty', label: 'Apple Watch', sub: 'Warranty expires', amount: null });
    expect(months[0].out).toBe(0);
  });

  it('falls back to "Item" label when title is missing', async () => {
    setRows({ items: [{ warrantyUntil: new Date(2026, 2, 20) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0].label).toBe('Item');
  });

  it('pushes a voucher expiry with a store+discount sub line and a null amount', async () => {
    setRows({ vouchers: [{ title: '10% off', store: 'Skroutz', discount: '10%', expiresAt: new Date(2026, 3, 5) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[1].entries[0]).toMatchObject({ kind: 'voucher', label: '10% off', sub: 'Skroutz 10%', amount: null });
  });

  it('trims the voucher sub line when store or discount is missing', async () => {
    setRows({ vouchers: [{ title: 'Coupon', store: '', discount: '5€', expiresAt: new Date(2026, 2, 10) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0].sub).toBe('5€');
  });

  it('falls back to "Voucher" label when title is missing', async () => {
    setRows({ vouchers: [{ store: 'Shop', discount: '', expiresAt: new Date(2026, 2, 10) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0].label).toBe('Voucher');
  });
});

describe('computeMoneyAgenda — sorting, rounding, dueThisMonth', () => {
  it('sorts pinned (installments) entries before unpinned ones within the same month, regardless of date', async () => {
    setRows({
      subs: [{ name: 'Late renewal', amount: 5, billingCycle: 'yearly', nextRenewal: new Date(2026, 2, 30) }],
      statements: [mkInstallmentStatement('2026-01', 10, 12, 50)],
    });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0].kind).toBe('installments');
    expect(months[0].entries[1].kind).toBe('renewal');
  });

  it('sorts same-pinned-state entries by date ascending', async () => {
    setRows({
      vouchers: [{ title: 'Later', expiresAt: new Date(2026, 2, 25), store: '', discount: '' }],
      items: [{ title: 'Earlier', warrantyUntil: new Date(2026, 2, 5) }],
    });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries.map((e) => e.label)).toEqual(['Earlier', 'Later']);
  });

  it('rounds out/inc to 2 decimal places to avoid floating point noise', async () => {
    setRows({
      recurring: [
        { kind: 'expense', vendor: 'A', vendorKey: 'a', amount: 0.1, date: new Date(2026, 1, 20), recurringCycle: 'monthly' },
        { kind: 'expense', vendor: 'B', vendorKey: 'b', amount: 0.2, date: new Date(2026, 1, 20), recurringCycle: 'monthly' },
      ],
    });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].out).toBe(0.3);
  });

  it('dueThisMonth mirrors months[0].out exactly', async () => {
    setRows({ subs: [{ name: 'X', amount: 42, billingCycle: 'monthly', nextRenewal: new Date(2026, 2, 1) }] });
    const { months, dueThisMonth } = await computeMoneyAgenda(NOW);
    expect(dueThisMonth).toBe(months[0].out);
    expect(dueThisMonth).toBe(42);
  });

  it('each entry date is serialized as an ISO string', async () => {
    setRows({ items: [{ title: 'X', warrantyUntil: new Date(2026, 2, 20) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(() => new Date(months[0].entries[0].date).toISOString()).not.toThrow();
    expect(months[0].entries[0].date).toBe(new Date(2026, 2, 20).toISOString());
  });
});

// P67 — open bills (P28) and goal deadlines (P12). Before this, a payable with a
// looming due date and a goal with a target date existed only in their own modules:
// the 3-month agenda and the .ics feed both skipped them entirely.
describe('computeMoneyAgenda — open bills (P67)', () => {
  it('places an unpaid bill on its due date and counts what is owed as money out', async () => {
    setRows({ bills: [{ title: 'ΔΕΗ ρεύμα', amount: 84.5, payments: [], dueDate: new Date(2026, 2, 20) }] });
    const { months, dueThisMonth } = await computeMoneyAgenda(NOW);
    const e = months[0].entries[0];
    expect(e.kind).toBe('payable');
    expect(e.label).toBe('ΔΕΗ ρεύμα');
    expect(e.amount).toBe(84.5);
    expect(e.date).toBe(new Date(2026, 2, 20).toISOString());
    expect(dueThisMonth).toBe(84.5);
  });

  it('counts only the remaining balance of a part-paid bill, not the full amount', async () => {
    setRows({ bills: [{ title: 'Κοινόχρηστα', amount: 100, payments: [{ amount: 30 }, { amount: 20 }], dueDate: new Date(2026, 3, 10) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[1].entries[0].amount).toBe(50);
    expect(months[1].out).toBe(50);
  });

  it('asks the DB only for unpaid, unarchived bills inside the window', async () => {
    setRows({});
    await computeMoneyAgenda(NOW);
    const f = billFind.mock.calls[0][0] as { paidAt: null; archived: unknown; dueDate: { $gte: Date; $lt: Date }; deletedAt: null };
    expect(f.paidAt).toBeNull();
    expect(f.archived).toEqual({ $ne: true });
    expect(f.dueDate.$gte).toEqual(new Date(2026, 2, 1));
    expect(f.dueDate.$lt).toEqual(new Date(2026, 5, 1));
    expect(f.deletedAt).toBeNull();
  });

  it('falls back to the vendor when a bill has no title', async () => {
    setRows({ bills: [{ title: '', vendor: 'ΟΤΕ', amount: 30, payments: [], dueDate: new Date(2026, 2, 12) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0].label).toBe('ΟΤΕ');
  });
});

describe('computeMoneyAgenda — goal deadlines (P67)', () => {
  it('shows a goal on its target date without touching the month totals', async () => {
    setRows({ goals: [{ title: 'Ταξίδι', targetAmount: 2000, contributions: [{ amount: 500 }], targetDate: new Date(2026, 4, 1) }] });
    const { months } = await computeMoneyAgenda(NOW);
    const e = months[2].entries[0];
    expect(e.kind).toBe('goal');
    expect(e.label).toBe('Ταξίδι');
    // A deadline is a date to notice, not a charge: no amount, so `out` stays clean.
    expect(e.amount).toBeNull();
    expect(months[2].out).toBe(0);
  });

  it('stays quiet about a goal already covered by its contributions', async () => {
    setRows({
      goals: [
        { title: 'Reached', targetAmount: 1000, contributions: [{ amount: 600 }, { amount: 400 }], targetDate: new Date(2026, 2, 20) },
        { title: 'Still short', targetAmount: 1000, contributions: [{ amount: 999 }], targetDate: new Date(2026, 2, 21) },
      ],
    });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries.map((e) => e.label)).toEqual(['Still short']);
  });

  it('keeps a goal with no target amount, since nothing can be "covered" yet', async () => {
    setRows({ goals: [{ title: 'Open ended', targetAmount: 0, contributions: [], targetDate: new Date(2026, 2, 9) }] });
    const { months } = await computeMoneyAgenda(NOW);
    expect(months[0].entries[0].label).toBe('Open ended');
  });

  it('asks the DB only for unarchived goals whose target date falls in the window', async () => {
    setRows({});
    await computeMoneyAgenda(NOW);
    const f = goalFind.mock.calls[0][0] as { archived: unknown; targetDate: { $gte: Date; $lt: Date }; deletedAt: null };
    expect(f.archived).toEqual({ $ne: true });
    expect(f.targetDate.$gte).toEqual(new Date(2026, 2, 1));
    expect(f.targetDate.$lt).toEqual(new Date(2026, 5, 1));
    expect(f.deletedAt).toBeNull();
  });
});
