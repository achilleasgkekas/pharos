import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/bills — P28 mobile-parity (MOBILE_PARITY.md "Bills — payable/due
// tracker στο mobile"). Mirrors the vouchers v1 route shape/tests exactly, plus the
// derived `status` field (billStatus) and the default archived-exclusion filter that
// vouchers doesn't need. A drift here silently corrupts the mobile Bills contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - GET default excludes archived bills; `?archived=1` includes them; `?paid=0`
//     filters to unpaid only; sort is dueDate ascending (soonest-due first),
//   - POST: `title` + valid `dueDate` required, every other string field trimmed,
//     `cycle` enum-gated, response is the SPEC { bill } wrapper at 201,
//   - trim() computes `status` from billStatus(dueDate, paidAt), never stored.
// We exercise the REAL apiAuth/apiBody/apiList/lib/bill helpers and only mock the DB seam.

const { connectDBMock, userFindOne, userState, billFind, billCount, billCreate, findQuery, countQuery, state } =
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
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, billFind, billCount, billCreate, findQuery, countQuery, state };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind, countDocuments: billCount, create: billCreate } }));

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
  vi.clearAllMocks();
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
