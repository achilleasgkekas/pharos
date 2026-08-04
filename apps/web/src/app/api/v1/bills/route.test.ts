import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/bills — P28 (payable/due bills tracker). Mirrors the vouchers v1
// route shape/tests exactly, plus the derived `status` field (billStatus) and the
// default archived-exclusion filter that vouchers doesn't need. A drift here silently
// corrupts the Bills API contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - GET default excludes archived bills; `?archived=1` includes them; `?paid=0`
//     filters to unpaid only; sort is dueDate ascending (soonest-due first),
//   - POST: `title` + valid `dueDate` required, every other string field trimmed,
//     `cycle` enum-gated, response is the SPEC { bill } wrapper at 201,
//   - trim() computes `status` from billStatus(dueDate, paidAt), never stored.
// We exercise the REAL apiAuth/apiBody/apiList/lib/bill helpers and only mock the DB seam.

const { connectDBMock, userFindOne, userState, billFind, billCount, billCreate, findQuery, countQuery, state, settingsState, getAppSettingsMock } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; total: number; lastCreate: Record<string, unknown> | null } = {
      docs: [],
      total: 0,
      lastCreate: null,
    };
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    const lean = vi.fn(async () => state.docs);
    const findQuery: Record<string, unknown> = {};
    for (const m of ['sort', 'skip', 'limit', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = lean;
    const billFind = vi.fn(() => findQuery);
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const billCount = vi.fn(() => countQuery);
    const billCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-20T00:00:00Z'), ...arg }) };
    });
    // P9: POST resolves foreign amounts against the deployment's base currency.
    const settingsState = { currency: 'EUR' };
    const getAppSettingsMock = vi.fn(async () => settingsState);
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, billFind, billCount, billCreate, findQuery, countQuery, state, settingsState, getAppSettingsMock };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind, countDocuments: billCount, create: billCreate } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/bills';

function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

function findFilter(): Record<string, unknown> {
  return (billFind.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  state.lastCreate = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  settingsState.currency = 'EUR';
  vi.clearAllMocks();
  getAppSettingsMock.mockImplementation(async () => settingsState);
  for (const m of ['sort', 'skip', 'limit', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  billFind.mockImplementation(() => findQuery);
  billCount.mockImplementation(() => countQuery);
  billCreate.mockImplementation(async (arg: Record<string, unknown>) => {
    state.lastCreate = arg;
    return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-20T00:00:00Z'), ...arg }) };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(billFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ body: { title: 'ΔΕΗ', dueDate: '2026-08-01' } }));
    expect(res.status).toBe(401);
    expect(billCreate).not.toHaveBeenCalled();
  });
});

describe('GET filters', () => {
  it('excludes archived bills by default', async () => {
    await GET(makeReq());
    expect(findFilter()).toMatchObject({ archived: { $ne: true } });
  });

  it('includes archived bills when archived=1', async () => {
    await GET(makeReq({ url: `${BASE}?archived=1` }));
    expect(findFilter()).not.toHaveProperty('archived');
  });

  it('filters to unpaid only when paid=0', async () => {
    await GET(makeReq({ url: `${BASE}?paid=0` }));
    expect(findFilter()).toMatchObject({ paidAt: null });
  });

  it('sorts by dueDate ascending', async () => {
    await GET(makeReq());
    expect(billFind.mock.results[0].value.sort).toHaveBeenCalledWith({ dueDate: 1 });
  });

  it('computes status from dueDate/paidAt in the list envelope', async () => {
    state.docs = [{ _id: 'b1', title: 'Rent', dueDate: new Date('2020-01-01'), paidAt: null, updatedAt: new Date() }];
    state.total = 1;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: Array<{ status: string }> };
    expect(json.data[0].status).toBe('overdue');
  });
});

describe('POST', () => {
  it('rejects a blank title', async () => {
    const res = await POST(makeReq({ body: { title: '   ', dueDate: '2026-08-01' } }));
    expect(res.status).toBe(400);
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('rejects a missing/invalid dueDate', async () => {
    const res = await POST(makeReq({ body: { title: 'ΔΕΗ' } }));
    expect(res.status).toBe(400);
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('creates with defaults and returns the SPEC { bill } wrapper at 201', async () => {
    const res = await POST(makeReq({ body: { title: '  ΔΕΗ ρεύμα  ', dueDate: '2026-08-01' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ title: 'ΔΕΗ ρεύμα', vendor: '', amount: 0, category: 'other', cycle: '', notes: '', paidAt: null, archived: false });
    const json = (await res.json()) as { bill: { id: string; title: string; status: string } };
    expect(json).toHaveProperty('bill');
    expect(json.bill).toMatchObject({ id: 'newid', title: 'ΔΕΗ ρεύμα' });
  });

  it('gates cycle to the known enum, falling back to one-off', async () => {
    await POST(makeReq({ body: { title: 'X', dueDate: '2026-08-01', cycle: 'daily' } }));
    expect(state.lastCreate).toMatchObject({ cycle: '' });
  });

  it('accepts a valid recurring cycle', async () => {
    await POST(makeReq({ body: { title: 'X', dueDate: '2026-08-01', cycle: 'monthly', amount: 62 } }));
    expect(state.lastCreate).toMatchObject({ cycle: 'monthly', amount: 62 });
  });
});

// P9 — the v1 Bill contract carries the currency triple, and POST reads `amount` as the
// PRINTED figure. A client that omits currency/fxRate must see byte-identical behaviour to
// the single-currency route this replaced.
describe('POST multi-currency (P9)', () => {
  it('a body without currency/fxRate stores the amount untouched, with the triple at base/0/0', async () => {
    await POST(makeReq({ body: { title: 'ΔΕΗ', dueDate: '2026-08-01', amount: 62 } }));
    expect(state.lastCreate).toMatchObject({ amount: 62, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('a foreign amount with a rate is converted before storage; origAmount keeps the printed figure', async () => {
    await POST(makeReq({ body: { title: 'AWS', dueDate: '2026-08-01', amount: 88, currency: 'USD', fxRate: 0.92 } }));
    expect(state.lastCreate).toMatchObject({ amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 });
  });

  it('a foreign amount with NO rate is stored as-is and flagged (fxRate 0), never guessed at 1:1', async () => {
    await POST(makeReq({ body: { title: 'AWS', dueDate: '2026-08-01', amount: 88, currency: 'USD' } }));
    expect(state.lastCreate).toMatchObject({ amount: 88, currency: 'USD', origAmount: 88, fxRate: 0 });
  });

  it('the base currency comes from settings: on a USD deployment, USD is not foreign', async () => {
    settingsState.currency = 'USD';
    await POST(makeReq({ body: { title: 'AWS', dueDate: '2026-08-01', amount: 88, currency: 'USD', fxRate: 0.92 } }));
    expect(state.lastCreate).toMatchObject({ amount: 88, currency: 'USD', origAmount: 0, fxRate: 0 });
  });

  it('GET exposes the triple on every row, defaulting a pre-P9 document to EUR/0/0', async () => {
    state.docs = [
      { _id: 'b1', title: 'AWS', dueDate: new Date('2026-08-01'), amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 },
      { _id: 'b2', title: 'ΔΕΗ', dueDate: new Date('2026-08-05'), amount: 62 },
    ];
    state.total = 2;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: { currency: string; origAmount: number; fxRate: number }[] };
    expect(json.data[0]).toMatchObject({ currency: 'USD', origAmount: 88, fxRate: 0.92 });
    expect(json.data[1]).toMatchObject({ currency: 'EUR', origAmount: 0, fxRate: 0 });
  });
});
