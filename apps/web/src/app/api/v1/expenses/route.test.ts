import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/expenses is one of the ~50 REST endpoints under /api/v1.
// The [id] PATCH/DELETE half (and serialize) is already covered; this closes the collection
// route. Its route-level logic lives NOWHERE else, so a drift here silently corrupts the
// API contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - POST validation ORDER: `vendor` required (strField trim → blank → 400 'vendor required'),
//     then `amount` must parse (numField → null → 400 'amount must be a number', but 0 is VALID),
//     then `date` (truthiness-gated → new Date, NaN → 400 'invalid date'), all BEFORE any DB touch;
//     then the create arg (kind/recurringCycle enum-gated, category default 'other', vendorKey
//     derived from vendor, verified forced true), and a SPEC { expense } wrapper at 201,
//   - GET: the kind filter ({ kind } only for income|expense, else {}), the { date: -1 } sort,
//     the updatedSince cursor flipping withDeleted on both queries, AND the anomaly pass being
//     SKIPPED on incremental sync (updatedSince → [] so partial slices don't produce wrong medians).
// We exercise the REAL apiAuth/apiBody/apiList helpers, the REAL vendorKey + trimExpense/
// computeAnomalies, and only mock the DB seam.

const { connectDBMock, userFindOne, userState, expenseFind, expenseCount, expenseCreate, findQuery, countQuery, state, appSettingsState, getAppSettingsMock } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; total: number; lastCreate: Record<string, unknown> | null } = {
      docs: [],
      total: 0,
      lastCreate: null,
    };
    // getAppSettings() — the route reads .categoryRules (P15 vendor→category auto-rule) and
    // .currency (P9: the base currency the posted amount is resolved against).
    const appSettingsState: { categoryRules: unknown[]; currency: string } = { categoryRules: [], currency: 'EUR' };
    const getAppSettingsMock = vi.fn(async () => ({ categoryRules: appSettingsState.categoryRules, currency: appSettingsState.currency }));
    // User model — bearerUser does User.findOne(...).select(...).lean()
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    // Expense.find(filter).sort().skip().limit()[.setOptions()].lean() — a self-returning chain.
    const lean = vi.fn(async () => state.docs);
    const findQuery: Record<string, unknown> = {};
    for (const m of ['sort', 'skip', 'limit', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = lean;
    const expenseFind = vi.fn(() => findQuery);
    // Expense.countDocuments(filter) — thenable resolving to the total, self-returning setOptions.
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const expenseCount = vi.fn(() => countQuery);
    // Expense.create(arg) returns a doc exposing .toObject() (the route trims doc.toObject()).
    const expenseCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-06T00:00:00Z'), ...arg }) };
    });
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, expenseFind, expenseCount, expenseCreate, findQuery, countQuery, state, appSettingsState, getAppSettingsMock };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind, countDocuments: expenseCount, create: expenseCreate } }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/expenses';

/** Minimal NextRequest stand-in — the route only reads url, headers.get, and json(). */
function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

function findFilter(): Record<string, unknown> {
  return (expenseFind.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}
function countFilter(): Record<string, unknown> {
  return (expenseCount.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  state.lastCreate = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  appSettingsState.categoryRules = [];
  appSettingsState.currency = 'EUR';
  vi.clearAllMocks();
  // clearAllMocks resets return values on the chain stubs → re-point them.
  for (const m of ['sort', 'skip', 'limit', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  expenseFind.mockImplementation(() => findQuery);
  expenseCount.mockImplementation(() => countQuery);
  expenseCreate.mockImplementation(async (arg: Record<string, unknown>) => {
    state.lastCreate = arg;
    return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-06T00:00:00Z'), ...arg }) };
  });
  getAppSettingsMock.mockImplementation(async () => ({ categoryRules: appSettingsState.categoryRules, currency: appSettingsState.currency }));
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(expenseFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { vendor: 'X', amount: 1 } }));
    expect(res.status).toBe(401);
    expect(expenseCreate).not.toHaveBeenCalled();
  });
});

