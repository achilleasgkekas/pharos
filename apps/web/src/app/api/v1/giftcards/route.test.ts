import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/giftcards — P32 mobile-parity (MOBILE_PARITY.md "Gift cards /
// store-credit tracker στο mobile"). Mirrors the bills v1 route shape/tests exactly,
// plus the derived `balance`/`spentPct`/`daysLeft` fields (lib/giftcard.ts), never
// stored. A drift here silently corrupts the mobile Gift cards contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - GET default excludes archived cards; `?archived=1` includes them,
//   - sort is archived-first-false, then soonest expiry, then newest created,
//   - POST: `title` required, `initialAmount` clamped to >= 0, response is the
//     SPEC { giftCard } wrapper at 201,
//   - trim() computes balance/spentPct/daysLeft from initialAmount+uses+expiresAt.
// We exercise the REAL apiAuth/apiBody/apiList/lib/giftcard/lib/dates helpers and only
// mock the DB seam.

const { connectDBMock, userFindOne, userState, gcFind, gcCount, gcCreate, findQuery, countQuery, state } =
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
    const gcFind = vi.fn(() => findQuery);
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const gcCount = vi.fn(() => countQuery);
    const gcCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-24T00:00:00Z'), ...arg }) };
    });
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, gcFind, gcCount, gcCreate, findQuery, countQuery, state };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { find: gcFind, countDocuments: gcCount, create: gcCreate } }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/giftcards';

function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

function findFilter(): Record<string, unknown> {
  return (gcFind.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
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
  gcFind.mockImplementation(() => findQuery);
  gcCount.mockImplementation(() => countQuery);
  gcCreate.mockImplementation(async (arg: Record<string, unknown>) => {
    state.lastCreate = arg;
    return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-24T00:00:00Z'), ...arg }) };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(gcFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ body: { title: 'IKEA gift card' } }));
    expect(res.status).toBe(401);
    expect(gcCreate).not.toHaveBeenCalled();
  });
});

describe('GET filters', () => {
  it('excludes archived cards by default', async () => {
    await GET(makeReq());
    expect(findFilter()).toMatchObject({ archived: { $ne: true } });
  });

  it('includes archived cards when archived=1', async () => {
    await GET(makeReq({ url: `${BASE}?archived=1` }));
    expect(findFilter()).not.toHaveProperty('archived');
  });

  it('sorts archived-last, soonest-expiry, newest-created', async () => {
    await GET(makeReq());
    expect(gcFind.mock.results[0].value.sort).toHaveBeenCalledWith({ archived: 1, expiresAt: 1, createdAt: -1 });
  });

  it('computes balance/spentPct/daysLeft in the list envelope', async () => {
    state.docs = [{
      _id: 'g1', title: 'IKEA', initialAmount: 100,
      uses: [{ _id: 'u1', amount: 40, date: new Date(), note: 'sofa' }],
      expiresAt: new Date(Date.now() + 10 * 86400000), updatedAt: new Date(),
    }];
    state.total = 1;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: Array<{ balance: number; spentPct: number; daysLeft: number }> };
    expect(json.data[0].balance).toBe(60);
    expect(json.data[0].spentPct).toBe(40);
    expect(json.data[0].daysLeft).toBeGreaterThanOrEqual(9);
  });
});

describe('POST', () => {
  it('rejects a blank title', async () => {
    const res = await POST(makeReq({ body: { title: '   ' } }));
    expect(res.status).toBe(400);
    expect(gcCreate).not.toHaveBeenCalled();
  });

  it('creates with defaults and returns the SPEC { giftCard } wrapper at 201', async () => {
    const res = await POST(makeReq({ body: { title: '  IKEA gift card  ' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ title: 'IKEA gift card', store: '', code: '', initialAmount: 0, notes: '', uses: [], archived: false });
    const json = (await res.json()) as { giftCard: { id: string; title: string; balance: number } };
    expect(json).toHaveProperty('giftCard');
    expect(json.giftCard).toMatchObject({ id: 'newid', title: 'IKEA gift card', balance: 0 });
  });

  it('clamps a negative initialAmount to 0', async () => {
    await POST(makeReq({ body: { title: 'X', initialAmount: -50 } }));
    expect(state.lastCreate).toMatchObject({ initialAmount: 0 });
  });

  it('accepts a positive initialAmount and other fields', async () => {
    await POST(makeReq({ body: { title: 'X', store: 'IKEA', code: 'ABC123', initialAmount: 75.5, notes: 'birthday' } }));
    expect(state.lastCreate).toMatchObject({ initialAmount: 75.5, store: 'IKEA', code: 'ABC123', notes: 'birthday' });
  });
});
