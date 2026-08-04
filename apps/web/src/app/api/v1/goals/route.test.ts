import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/goals — P12 mobile-parity (MOBILE_PARITY.md "Reports — savings/financial
// goals στο mobile"). Mirrors the gift-cards v1 route shape/tests exactly, plus the derived
// `current`/`remaining`/`pct`/`done`/`monthsLeft`/`perMonth` fields (lib/goals.ts), never
// stored. A drift here silently corrupts the mobile Goals contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - GET default excludes archived goals; `?archived=1` includes them,
//   - sort is archived-first-false, then soonest target date, then newest created,
//   - POST: `title` required, `targetAmount` clamped to >= 0, response is the
//     SPEC { goal } wrapper at 201,
//   - trim() computes current/remaining/pct/done/monthsLeft/perMonth from
//     targetAmount+contributions+targetDate.
// We exercise the REAL apiAuth/apiBody/apiList/lib/goals/lib/dates helpers and only
// mock the DB seam.

const { connectDBMock, userFindOne, userState, goalFind, goalCount, goalCreate, findQuery, countQuery, state } =
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
    const goalFind = vi.fn(() => findQuery);
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const goalCount = vi.fn(() => countQuery);
    const goalCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-24T00:00:00Z'), ...arg }) };
    });
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, goalFind, goalCount, goalCreate, findQuery, countQuery, state };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Goal', () => ({ Goal: { find: goalFind, countDocuments: goalCount, create: goalCreate } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/goals';

function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

function findFilter(): Record<string, unknown> {
  return (goalFind.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
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
  goalFind.mockImplementation(() => findQuery);
  goalCount.mockImplementation(() => countQuery);
  goalCreate.mockImplementation(async (arg: Record<string, unknown>) => {
    state.lastCreate = arg;
    return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-24T00:00:00Z'), ...arg }) };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(goalFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ body: { title: 'Emergency fund' } }));
    expect(res.status).toBe(401);
    expect(goalCreate).not.toHaveBeenCalled();
  });
});

describe('GET filters', () => {
  it('excludes archived goals by default', async () => {
    await GET(makeReq());
    expect(findFilter()).toMatchObject({ archived: { $ne: true } });
  });

  it('includes archived goals when archived=1', async () => {
    await GET(makeReq({ url: `${BASE}?archived=1` }));
    expect(findFilter()).not.toHaveProperty('archived');
  });

  it('sorts archived-last, soonest-target-date, newest-created', async () => {
    await GET(makeReq());
    expect(goalFind.mock.results[0].value.sort).toHaveBeenCalledWith({ archived: 1, targetDate: 1, createdAt: -1 });
  });

  it('computes current/remaining/pct/done in the list envelope', async () => {
    state.docs = [{
      _id: 'g1', title: 'Sailing trip', targetAmount: 1000,
      contributions: [{ _id: 'c1', amount: 400, date: new Date(), note: 'first' }],
      targetDate: null, updatedAt: new Date(),
    }];
    state.total = 1;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: Array<{ current: number; remaining: number; pct: number; done: boolean }> };
    expect(json.data[0].current).toBe(400);
    expect(json.data[0].remaining).toBe(600);
    expect(json.data[0].pct).toBe(40);
    expect(json.data[0].done).toBe(false);
  });
});

describe('POST', () => {
  it('rejects a blank title', async () => {
    const res = await POST(makeReq({ body: { title: '   ' } }));
    expect(res.status).toBe(400);
    expect(goalCreate).not.toHaveBeenCalled();
  });

  it('creates with defaults and returns the SPEC { goal } wrapper at 201', async () => {
    const res = await POST(makeReq({ body: { title: '  Emergency fund  ' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ title: 'Emergency fund', targetAmount: 0, category: '', notes: '', contributions: [], archived: false });
    const json = (await res.json()) as { goal: { id: string; title: string; current: number } };
    expect(json).toHaveProperty('goal');
    expect(json.goal).toMatchObject({ id: 'newid', title: 'Emergency fund', current: 0 });
  });

  it('clamps a negative targetAmount to 0', async () => {
    await POST(makeReq({ body: { title: 'X', targetAmount: -50 } }));
    expect(state.lastCreate).toMatchObject({ targetAmount: 0 });
  });

  it('accepts a positive targetAmount and other fields', async () => {
    await POST(makeReq({ body: { title: 'X', targetAmount: 2000, category: 'travel', notes: 'Ionian sailing' } }));
    expect(state.lastCreate).toMatchObject({ targetAmount: 2000, category: 'travel', notes: 'Ionian sailing' });
  });
});