describe('POST validation', () => {
  it('rejects a missing vendor with 400 and never creates', async () => {
    const res = await POST(makeReq({ body: { amount: 10 } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'vendor required' });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only vendor with 400 (strField trims to empty)', async () => {
    const res = await POST(makeReq({ body: { vendor: '   ', amount: 10 } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'vendor required' });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('rejects a missing amount with 400 and never creates', async () => {
    const res = await POST(makeReq({ body: { vendor: 'OTE' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'amount must be a number' });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('rejects an unparseable amount with 400', async () => {
    const res = await POST(makeReq({ body: { vendor: 'OTE', amount: 'abc' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'amount must be a number' });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('accepts amount 0 (finite, not null) and creates', async () => {
    const res = await POST(makeReq({ body: { vendor: 'Refund', amount: 0 } }));
    expect(res.status).toBe(201);
    expect((state.lastCreate as Record<string, unknown>).amount).toBe(0);
  });

  it('rejects an invalid date with 400 (vendor + amount valid)', async () => {
    const res = await POST(makeReq({ body: { vendor: 'OTE', amount: 10, date: 'not-a-date' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid date' });
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it('creates a minimal expense with all defaults, derived vendorKey, now-date, and { expense } at 201', async () => {
    const res = await POST(makeReq({ body: { vendor: '  Coffee  ', amount: 3.5 } }));
    expect(res.status).toBe(201);
    const c = state.lastCreate as Record<string, unknown>;
    expect(c).toMatchObject({
      kind: 'expense', vendor: 'Coffee', vendorKey: 'coffee', category: 'other', amount: 3.5,
      period: '', recurring: false, recurringCycle: '', paymentMethod: '', notes: '', verified: true,
    });
    expect(c.date).toBeInstanceOf(Date); // defaulted to new Date()
    const json = (await res.json()) as { expense: Record<string, unknown> };
    expect(json).toHaveProperty('expense');
    expect(json).not.toHaveProperty('ok');
    expect(json).not.toHaveProperty('data');
    expect(json.expense).toMatchObject({ id: 'newid', kind: 'expense', vendor: 'Coffee', amount: 3.5, category: 'other', verified: true });
  });

  // P15 vendor→category auto-rule (API gap): the web actions apply this on
  // every creation path; this route was the one gap where an omitted category always
  // became the literal 'other', bypassing the rule engine — same vendor, different
  // category depending on whether the expense came from the web app or the API.
  it('applies a matching vendor→category rule when category is omitted', async () => {
    appSettingsState.categoryRules = [
      { id: 'r1', match: 'Netflix', matchType: 'vendor', category: 'subscription', recurring: false, recurringCycle: '' },
    ];
    const res = await POST(makeReq({ body: { vendor: 'Netflix', amount: 15.99 } }));
    expect(res.status).toBe(201);
    expect((state.lastCreate as Record<string, unknown>).category).toBe('subscription');
    const json = (await res.json()) as { expense: Record<string, unknown> };
    expect(json.expense.category).toBe('subscription');
  });

  it('an explicit category always wins over a matching rule', async () => {
    appSettingsState.categoryRules = [
      { id: 'r1', match: 'Netflix', matchType: 'vendor', category: 'subscription', recurring: false, recurringCycle: '' },
    ];
    const res = await POST(makeReq({ body: { vendor: 'Netflix', amount: 15.99, category: 'entertainment' } }));
    expect(res.status).toBe(201);
    expect((state.lastCreate as Record<string, unknown>).category).toBe('entertainment');
  });

  it('falls back to "other" when category is omitted and no rule matches', async () => {
    appSettingsState.categoryRules = [
      { id: 'r1', match: 'Netflix', matchType: 'vendor', category: 'subscription', recurring: false, recurringCycle: '' },
    ];
    const res = await POST(makeReq({ body: { vendor: 'Random Shop', amount: 9 } }));
    expect(res.status).toBe(201);
    expect((state.lastCreate as Record<string, unknown>).category).toBe('other');
  });

  it('matches a rule against notes when the vendor alone does not match (matchType: text)', async () => {
    appSettingsState.categoryRules = [
      { id: 'r1', match: 'grocery run', matchType: 'text', category: 'groceries', recurring: false, recurringCycle: '' },
    ];
    await POST(makeReq({ body: { vendor: 'Corner Store', amount: 22, notes: 'weekly grocery run' } }));
    expect((state.lastCreate as Record<string, unknown>).category).toBe('groceries');
  });

  it('coerces a full body: enum kind/cycle, trimmed fields, parsed date, Greek→latin vendorKey', async () => {
    const res = await POST(makeReq({
      body: {
        kind: 'income', vendor: 'ΔΕΗ', amount: '42.50', category: 'utilities', date: '2026-06-15',
        period: '2026-06', recurring: true, recurringCycle: 'monthly', paymentMethod: 'bank', notes: 'bill',
      },
    }));
    expect(res.status).toBe(201);
    const c = state.lastCreate as Record<string, unknown>;
    expect(c).toMatchObject({
      kind: 'income', vendor: 'ΔΕΗ', vendorKey: 'dei', category: 'utilities', amount: 42.5,
      period: '2026-06', recurring: true, recurringCycle: 'monthly', paymentMethod: 'bank', notes: 'bill', verified: true,
    });
    expect(c.date).toBeInstanceOf(Date);
    expect((c.date as Date).toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('falls back invalid kind → expense and invalid recurringCycle → empty', async () => {
    await POST(makeReq({ body: { vendor: 'OTE', amount: 5, kind: 'refund', recurringCycle: 'biweekly' } }));
    const c = state.lastCreate as Record<string, unknown>;
    expect(c.kind).toBe('expense');
    expect(c.recurringCycle).toBe('');
  });

  it('trims+caps space to 40 chars and cleans a submitted split array', async () => {
    await POST(makeReq({
      body: {
        vendor: 'Sailing supplies', amount: 60,
        space: '  ' + 'Kalamos'.repeat(10) + '  ',
        split: [{ name: '  Anna  ', share: '30', settled: false }, { name: '   ', share: 5, settled: false }],
      },
    }));
    const c = state.lastCreate as Record<string, unknown>;
    expect((c.space as string).length).toBe(40);
    expect(c.space).toBe('Kalamos'.repeat(10).slice(0, 40));
    expect(c.split).toEqual([{ name: 'Anna', share: 30, settled: false }]);
  });

  it('defaults space to "" and split to [] when omitted', async () => {
    await POST(makeReq({ body: { vendor: 'Coffee', amount: 3 } }));
    const c = state.lastCreate as Record<string, unknown>;
    expect(c.space).toBe('');
    expect(c.split).toEqual([]);
  });

  it('accepts taxDeductible + trims/caps taxCategory to 60 chars, defaults false/""', async () => {
    await POST(makeReq({
      body: { vendor: 'Doctor', amount: 40, taxDeductible: true, taxCategory: '  ' + 'Ιατρικά'.repeat(10) + '  ' },
    }));
    const c = state.lastCreate as Record<string, unknown>;
    expect(c.taxDeductible).toBe(true);
    expect((c.taxCategory as string).length).toBe(60);
    expect(c.taxCategory).toBe('Ιατρικά'.repeat(10).slice(0, 60));

    await POST(makeReq({ body: { vendor: 'Coffee', amount: 3 } }));
    const c2 = state.lastCreate as Record<string, unknown>;
    expect(c2.taxDeductible).toBe(false);
    expect(c2.taxCategory).toBe('');
  });
});

// P9 — a bill photographed abroad is entered from the phone in the currency it PRINTS. The
// route reads `amount` as that printed figure and stores base currency, so every report/budget
// sum stays comparable. A client that omits currency/fxRate must behave byte-identically to
// the single-currency route this replaced.
describe('POST multi-currency (P9)', () => {
  it('a body without currency/fxRate stores the amount untouched, with the triple at base/0/0', async () => {
    await POST(makeReq({ body: { vendor: 'ΔΕΗ', amount: 62 } }));
    expect(state.lastCreate).toMatchObject({ amount: 62, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('a foreign amount + rate is converted before storage (printed stays in origAmount)', async () => {
    await POST(makeReq({ body: { vendor: 'AWS', amount: 88, currency: 'USD', fxRate: 0.92 } }));
    expect(state.lastCreate).toMatchObject({ amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 });
  });

  it('a foreign amount with NO rate is stored as printed and flagged (fxRate 0), never guessed at 1:1', async () => {
    await POST(makeReq({ body: { vendor: 'AWS', amount: 88, currency: 'USD' } }));
    expect(state.lastCreate).toMatchObject({ amount: 88, currency: 'USD', origAmount: 88, fxRate: 0 });
  });

  it('the base currency comes from settings: on a USD deployment, USD is not foreign', async () => {
    appSettingsState.currency = 'USD';
    await POST(makeReq({ body: { vendor: 'AWS', amount: 88, currency: 'USD', fxRate: 0.92 } }));
    expect(state.lastCreate).toMatchObject({ amount: 88, currency: 'USD', origAmount: 0, fxRate: 0 });
  });

  it('junk in `currency` is ignored rather than stored (not a 3-letter ISO code)', async () => {
    await POST(makeReq({ body: { vendor: 'AWS', amount: 88, currency: 'dollars', fxRate: 0.92 } }));
    expect(state.lastCreate).toMatchObject({ amount: 88, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('the response carries the triple back, so the client detail view can show the FX badge', async () => {
    const res = await POST(makeReq({ body: { vendor: 'AWS', amount: 88, currency: 'USD', fxRate: 0.92 } }));
    const json = (await res.json()) as { expense: { amount: number; currency: string; origAmount: number; fxRate: number } };
    expect(json.expense).toMatchObject({ amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 });
  });
});

describe('GET listing', () => {
  it('returns the list envelope with each expense trimmed to spec defaults', async () => {
    state.docs = [
      { _id: 'e1', kind: 'income', vendor: 'Acme', vendorKey: 'acme', category: 'salary', amount: 1500, currency: 'USD', date: new Date('2026-06-01T00:00:00Z'), period: '2026-06', recurring: true, recurringCycle: 'monthly', paymentMethod: 'bank', notes: 'pay', filePath: '/f.pdf', thumbPath: '/t.jpg', verified: true, updatedAt: new Date('2026-07-01T00:00:00Z') },
      { _id: 'e2', vendor: 'Bare' }, // near-empty doc exercises every ?? default / !! fallback
    ];
    state.total = 2;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown>[]; total: number; limit: number; offset: number };
    expect(json).toMatchObject({ total: 2, limit: 50, offset: 0 });
    expect(json.data[0]).toEqual({
      id: 'e1', kind: 'income', vendor: 'Acme', category: 'salary', space: '', amount: 1500, currency: 'USD',
      origAmount: 0, fxRate: 0,
      date: '2026-06-01T00:00:00.000Z', period: '2026-06', recurring: true, recurringCycle: 'monthly',
      paymentMethod: 'bank', notes: 'pay', file: '/f.pdf', thumb: '/t.jpg', verified: true,
      updatedAt: '2026-07-01T00:00:00.000Z', deleted: false, split: [], taxDeductible: false, taxCategory: '',
    });
    expect(json.data[1]).toEqual({
      id: 'e2', kind: 'expense', vendor: 'Bare', category: 'other', space: '', amount: 0, currency: 'EUR',
      origAmount: 0, fxRate: 0,
      date: null, period: '', recurring: false, recurringCycle: '', paymentMethod: '', notes: '',
      file: null, thumb: null, verified: false, updatedAt: null, deleted: false, split: [], taxDeductible: false, taxCategory: '',
    });
    // single-doc series (<3) → no anomaly key on either row
    expect(json.data[0]).not.toHaveProperty('anomaly');
  });

  it('applies the kind=income filter on both find and count', async () => {
    await GET(makeReq({ url: `${BASE}?kind=income` }));
    expect(findFilter()).toEqual({ kind: 'income' });
    expect(countFilter()).toEqual({ kind: 'income' });
  });

  it('applies the kind=expense filter on both find and count', async () => {
    await GET(makeReq({ url: `${BASE}?kind=expense` }));
    expect(findFilter()).toEqual({ kind: 'expense' });
    expect(countFilter()).toEqual({ kind: 'expense' });
  });

  it('ignores an unknown kind, using an empty base filter', async () => {
    await GET(makeReq({ url: `${BASE}?kind=refund` }));
    expect(findFilter()).toEqual({});
    expect(countFilter()).toEqual({});
  });

  it('sorts by date descending', async () => {
    await GET(makeReq());
    expect((findQuery.sort as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ date: -1 });
  });

  it('an updatedSince cursor adds $gte and flips withDeleted on both queries', async () => {
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    expect(findFilter()).toEqual({ updatedAt: { $gte: new Date('2026-07-01T00:00:00.000Z') } });
    expect(countFilter()).toEqual({ updatedAt: { $gte: new Date('2026-07-01T00:00:00.000Z') } });
    expect((findQuery.setOptions as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ withDeleted: true });
    expect((countQuery.setOptions as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('without a cursor never calls setOptions (soft-deletes stay hidden)', async () => {
    await GET(makeReq());
    expect((findQuery.setOptions as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((countQuery.setOptions as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('flags an outlier in a ≥3 vendor series with a ±% anomaly on a full list read', async () => {
    // Series "dei": [100, 100, 100, 200] → median 100; the 200 deviates +100% (>30%).
    state.docs = [
      { _id: 'a', vendorKey: 'dei', amount: 100 },
      { _id: 'b', vendorKey: 'dei', amount: 100 },
      { _id: 'c', vendorKey: 'dei', amount: 100 },
      { _id: 'd', vendorKey: 'dei', amount: 200 },
    ];
    state.total = 4;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    expect(json.data[3].anomaly).toBe(100);
    expect(json.data[0]).not.toHaveProperty('anomaly'); // in-median rows carry no flag
  });

  it('SKIPS the anomaly pass on an incremental (updatedSince) read', async () => {
    // Same outlier series, but a partial slice would give wrong medians → route omits anomaly.
    state.docs = [
      { _id: 'a', vendorKey: 'dei', amount: 100 },
      { _id: 'b', vendorKey: 'dei', amount: 100 },
      { _id: 'c', vendorKey: 'dei', amount: 100 },
      { _id: 'd', vendorKey: 'dei', amount: 200 },
    ];
    state.total = 4;
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    expect(json.data[3]).not.toHaveProperty('anomaly');
  });

  it('flags a soft-deleted doc with deleted:true', async () => {
    state.docs = [{ _id: 'e3', vendor: 'Gone', deletedAt: new Date('2026-07-05T00:00:00Z') }];
    state.total = 1;
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: { deleted: boolean }[] };
    expect(json.data[0].deleted).toBe(true);
  });
});
