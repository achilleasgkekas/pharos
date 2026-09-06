import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/calendar is one of the ~50 REST endpoints under /api/v1. It backs
// the 3-month money agenda, mirroring the web /calendar page. Unlike the thin { rows }
// wrappers, this route owns a lot of shaping logic that lives NOWHERE else, so a drift here
// silently breaks the calendar API:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any DB read),
//   - a fixed 3-month window (current month + next 2) with per-month blocks { key,label,entries,out,inc },
//   - subscription renewals STEPPED forward per billing cycle across the window (only >= windowStart),
//   - card installments aggregated into ONE pinned line per month, gated by remainingInstallments,
//   - recurring bills/income PROJECTED from each series' latest entry (deduped per kind|vendorKey,
//     only strictly-future occurrences), bills → out, income → inc,
//   - warranty + voucher expiries pushed with amount:null (they must NOT move the money totals),
//   - the per-month sort (pinned first, then by date) and the backward-compat flat `events` array
//     (renewal/voucher/warranty only), and the envelope { currency, dueThisMonth, months, events }.
// The route reads the real clock (new Date()), so we pin system time with fake timers for
// determinism. We exercise the REAL apiAuth helper (withAuth) and mock the DB (auth chain +
// the 5 models), computeInstallmentPlans (seam — the pure lib is tested on its own), and
// getAppSettings.

const {
  connectDBMock,
  userFindOne,
  userState,
  subFind,
  subState,
  statementFind,
  statementState,
  itemFind,
  itemState,
  voucherFind,
  voucherState,
  expenseFind,
  expenseState,
  billFind,
  billState,
  goalFind,
  goalState,
  computePlansMock,
  plansState,
  getAppSettingsMock,
  settingsState,
} = vi.hoisted(() => {
  const subState: { rows: unknown[] } = { rows: [] };
  const subFind = vi.fn(() => ({ select: () => ({ lean: async () => subState.rows }) }));
  const statementState: { rows: unknown[] } = { rows: [] };
  const statementFind = vi.fn(() => ({ lean: async () => statementState.rows }));
  const itemState: { rows: unknown[] } = { rows: [] };
  const itemFind = vi.fn(() => ({ select: () => ({ lean: async () => itemState.rows }) }));
  const voucherState: { rows: unknown[] } = { rows: [] };
  const voucherFind = vi.fn(() => ({ select: () => ({ lean: async () => voucherState.rows }) }));
  const expenseState: { rows: unknown[] } = { rows: [] };
  const expenseFind = vi.fn(() => ({ sort: () => ({ select: () => ({ lean: async () => expenseState.rows }) }) }));
  const billState: { rows: unknown[] } = { rows: [] };
  const billFind = vi.fn(() => ({ select: () => ({ lean: async () => billState.rows }) }));
  const goalState: { rows: unknown[] } = { rows: [] };
  const goalFind = vi.fn(() => ({ select: () => ({ lean: async () => goalState.rows }) }));
  const plansState: {
    plans: Array<{ done: boolean; remainingInstallments: number; perAmount: number }>;
  } = { plans: [] };
  const computePlansMock = vi.fn(() => plansState.plans);
  const settingsState: { currency: string } = { currency: 'EUR' };
  const getAppSettingsMock = vi.fn(async () => ({ currency: settingsState.currency }));
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userState,
    subFind,
    subState,
    statementFind,
    statementState,
    itemFind,
    itemState,
    voucherFind,
    voucherState,
    expenseFind,
    expenseState,
    billFind,
    billState,
    goalFind,
    goalState,
    computePlansMock,
    plansState,
    getAppSettingsMock,
    settingsState,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { find: voucherFind } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind } }));
