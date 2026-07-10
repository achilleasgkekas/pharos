import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/reports is one of the ~50 REST endpoints the Expo mobile app drives. It backs the
// mobile Reports/analytics screen, mirroring the web /reports page. It owns a large amount of pure
// aggregation that lives NOWHERE else, so a drift here silently corrupts the mobile charts:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any DB read),
//   - net position = owned-inventory value − installments still owed (active plans only),
//   - inventory value by category (owned items, value>0, rounded, desc),
//   - the ?months= date-range selector (6/12/24) that widens BOTH the monthly-spend window
//     (legacy default 6) and the cash-flow window (legacy default 12); invalid → legacy defaults,
//   - this-month / this-year income+expense sums (from amount>0 docs) and top-8 by-category,
//   - budget-vs-actual for budgeted categories (this month only),
//   - spend-by-store + biggest single purchases (top 8) from receipts,
//   - warranties expiring within the next 150 days (from owned items),
//   - active subscriptions by category as a monthly-equivalent (billing-cycle multiplier),
//   - installment payoff (all plans, linked plans resolve item titles as label),
//   - the top-level envelope { currency, months, netPosition, thisMonth, thisYear, ... }.
// The route reads the real clock (new Date()), so we pin system time with fake timers for
// determinism. We exercise the REAL apiAuth helper (withAuth) and mock the DB (auth chain +
// the 5 models), computeInstallmentPlans (seam — the pure lib is tested on its own), and
// getAppSettings.

const {
  connectDBMock,
  userFindOne,
  userState,
  expenseFind,
  expenseState,
  itemFind,
  itemState,
  statementFind,
  statementState,
  receiptFind,
  receiptState,
  subFind,
  subState,
  computePlansMock,
  plansState,
  getAppSettingsMock,
  settingsState,
} = vi.hoisted(() => {
  const expenseState: { rows: unknown[] } = { rows: [] };
  const expenseFind = vi.fn(() => ({ select: () => ({ lean: async () => expenseState.rows }) }));
  const itemState: { rows: unknown[] } = { rows: [] };
  const itemFind = vi.fn(() => ({ select: () => ({ lean: async () => itemState.rows }) }));
  const statementState: { rows: unknown[] } = { rows: [] };
  const statementFind = vi.fn(() => ({ lean: async () => statementState.rows }));
  const receiptState: { rows: unknown[] } = { rows: [] };
  const receiptFind = vi.fn(() => ({ select: () => ({ lean: async () => receiptState.rows }) }));
  const subState: { rows: unknown[] } = { rows: [] };
  const subFind = vi.fn(() => ({ select: () => ({ lean: async () => subState.rows }) }));
  const plansState: { plans: unknown[] } = { plans: [] };
  const computePlansMock = vi.fn(() => plansState.plans);
  const settingsState: { currency: string; budgets: Record<string, number> } = { currency: 'EUR', budgets: {} };
  const getAppSettingsMock = vi.fn(async () => ({ currency: settingsState.currency, budgets: settingsState.budgets }));
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userState,
    expenseFind,
    expenseState,
    itemFind,
    itemState,
    statementFind,
    statementState,
    receiptFind,
    receiptState,
    subFind,
    subState,
    computePlansMock,
    plansState,
    getAppSettingsMock,
    settingsState,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: receiptFind } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subFind } }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: computePlansMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/reports';

