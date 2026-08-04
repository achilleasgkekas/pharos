import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/subscriptions is one of the ~50 REST endpoints under /api/v1.
// This route carries the richest numeric/enum coercion of the collection routes, and it lives
// NOWHERE else, so a drift here silently corrupts the API contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - POST validation: `name` required, `amount` must parse to a finite number (numField),
//     billingCycle enum-defaulting to 'monthly' (enumField), startDate NaN-guard, and
//     nextRenewal defaulting to startDate when omitted,
//   - GET: the active=1 filter, the updatedSince cursor flipping on withDeleted (incremental
//     sync must see soft-deleted rows), the nextRenewal sort, and the trim() defaults
//     (active !== false, category 'other', billingCycle 'monthly', amount 0).
// We exercise the REAL apiAuth/apiBody/apiList helpers and only mock the DB seam
// (connectDB + the User/Subscription models), so validation + serialization run for real.

// Hoisted so the vi.mock factories (which run before imports) can reference the plumbing.
const { connectDBMock, userFindOne, userState, subFind, subCount, subCreate, findQuery, countQuery, expenseFind, expenseState, state, settingsState, getAppSettingsMock } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; total: number; lastCreate: Record<string, unknown> | null } = {
      docs: [],
      total: 0,
      lastCreate: null,
    };
    // User model — bearerUser does User.findOne(...).select(...).lean()
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    // Subscription.find(filter).sort().skip().limit()[.setOptions()].lean() — a self-returning chain,
    // PLUS Subscription.find().select('name provider').lean() (the P7 discoverSuggestions() vendorKey
    // exclusion lookup) — same mock, `select` just re-returns the same chain.
    const lean = vi.fn(async () => state.docs);
    const findQuery: Record<string, unknown> = {};
    for (const m of ['sort', 'skip', 'limit', 'setOptions', 'select']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = lean;
    const subFind = vi.fn(() => findQuery);
    // Subscription.countDocuments(filter) — thenable resolving to the total, self-returning setOptions.
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const subCount = vi.fn(() => countQuery);
    // Subscription.create(arg) returns a doc exposing .toObject() (the route trims doc.toObject()).
    const subCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-04T00:00:00Z'), ...arg }) };
    });
    // Expense.find(filter).select(...).lean() — the P7 discoverSuggestions() candidate source.
    const expenseState: { docs: unknown[] } = { docs: [] };
    const expenseQuery: Record<string, unknown> = { select: vi.fn(() => expenseQuery), lean: vi.fn(async () => expenseState.docs) };
    const expenseFind = vi.fn(() => expenseQuery);
    // P9: POST resolves foreign amounts against the deployment's base currency.
    const settingsState = { currency: 'EUR' };
    const getAppSettingsMock = vi.fn(async () => settingsState);
    return {
      connectDBMock: vi.fn(async () => {}),
      userFindOne, userState, subFind, subCount, subCreate, findQuery, countQuery,
      expenseFind, expenseState, state, settingsState, getAppSettingsMock,
    };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subFind, countDocuments: subCount, create: subCreate } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/subscriptions';

/** Minimal NextRequest stand-in — the route only reads url, headers.get, and json(). */
function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  state.lastCreate = null;
  expenseState.docs = [];
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  settingsState.currency = 'EUR';
  vi.clearAllMocks();
  getAppSettingsMock.mockImplementation(async () => settingsState);
  // clearAllMocks resets return values on the chain stubs → re-point them.
  for (const m of ['sort', 'skip', 'limit', 'setOptions', 'select']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  subFind.mockImplementation(() => findQuery);
  subCount.mockImplementation(() => countQuery);
  expenseFind.mockImplementation(() => ({ select: () => ({ lean: async () => expenseState.docs }) }));
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(subFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null; // token resolves to no user
    const res = await POST(makeReq({ body: { name: 'Netflix', amount: 15 } }));
    expect(res.status).toBe(401);
    expect(subCreate).not.toHaveBeenCalled();
  });
});