vi.mock('@/models/Goal', () => ({ Goal: { find: goalFind } }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: computePlansMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/calendar';

/** Minimal NextRequest stand-in — the route only reads headers.get. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

type Entry = { date: string; kind: string; label: string; sub: string; amount: number | null; pinned?: boolean };
type MonthBlock = { key: string; label: string; entries: Entry[]; out: number; inc: number };
type Body = {
  currency: string;
  dueThisMonth: number;
  months: MonthBlock[];
  events: Array<{ date: string; kind: string; label: string; amount?: number }>;
};

// Pin the clock at 15 July 2026 (local noon-ish). Window → July, Aug, Sep 2026.
// Local Date(y, m, d) construction everywhere keeps month-bucketing timezone-stable.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
  subState.rows = [];
  statementState.rows = [];
  itemState.rows = [];
  voucherState.rows = [];
  expenseState.rows = [];
  billState.rows = [];
  goalState.rows = [];
  plansState.plans = [];
  settingsState.currency = 'EUR';
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  subFind.mockImplementation(() => ({ select: () => ({ lean: async () => subState.rows }) }));
  statementFind.mockImplementation(() => ({ lean: async () => statementState.rows }));
  itemFind.mockImplementation(() => ({ select: () => ({ lean: async () => itemState.rows }) }));
  voucherFind.mockImplementation(() => ({ select: () => ({ lean: async () => voucherState.rows }) }));
  expenseFind.mockImplementation(() => ({ sort: () => ({ select: () => ({ lean: async () => expenseState.rows }) }) }));
  billFind.mockImplementation(() => ({ select: () => ({ lean: async () => billState.rows }) }));
  goalFind.mockImplementation(() => ({ select: () => ({ lean: async () => goalState.rows }) }));
  computePlansMock.mockImplementation(() => plansState.plans);
  getAppSettingsMock.mockImplementation(async () => ({ currency: settingsState.currency }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('auth gate', () => {
  it('without a token → 401, never reads the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(subFind).not.toHaveBeenCalled();
    expect(statementFind).not.toHaveBeenCalled();
    expect(computePlansMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never reads the DB', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(subFind).not.toHaveBeenCalled();
    expect(statementFind).not.toHaveBeenCalled();
  });
});

describe('window skeleton + envelope', () => {
  it('returns 3 empty month blocks for a fresh install, with the expected envelope keys', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as Body;
    expect(Object.keys(json).sort()).toEqual(['currency', 'dueThisMonth', 'events', 'months'].sort());
    expect(json.months.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(json.months.map((m) => m.label)).toEqual(['July 2026', 'August 2026', 'September 2026']);
    for (const m of json.months) {
      expect(m.entries).toEqual([]);
      expect(m.out).toBe(0);
      expect(m.inc).toBe(0);
    }
    expect(json.dueThisMonth).toBe(0);
    expect(json.events).toEqual([]);
  });

  it('passes through the configured currency from getAppSettings', async () => {
    settingsState.currency = 'USD';
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    expect(json.currency).toBe('USD');
  });
});

describe('subscription renewals (stepped per cycle)', () => {
  it('steps a monthly sub through every month in the window, adding each to that month out', async () => {
    subState.rows = [{ name: 'Netflix', amount: 15, billingCycle: 'monthly', nextRenewal: new Date(2026, 6, 20) }];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const renewals = json.months.map((m) => m.entries.filter((e) => e.kind === 'renewal'));
    expect(renewals.map((r) => r.length)).toEqual([1, 1, 1]); // July, Aug, Sep
    expect(json.months.map((m) => m.out)).toEqual([15, 15, 15]);
    expect(json.dueThisMonth).toBe(15);
    expect(renewals[0][0].label).toBe('Netflix');
    expect(renewals[0][0].sub).toBe('Renews monthly');
  });

  it('projects a renewal whose nextRenewal predates the window once stepping lands inside it', async () => {
    // nextRenewal in May; monthly stepping only surfaces the occurrences from windowStart on.
    subState.rows = [{ name: 'Spotify', amount: 10, billingCycle: 'monthly', nextRenewal: new Date(2026, 4, 20) }];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const counts = json.months.map((m) => m.entries.filter((e) => e.kind === 'renewal').length);
    expect(counts).toEqual([1, 1, 1]);
    expect(json.months.every((m) => m.out === 10)).toBe(true);
  });
});

describe('installments (aggregated pinned line, gated by remaining)', () => {
  it('emits one pinned installments line per month it is still due, and drops the done plan', async () => {
    plansState.plans = [
      { done: false, remainingInstallments: 2, perAmount: 50 },
      { done: true, remainingInstallments: 5, perAmount: 99 }, // done → excluded before the loop
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const inst = json.months.map((m) => m.entries.filter((e) => e.kind === 'installments'));
    // remaining 2 → due in month 1 (>=1) and month 2 (>=2), not month 3 (>=3).
    expect(inst.map((x) => x.length)).toEqual([1, 1, 0]);
    expect(inst[0][0].pinned).toBe(true);
    expect(inst[0][0].amount).toBe(50);
    expect(inst[0][0].sub).toBe('1 active plan');
    expect(json.months.map((m) => m.out)).toEqual([50, 50, 0]);
    expect(json.dueThisMonth).toBe(50);
    expect(computePlansMock).toHaveBeenCalledOnce();
  });

  it('sums perAmount across plans and pluralises the sub when more than one is active', async () => {
    plansState.plans = [
      { done: false, remainingInstallments: 3, perAmount: 40 },
      { done: false, remainingInstallments: 3, perAmount: 25 },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const july = json.months[0].entries.find((e) => e.kind === 'installments')!;
    expect(july.amount).toBe(65);
    expect(july.sub).toBe('2 active plans');
  });
});

describe('recurring bills / income (projected from latest entry)', () => {
  it('projects future bills into out and future income into inc', async () => {
    expenseState.rows = [
      { kind: 'expense', vendor: 'DEH', vendorKey: 'deh', amount: 62, date: new Date(2026, 5, 25), recurringCycle: 'monthly' },
      { kind: 'income', vendor: 'Salary', vendorKey: 'salary', amount: 2000, date: new Date(2026, 5, 28), recurringCycle: 'monthly' },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const bills = json.months.flatMap((m) => m.entries).filter((e) => e.kind === 'bill');
    const incomes = json.months.flatMap((m) => m.entries).filter((e) => e.kind === 'income');
    expect(bills.length).toBe(3); // 25 Jul, 25 Aug, 25 Sep (all after 15 Jul now)
    expect(bills[0].label).toBe('DEH');
    expect(bills[0].sub).toBe('Expected monthly');
    expect(json.months.map((m) => m.out)).toEqual([62, 62, 62]);
    expect(incomes.length).toBe(3);
    expect(json.months.map((m) => m.inc)).toEqual([2000, 2000, 2000]);
  });

  it('dedupes a recurring series by kind|vendorKey (only the latest entry projects)', async () => {
    // Two rows of the same series (find returns them newest-first); only one should project.
    expenseState.rows = [
      { kind: 'expense', vendor: 'DEH', vendorKey: 'deh', amount: 62, date: new Date(2026, 5, 25), recurringCycle: 'monthly' },
      { kind: 'expense', vendor: 'DEH', vendorKey: 'deh', amount: 59, date: new Date(2026, 4, 25), recurringCycle: 'monthly' },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    // If it did not dedupe, July out would be 62+59; it must be just 62.
    expect(json.months[0].out).toBe(62);
    expect(json.months[0].entries.filter((e) => e.kind === 'bill').length).toBe(1);
  });
});

describe('expiries + backward-compat events', () => {
  it('pushes warranty + voucher expiries with amount:null so they never move the money totals', async () => {
    itemState.rows = [{ title: 'Apple Watch', warrantyUntil: new Date(2026, 7, 5) }]; // August
    voucherState.rows = [{ title: '10% Skroutz', store: 'Skroutz', discount: '10%', expiresAt: new Date(2026, 8, 10) }]; // September
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const warranty = json.months[1].entries.find((e) => e.kind === 'warranty')!;
    const voucher = json.months[2].entries.find((e) => e.kind === 'voucher')!;
    expect(warranty.amount).toBeNull();
    expect(voucher.amount).toBeNull();
    // amount:null entries must not touch out/inc.
    expect(json.months.every((m) => m.out === 0 && m.inc === 0)).toBe(true);
  });

  it('keeps a flat events array of ONLY renewal/voucher/warranty, sorted by date', async () => {
    subState.rows = [{ name: 'Netflix', amount: 15, billingCycle: 'monthly', nextRenewal: new Date(2026, 6, 20) }];
    itemState.rows = [{ title: 'Apple Watch', warrantyUntil: new Date(2026, 7, 5) }];
    voucherState.rows = [{ title: '10% Skroutz', store: 'Skroutz', discount: '10%', expiresAt: new Date(2026, 8, 10) }];
    plansState.plans = [{ done: false, remainingInstallments: 2, perAmount: 50 }]; // installments must NOT appear in events
    expenseState.rows = [
      { kind: 'expense', vendor: 'DEH', vendorKey: 'deh', amount: 62, date: new Date(2026, 5, 25), recurringCycle: 'monthly' }, // bill excluded
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const kinds = json.events.map((e) => e.kind);
    expect(new Set(kinds)).toEqual(new Set(['renewal', 'warranty', 'voucher']));
    expect(kinds).not.toContain('installments');
    expect(kinds).not.toContain('bill');
    const dates = json.events.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates); // already sorted ascending
  });
});

describe('per-month sort', () => {
  it('orders the pinned installments line before a same-month renewal', async () => {
    // Renewal on 20 Jul (non-pinned); installments pinned at the first of July.
    subState.rows = [{ name: 'Netflix', amount: 15, billingCycle: 'monthly', nextRenewal: new Date(2026, 6, 20) }];
    plansState.plans = [{ done: false, remainingInstallments: 1, perAmount: 50 }];
    const res = await GET(makeReq());
    const json = (await res.json()) as Body;
    const july = json.months[0].entries;
    expect(july[0].kind).toBe('installments');
    expect(july[0].pinned).toBe(true);
    expect(july.some((e) => e.kind === 'renewal')).toBe(true);
  });
});