/** Minimal NextRequest stand-in — the route reads headers.get (auth) and nextUrl.searchParams (months). */
function makeReq(opts: { auth?: string | null; months?: number | string } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  const url = new URL(BASE + (opts.months != null ? `?months=${opts.months}` : ''));
  return {
    nextUrl: url,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

type Body = {
  currency: string;
  months: number;
  netPosition: { inventoryValue: number; installmentsOwed: number; activePlans: number; net: number };
  thisMonth: { income: number; expense: number; net: number };
  thisYear: { income: number; expense: number; net: number };
  byCategory: Array<{ category: string; total: number }>;
  budgets: Array<{ category: string; limit: number; spent: number }>;
  monthly: Array<{ period: string; expense: number; income: number }>;
  incomeExpense: Array<{ period: string; income: number; expense: number }>;
  upcomingInstallments: Array<{ period: string; amount: number }>;
  spendByStore: Array<{ name: string; total: number; count: number }>;
  subsByCategory: Array<{ name: string; value: number }>;
  inventoryByCategory: Array<{ name: string; value: number }>;
  biggestPurchases: Array<{ store: string; total: number; date: string }>;
  warrantiesExpiring: Array<{ title: string; until: string; days: number }>;
  installmentPayoff: Array<{ key: string; label: string; linked: boolean; done: boolean }>;
};

// Pin the clock at 15 July 2026. thisMonth = 2026-07, thisYear = 2026.
// Local Date(y, m, d) construction keeps month-bucketing timezone-stable.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
  expenseState.rows = [];
  itemState.rows = [];
  statementState.rows = [];
  receiptState.rows = [];
  subState.rows = [];
  plansState.plans = [];
  settingsState.currency = 'EUR';
  settingsState.budgets = {};
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  expenseFind.mockImplementation(() => ({ select: () => ({ lean: async () => expenseState.rows }) }));
  itemFind.mockImplementation(() => ({ select: () => ({ lean: async () => itemState.rows }) }));
  statementFind.mockImplementation(() => ({ lean: async () => statementState.rows }));
  receiptFind.mockImplementation(() => ({ select: () => ({ lean: async () => receiptState.rows }) }));
  subFind.mockImplementation(() => ({ select: () => ({ lean: async () => subState.rows }) }));
  computePlansMock.mockImplementation(() => plansState.plans);
  getAppSettingsMock.mockImplementation(async () => ({ currency: settingsState.currency, budgets: settingsState.budgets }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('auth gate', () => {
  it('without a token → 401, never reads the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(expenseFind).not.toHaveBeenCalled();
    expect(itemFind).not.toHaveBeenCalled();
    expect(statementFind).not.toHaveBeenCalled();
    expect(computePlansMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never reads the DB', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(expenseFind).not.toHaveBeenCalled();
    expect(receiptFind).not.toHaveBeenCalled();
  });
});

describe('net position + inventory by category', () => {
  it('counts only owned items, values purchased over current, and subtracts active installments', async () => {
    itemState.rows = [
      { status: 'installed', purchasedPrice: 500, currentPrice: 999, category: 'compute' },
      { status: 'received', currentPrice: 300, category: 'network' }, // no purchasedPrice → currentPrice
      { status: 'researching', currentPrice: 1000, category: 'compute' }, // NOT owned → ignored
    ];
    plansState.plans = [
      { key: 'p1', done: false, remainingAmount: 200, remainingInstallments: 4, perAmount: 50, itemIds: [], label: 'PLAISIO', paidInstallments: 2, totalInstallments: 6 },
      { key: 'p2', done: true, remainingAmount: 999, remainingInstallments: 0, perAmount: 0, itemIds: [], label: 'OLD', paidInstallments: 12, totalInstallments: 12 }, // done → not owed
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.netPosition.inventoryValue).toBe(800); // 500 + 300
    expect(json.netPosition.installmentsOwed).toBe(200);
    expect(json.netPosition.activePlans).toBe(1);
    expect(json.netPosition.net).toBe(600);
    // owned only, value>0, desc
    expect(json.inventoryByCategory).toEqual([
      { name: 'compute', value: 500 },
      { name: 'network', value: 300 },
    ]);
  });

  it('zeroes net position for a fresh install', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.netPosition).toEqual({ inventoryValue: 0, installmentsOwed: 0, activePlans: 0, net: 0 });
    expect(json.inventoryByCategory).toEqual([]);
  });
});

describe('date-range window selector (?months=)', () => {
  it('defaults to asymmetric legacy windows (monthly=6, cash-flow=12) with months:12', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.months).toBe(12);
    expect(json.monthly.length).toBe(6);
    expect(json.incomeExpense.length).toBe(12);
    // monthly window ends at the current month
    expect(json.monthly.map((m) => m.period)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
    expect(json.incomeExpense[0].period).toBe('2025-08');
    expect(json.incomeExpense[11].period).toBe('2026-07');
  });

  it('?months=6 widens both windows to 6 and reports months:6', async () => {
    const res = await GET(makeReq({ months: 6 }));
    const json = (await res.json()) as Body;
    expect(json.months).toBe(6);
    expect(json.monthly.length).toBe(6);
    expect(json.incomeExpense.length).toBe(6);
    expect(json.incomeExpense[0].period).toBe('2026-02');
  });

  it('?months=24 widens both windows to 24', async () => {
    const res = await GET(makeReq({ months: 24 }));
    const json = (await res.json()) as Body;
    expect(json.months).toBe(24);
    expect(json.monthly.length).toBe(24);
    expect(json.incomeExpense.length).toBe(24);
  });

  it('an invalid months value falls back to the legacy defaults', async () => {
    const res = await GET(makeReq({ months: 9 })); // not in [6,12,24]
    const json = (await res.json()) as Body;
    expect(json.months).toBe(12);
    expect(json.monthly.length).toBe(6);
    expect(json.incomeExpense.length).toBe(12);
  });
});

describe('income / expense sums + by-category', () => {
  it('buckets amount>0 docs into this-month / this-year totals and top-8 expense categories', async () => {
    expenseState.rows = [
      { kind: 'expense', amount: 60, category: 'utilities', period: '2026-07' }, // this month + year
      { kind: 'expense', amount: 40, category: 'fuel', period: '2026-07' }, // this month + year
      { kind: 'income', amount: 2000, category: 'salary', period: '2026-07' }, // this month income
      { kind: 'expense', amount: 100, category: 'utilities', period: '2026-03' }, // this year only
      { kind: 'expense', amount: 0, category: 'noise', period: '2026-07' }, // amount<=0 → skipped
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.thisMonth).toEqual({ income: 2000, expense: 100, net: 1900 });
    expect(json.thisYear).toEqual({ income: 2000, expense: 200, net: 1800 });
    // year expense by category, desc: utilities 160 (60+100), fuel 40
    expect(json.byCategory).toEqual([
      { category: 'utilities', total: 160 },
      { category: 'fuel', total: 40 },
    ]);
    // the amount<=0 doc contributes to nothing
    expect(json.byCategory.some((c) => c.category === 'noise')).toBe(false);
  });

  it('fills the monthly + cash-flow buckets by period', async () => {
    expenseState.rows = [
      { kind: 'expense', amount: 50, category: 'utilities', period: '2026-06' },
      { kind: 'income', amount: 900, category: 'salary', period: '2026-06' },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const june = json.monthly.find((m) => m.period === '2026-06')!;
    expect(june).toEqual({ period: '2026-06', expense: 50, income: 900 });
    const juneFlow = json.incomeExpense.find((m) => m.period === '2026-06')!;
    expect(juneFlow).toEqual({ period: '2026-06', expense: 50, income: 900 });
  });
});

describe('budgets (this month, budgeted categories only)', () => {
  it('compares this-month spend against configured budgets, ignoring zero/blank limits', async () => {
    settingsState.budgets = { utilities: 100, groceries: 0, fuel: 50 };
    expenseState.rows = [
      { kind: 'expense', amount: 120, category: 'utilities', period: '2026-07' },
      { kind: 'expense', amount: 30, category: 'fuel', period: '2026-07' },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    // zero-limit groceries dropped; sorted by limit desc → utilities (100) then fuel (50)
    expect(json.budgets).toEqual([
      { category: 'utilities', limit: 100, spent: 120 },
      { category: 'fuel', limit: 50, spent: 30 },
    ]);
  });
});

describe('receipts: spend by store + biggest purchases', () => {
  it('aggregates store totals+counts and surfaces the biggest single receipts', async () => {
    receiptState.rows = [
      { store: 'Skroutz', total: 200, date: new Date(2026, 5, 1) },
      { store: 'Skroutz', total: 50, date: new Date(2026, 5, 2) },
      { store: 'Plaisio', total: 400, date: new Date(2026, 4, 1) },
      { store: 'FreeStore', total: 0, date: new Date(2026, 4, 1) }, // excluded from biggest (total 0)
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    // spendByStore keeps every store (no total>0 filter); only biggestPurchases drops zeros.
    expect(json.spendByStore).toEqual([
      { name: 'Plaisio', total: 400, count: 1 },
      { name: 'Skroutz', total: 250, count: 2 },
      { name: 'FreeStore', total: 0, count: 1 },
    ]);
    expect(json.biggestPurchases.map((b) => ({ store: b.store, total: b.total }))).toEqual([
      { store: 'Plaisio', total: 400 },
      { store: 'Skroutz', total: 200 },
      { store: 'Skroutz', total: 50 },
    ]);
  });
});

describe('warranties expiring within 150 days', () => {
  it('keeps only owned-item warranties 0..150 days out, sorted soonest-first', async () => {
    itemState.rows = [
      { status: 'installed', title: 'Apple Watch', warrantyUntil: new Date(2026, 7, 5) }, // ~21 days
      { status: 'received', title: 'RTX 5080', warrantyUntil: new Date(2026, 10, 1) }, // ~109 days
      { status: 'installed', title: 'Old Mouse', warrantyUntil: new Date(2026, 5, 1) }, // already expired → dropped
      { status: 'installed', title: 'Far Future', warrantyUntil: new Date(2027, 6, 1) }, // >150 days → dropped
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.warrantiesExpiring.map((w) => w.title)).toEqual(['Apple Watch', 'RTX 5080']);
    expect(json.warrantiesExpiring[0].days).toBeLessThan(json.warrantiesExpiring[1].days);
  });
});

describe('subscriptions by category (monthly-equivalent)', () => {
  it('normalises each cycle to a monthly figure and groups by category', async () => {
    subState.rows = [
      { amount: 12, billingCycle: 'monthly', category: 'entertainment' },
      { amount: 120, billingCycle: 'yearly', category: 'cloud' }, // → 10/mo
      { amount: 30, billingCycle: 'quarterly', category: 'cloud' }, // → 10/mo, folds into cloud (20)
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.subsByCategory).toEqual([
      { name: 'cloud', value: 20 },
      { name: 'entertainment', value: 12 },
    ]);
  });
});

describe('installment payoff labels', () => {
  it('resolves linked plans to their item titles, falling back to the plan label', async () => {
    itemState.rows = [{ _id: 'it1', status: 'installed', title: 'RTX 5080', purchasedPrice: 1400, category: 'compute' }];
    plansState.plans = [
      { key: 'p1', done: false, itemIds: ['it1'], label: 'TECHLAMB', paidInstallments: 3, totalInstallments: 12, perAmount: 120.5, remainingAmount: 1084.5 },
      { key: 'p2', done: false, itemIds: [], label: 'KOTSOVOLOS', paidInstallments: 1, totalInstallments: 36, perAmount: 25, remainingAmount: 875 },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const linked = json.installmentPayoff.find((p) => p.key === 'p1')!;
    const unlinked = json.installmentPayoff.find((p) => p.key === 'p2')!;
    expect(linked.label).toBe('RTX 5080');
    expect(linked.linked).toBe(true);
    expect(unlinked.label).toBe('KOTSOVOLOS');
    expect(unlinked.linked).toBe(false);
  });
});

describe('envelope', () => {
  it('exposes the full top-level report shape and passes through currency', async () => {
    settingsState.currency = 'USD';
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as Body;
    expect(json.currency).toBe('USD');
    expect(Object.keys(json).sort()).toEqual(
      [
        'currency', 'months', 'netPosition', 'thisMonth', 'thisYear', 'byCategory', 'budgets',
        'monthly', 'incomeExpense', 'upcomingInstallments', 'spendByStore', 'subsByCategory',
        'inventoryByCategory', 'biggestPurchases', 'warrantiesExpiring', 'installmentPayoff',
      ].sort()
    );
    expect(getAppSettingsMock).toHaveBeenCalledOnce();
  });

  it('projects upcoming installment obligations for the next 6 months', async () => {
    plansState.plans = [{ key: 'p1', done: false, remainingAmount: 100, remainingInstallments: 2, perAmount: 50, itemIds: [], label: 'X', paidInstallments: 4, totalInstallments: 6 }];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.upcomingInstallments.length).toBe(6);
    // remaining 2 → due next month (n=1) and the one after (n=2), then 0
    expect(json.upcomingInstallments.map((u) => u.amount)).toEqual([50, 50, 0, 0, 0, 0]);
    expect(json.upcomingInstallments[0].period).toBe('2026-08');
  });
});