describe('POST validation', () => {
  it('rejects a missing/blank name with 400 and no create', async () => {
    const res = await POST(makeReq({ body: { name: '   ', amount: 10 } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name required' });
    expect(subCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric / missing amount with 400 and no create', async () => {
    const res = await POST(makeReq({ body: { name: 'Netflix' } })); // amount undefined → numField null
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'amount must be a number' });
    expect(subCreate).not.toHaveBeenCalled();
  });

  it('rejects an unparseable amount string with 400', async () => {
    const res = await POST(makeReq({ body: { name: 'Netflix', amount: 'free' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'amount must be a number' });
    expect(subCreate).not.toHaveBeenCalled();
  });

  it('accepts amount 0 as a valid finite number', async () => {
    const res = await POST(makeReq({ body: { name: 'Free tier', amount: 0 } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate?.amount).toBe(0);
  });

  it('coerces a numeric-string amount via parseFloat', async () => {
    await POST(makeReq({ body: { name: 'Spotify', amount: '9.99' } }));
    expect(state.lastCreate?.amount).toBe(9.99);
  });

  it('creates with defaults and returns 201 + trimmed subscription', async () => {
    const res = await POST(makeReq({ body: { name: 'Netflix', amount: 15 } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({
      name: 'Netflix',
      provider: '',
      category: 'other',
      amount: 15,
      billingCycle: 'monthly',
      paymentMethod: '',
      url: '',
      notes: '',
    });
    const json = (await res.json()) as { subscription: { id: string; name: string; billingCycle: string } };
    expect(json.subscription).toMatchObject({ id: 'newid', name: 'Netflix', billingCycle: 'monthly', currency: 'EUR' });
  });

  it('keeps a valid billingCycle and defaults an out-of-enum one to monthly', async () => {
    await POST(makeReq({ body: { name: 'Adobe', amount: 60, billingCycle: 'yearly' } }));
    expect(state.lastCreate?.billingCycle).toBe('yearly');
    await POST(makeReq({ body: { name: 'Adobe', amount: 60, billingCycle: 'biweekly' } }));
    expect(state.lastCreate?.billingCycle).toBe('monthly');
  });

  it('rejects an invalid startDate with 400 and no create', async () => {
    const res = await POST(makeReq({ body: { name: 'X', amount: 5, startDate: 'not-a-date' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid startDate' });
    expect(subCreate).not.toHaveBeenCalled();
  });

  it('defaults nextRenewal to startDate when omitted', async () => {
    await POST(makeReq({ body: { name: 'X', amount: 5, startDate: '2026-08-01' } }));
    const { startDate, nextRenewal } = state.lastCreate as { startDate: Date; nextRenewal: Date };
    expect(startDate).toBeInstanceOf(Date);
    expect(nextRenewal).toBeInstanceOf(Date);
    expect(nextRenewal.toISOString()).toBe(startDate.toISOString());
    expect(startDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('parses an explicit nextRenewal distinct from startDate', async () => {
    await POST(makeReq({ body: { name: 'X', amount: 5, startDate: '2026-08-01', nextRenewal: '2026-09-01' } }));
    const { startDate, nextRenewal } = state.lastCreate as { startDate: Date; nextRenewal: Date };
    expect(nextRenewal.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(nextRenewal.toISOString()).not.toBe(startDate.toISOString());
  });

  it('defaults startDate to a Date when omitted', async () => {
    await POST(makeReq({ body: { name: 'X', amount: 5 } }));
    expect(state.lastCreate?.startDate).toBeInstanceOf(Date);
  });

  it('defaults trialEndsAt to null and firstChargeAmount to 0 when omitted', async () => {
    await POST(makeReq({ body: { name: 'X', amount: 5 } }));
    expect(state.lastCreate?.trialEndsAt).toBeNull();
    expect(state.lastCreate?.firstChargeAmount).toBe(0);
  });

  it('parses a valid trialEndsAt and firstChargeAmount', async () => {
    await POST(makeReq({ body: { name: 'Netflix', amount: 15, trialEndsAt: '2026-08-01', firstChargeAmount: 15 } }));
    const { trialEndsAt } = state.lastCreate as { trialEndsAt: Date };
    expect(trialEndsAt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(state.lastCreate?.firstChargeAmount).toBe(15);
  });

  it('rejects an invalid trialEndsAt with 400 and no create', async () => {
    const res = await POST(makeReq({ body: { name: 'X', amount: 5, trialEndsAt: 'not-a-date' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid trialEndsAt' });
    expect(subCreate).not.toHaveBeenCalled();
  });
});

describe('GET listing', () => {
  it('returns the list envelope with a mapped subscription and trim() defaults', async () => {
    state.docs = [
      { _id: 's1', name: 'iCloud', amount: 2.99, updatedAt: new Date('2026-07-01T00:00:00Z') },
    ];
    state.total = 3;
    const res = await GET(makeReq({ url: `${BASE}?limit=10&offset=0` }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[]; total: number; limit: number; offset: number };
    expect(json).toMatchObject({ total: 3, limit: 10, offset: 0 });
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 's1',
        name: 'iCloud',
        amount: 2.99,
        category: 'other',
        billingCycle: 'monthly',
        currency: 'EUR',
        active: true, // active !== false → undefined maps to true
        deleted: false,
      }),
    ]);
  });

  it('active=1 filters on { active: true }', async () => {
    await GET(makeReq({ url: `${BASE}?active=1` }));
    expect(subFind).toHaveBeenCalledWith({ active: true });
    expect(subCount).toHaveBeenCalledWith({ active: true });
  });

  it('with no active param filters on {} (all subscriptions)', async () => {
    await GET(makeReq());
    expect(subFind).toHaveBeenCalledWith({});
  });

  it('sorts by nextRenewal ascending', async () => {
    await GET(makeReq());
    expect(findQuery.sort).toHaveBeenCalledWith({ nextRenewal: 1 });
  });

  it('an updatedSince cursor adds the $gte filter and flips withDeleted on both queries', async () => {
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const filter = (subFind.mock.calls[0] as unknown[])[0] as { updatedAt: { $gte: Date } };
    expect(filter.updatedAt.$gte).toBeInstanceOf(Date);
    expect(filter.updatedAt.$gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(findQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
    expect(countQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('does NOT set withDeleted without a cursor', async () => {
    await GET(makeReq());
    expect(findQuery.setOptions).not.toHaveBeenCalled();
    expect(countQuery.setOptions).not.toHaveBeenCalled();
  });

  it('maps active:false and a deletedAt into the trimmed shape', async () => {
    state.docs = [{ _id: 's9', name: 'Cancelled', active: false, deletedAt: new Date('2026-06-30T00:00:00Z') }];
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: Array<{ active: boolean; deleted: boolean }> };
    expect(json.data[0].active).toBe(false);
    expect(json.data[0].deleted).toBe(true);
  });
});

describe('P7 auto-discovered suggestions (additive, mirrors discoverUntrackedRecurring)', () => {
  it('returns an empty suggestions array when there are no priced expenses', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as { suggestions: unknown[] };
    expect(json.suggestions).toEqual([]);
  });

  it('flags a regular-cadence expense series with no matching subscription', async () => {
    expenseState.docs = [
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-04-05', category: 'entertainment', kind: 'expense' },
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-05-05', category: 'entertainment', kind: 'expense' },
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-06-05', category: 'entertainment', kind: 'expense' },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as { suggestions: Array<{ vendorKey: string; vendor: string; cycle: string; occurrences: number }> };
    expect(json.suggestions).toHaveLength(1);
    expect(json.suggestions[0]).toMatchObject({ vendorKey: 'netflix', vendor: 'Netflix', cycle: 'monthly', occurrences: 3 });
  });

  it('excludes a vendor already tracked by an existing Subscription (by name)', async () => {
    expenseState.docs = [
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-04-05', kind: 'expense' },
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-05-05', kind: 'expense' },
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-06-05', kind: 'expense' },
    ];
    state.docs = [{ _id: 's1', name: 'Netflix', amount: 15 }]; // shared with the main listing query's mock
    const res = await GET(makeReq());
    const json = (await res.json()) as { suggestions: unknown[] };
    expect(json.suggestions).toEqual([]);
  });

  it('skips discovery entirely on an incremental (updatedSince) poll', async () => {
    expenseState.docs = [
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-04-05', kind: 'expense' },
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-05-05', kind: 'expense' },
      { vendor: 'Netflix', vendorKey: 'netflix', amount: 15, date: '2026-06-05', kind: 'expense' },
    ];
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const json = (await res.json()) as { suggestions: unknown[] };
    expect(json.suggestions).toEqual([]);
    expect(expenseFind).not.toHaveBeenCalled();
  });
});

// P9 multi-currency. The API client posts what the invoice PRINTS; the route stores base
// currency, so `amount` stays directly summable everywhere it already is.
describe('POST multi-currency (P9)', () => {
  it('converts a foreign amount and records the printed figure + rate', async () => {
    await POST(makeReq({ body: { name: 'Netflix', amount: 10, currency: 'USD', fxRate: 0.92 } }));
    expect(state.lastCreate?.amount).toBe(9.2);
    expect(state.lastCreate?.currency).toBe('USD');
    expect(state.lastCreate?.origAmount).toBe(10);
    expect(state.lastCreate?.fxRate).toBe(0.92);
  });

  it('stores a body without currency/fxRate exactly as before the feature', async () => {
    await POST(makeReq({ body: { name: 'Netflix', amount: 15 } }));
    expect(state.lastCreate?.amount).toBe(15);
    expect(state.lastCreate?.currency).toBe('EUR');
    expect(state.lastCreate?.origAmount).toBe(0);
    expect(state.lastCreate?.fxRate).toBe(0);
  });

  it('does NOT invent a 1:1 rate when the rate is missing', async () => {
    await POST(makeReq({ body: { name: 'Netflix', amount: 10, currency: 'USD' } }));
    expect(state.lastCreate?.amount).toBe(10);
    expect(state.lastCreate?.fxRate).toBe(0);
    expect(state.lastCreate?.origAmount).toBe(10);
  });

  it('converts firstChargeAmount with the same rate as amount', async () => {
    await POST(makeReq({ body: { name: 'Netflix', amount: 10, currency: 'USD', fxRate: 0.5, firstChargeAmount: 4 } }));
    expect(state.lastCreate?.amount).toBe(5);
    expect(state.lastCreate?.firstChargeAmount).toBe(2);
  });

  it('is relative to the deployment base currency (USD base → a USD body is not foreign)', async () => {
    settingsState.currency = 'USD';
    await POST(makeReq({ body: { name: 'Netflix', amount: 10, currency: 'USD', fxRate: 0.92 } }));
    expect(state.lastCreate?.amount).toBe(10);
    expect(state.lastCreate?.origAmount).toBe(0);
  });

  it('exposes origAmount/fxRate in the POST response shape', async () => {
    const res = await POST(makeReq({ body: { name: 'Netflix', amount: 10, currency: 'USD', fxRate: 0.92 } }));
    const json = (await res.json()) as { subscription: Record<string, unknown> };
    expect(json.subscription).toMatchObject({ amount: 9.2, currency: 'USD', origAmount: 10, fxRate: 0.92 });
  });
});
