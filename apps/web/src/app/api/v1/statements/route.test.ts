import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/statements is one of the ~50 REST endpoints the Expo mobile app drives.
// The [id] half is separate; this covers the collection LIST route, whose logic lives
// NOWHERE else, so a drift here silently corrupts the mobile credit-card statements list:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any DB read),
//   - the optional `card` filter (present → { card } filter on both find + count; absent → {}),
//   - the newest-period-first sort ({ period: -1 }),
//   - the updatedSince cursor adding a $gte filter AND flipping withDeleted on BOTH queries
//     (so a mobile client doing incremental sync sees soft-deleted rows to drop locally),
//   - the trim() projection + defaults: last4 ?? '', totalAmount/minimumPayment/paidAmount ?? 0,
//     currency ?? 'EUR', txnCount = transactions?.length ?? 0, deleted = !!deletedAt, and the
//     iso() coercion of statementDate/dueDate/updatedAt (null when the date is missing),
//   - the standard { data, total, limit, offset } list envelope.
// We exercise the REAL apiAuth/apiList helpers and only mock the DB seam (connectDB + the
// User/Statement models), so filtering + serialization run for real.

// Hoisted so the vi.mock factories (which run before imports) can reference the plumbing.
const { connectDBMock, userFindOne, userState, stFind, stCount, findQuery, countQuery, state } = vi.hoisted(() => {
  const state: { docs: unknown[]; total: number } = { docs: [], total: 0 };
  // User model — bearerUser does User.findOne(...).select(...).lean()
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Statement.find(filter).sort().skip().limit()[.setOptions()].lean() — a self-returning chain.
  const lean = vi.fn(async () => state.docs);
  const findQuery: Record<string, unknown> = {};
  for (const m of ['sort', 'skip', 'limit', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
  findQuery.lean = lean;
  const stFind = vi.fn(() => findQuery);
  // Statement.countDocuments(filter) — thenable resolving to the total, self-returning setOptions.
  const countQuery: Record<string, unknown> = {
    setOptions: vi.fn(() => countQuery),
    then: (resolve: (n: number) => void) => resolve(state.total),
  };
  const stCount = vi.fn(() => countQuery);
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, stFind, stCount, findQuery, countQuery, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: stFind, countDocuments: stCount } }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/statements';

/** Minimal NextRequest stand-in — the route only reads url and headers.get. */
function makeReq(opts: { url?: string; auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  // clearAllMocks resets return values on the chain stubs → re-point them.
  for (const m of ['sort', 'skip', 'limit', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  stFind.mockImplementation(() => findQuery);
  stCount.mockImplementation(() => countQuery);
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(stFind).not.toHaveBeenCalled();
    expect(stCount).not.toHaveBeenCalled();
  });

  it('GET with an unknown token → 401, never touches the DB', async () => {
    userState.doc = null; // token resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(stFind).not.toHaveBeenCalled();
  });
});

describe('GET listing', () => {
  it('returns the list envelope with a fully-mapped statement and trim() defaults on a near-empty doc', async () => {
    state.docs = [
      {
        _id: 's1',
        card: 'Εθνική Mastercard',
        last4: '7791',
        period: '2026-06',
        statementDate: new Date('2026-06-03T00:00:00Z'),
        dueDate: new Date('2026-06-20T00:00:00Z'),
        totalAmount: 221.51,
        minimumPayment: 20,
        paidAmount: 100,
        currency: 'USD',
        origAmount: 240,
        fxRate: 0.923,
        transactions: [{}, {}, {}],
        updatedAt: new Date('2026-06-05T00:00:00Z'),
      },
      { _id: 's2', card: 'Bare', period: '2026-05' }, // near-empty doc exercises every ?? fallback
    ];
    state.total = 5;
    const res = await GET(makeReq({ url: `${BASE}?limit=10&offset=0` }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown>[]; total: number; limit: number; offset: number };
    expect(json).toMatchObject({ total: 5, limit: 10, offset: 0 });
    expect(json.data[0]).toEqual({
      id: 's1',
      card: 'Εθνική Mastercard',
      last4: '7791',
      period: '2026-06',
      statementDate: '2026-06-03T00:00:00.000Z',
      dueDate: '2026-06-20T00:00:00.000Z',
      totalAmount: 221.51,
      minimumPayment: 20,
      paidAmount: 100,
      // P9: the amounts above are base currency; these three say what the paper printed.
      currency: 'USD',
      origAmount: 240,
      fxRate: 0.923,
      txnCount: 3,
      updatedAt: '2026-06-05T00:00:00.000Z',
      deleted: false,
    });
    // Every ?? / iso() fallback on the near-empty doc.
    expect(json.data[1]).toEqual({
      id: 's2',
      card: 'Bare',
      last4: '',
      period: '2026-05',
      statementDate: null,
      dueDate: null,
      totalAmount: 0,
      minimumPayment: 0,
      paidAmount: 0,
      currency: 'EUR',
      origAmount: 0,
      fxRate: 0,
      txnCount: 0,
      updatedAt: null,
      deleted: false,
    });
  });

  it('returns an empty envelope when the DB is empty', async () => {
    const res = await GET(makeReq());
    expect(await res.json()).toEqual({ data: [], total: 0, limit: 50, offset: 0 });
  });

  it('a card param filters both find and count on { card }', async () => {
    await GET(makeReq({ url: `${BASE}?card=Εθνική Mastercard` }));
    expect(stFind).toHaveBeenCalledWith({ card: 'Εθνική Mastercard' });
    expect(stCount).toHaveBeenCalledWith({ card: 'Εθνική Mastercard' });
  });

  it('with no card param filters on {} (all cards)', async () => {
    await GET(makeReq());
    expect(stFind).toHaveBeenCalledWith({});
    expect(stCount).toHaveBeenCalledWith({});
  });

  it('sorts by period descending (newest statement first)', async () => {
    await GET(makeReq());
    expect(findQuery.sort).toHaveBeenCalledWith({ period: -1 });
  });

  it('applies the paging window via skip/limit', async () => {
    await GET(makeReq({ url: `${BASE}?limit=5&offset=15` }));
    expect(findQuery.skip).toHaveBeenCalledWith(15);
    expect(findQuery.limit).toHaveBeenCalledWith(5);
  });

  it('an updatedSince cursor adds the $gte filter and flips withDeleted on BOTH queries', async () => {
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const filter = (stFind.mock.calls[0] as unknown[])[0] as { updatedAt: { $gte: Date } };
    expect(filter.updatedAt.$gte).toBeInstanceOf(Date);
    expect(filter.updatedAt.$gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(findQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
    expect(countQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('an updatedSince cursor combines with the card filter', async () => {
    await GET(makeReq({ url: `${BASE}?card=Visa&updatedSince=2026-06-01T00:00:00.000Z` }));
    const filter = (stFind.mock.calls[0] as unknown[])[0] as { card: string; updatedAt: { $gte: Date } };
    expect(filter.card).toBe('Visa');
    expect(filter.updatedAt.$gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('does NOT set withDeleted without a cursor', async () => {
    await GET(makeReq());
    expect(findQuery.setOptions).not.toHaveBeenCalled();
    expect(countQuery.setOptions).not.toHaveBeenCalled();
  });

  it('maps a deletedAt into deleted:true and derives txnCount from the transactions length', async () => {
    state.docs = [{ _id: 's9', card: 'X', period: '2026-04', transactions: [{}, {}], deletedAt: new Date('2026-06-30T00:00:00Z') }];
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: Array<{ deleted: boolean; txnCount: number }> };
    expect(json.data[0].deleted).toBe(true);
    expect(json.data[0].txnCount).toBe(2);
  });
});
