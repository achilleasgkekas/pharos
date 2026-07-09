import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/statements/:id backs the mobile statement-detail screen (one credit-card statement
// with its per-charge transactions + installment info). It is GET-only — statements are created by
// the PDF-import flow, not here. Two pieces of logic live ONLY in this route, so a drift silently
// corrupts the mobile contract with no other test to catch it:
//
//   1. The transaction map: each charge → { id, date (iso|null), description||'', amount||0,
//      category||'uncategorized', installment }. `installment` is an object ONLY when
//      installmentInfo.totalInstallments is truthy (current defaults to 0); otherwise null. A
//      missing installmentInfo, or one with totalInstallments 0/undefined, collapses to null.
//
//   2. The sort: transactions are ordered by DESCENDING absolute amount, so installment plans and
//      the biggest charges surface at the top of the list. A regression in the comparator would
//      reshuffle every statement the app shows.
//
// The statement envelope also applies per-field `?? default` fallbacks (last4 '', totalAmount /
// minimumPayment / paidAmount 0, currency 'EUR', statementDate/dueDate via iso). We run the REAL
// apiAuth/apiBody/apiList helpers and mock only the DB seam.

const { connectDBMock, userFindOne, userState, statementFindById, findByIdState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Statement.findById(id).lean() → detail doc
  const findByIdState: { calls: string[]; doc: unknown } = { calls: [], doc: null };
  const statementFindById = vi.fn((id: string) => {
    findByIdState.calls.push(id);
    return { lean: async () => findByIdState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, statementFindById, findByIdState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Statement', () => ({ Statement: { findById: statementFindById } }));

import { GET } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/statements/${OID}`;

/** Minimal NextRequest stand-in — the route only reads headers.get. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

/** The dynamic route receives { params: Promise<{ id }> }. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** A minimal well-formed statement doc; override per-test. */
function statementDoc(over: Record<string, unknown> = {}) {
  return { _id: 's1', card: 'National Mastercard', period: '2026-06', ...over };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  findByIdState.calls = [];
  findByIdState.doc = null;
  connectDBMock.mockClear();
  statementFindById.mockClear();
});

describe('GET /api/v1/statements/:id — auth + id guard', () => {
  it('401 without a token, without querying', async () => {
    const res = await GET(makeReq({ auth: null }), ctx(OID));
    expect(res.status).toBe(401);
    expect(statementFindById).not.toHaveBeenCalled();
  });

  it('401 for an unknown token, without querying', async () => {
    userState.doc = null; // User.findOne(...).lean() → null
    const res = await GET(makeReq({ auth: 'Bearer nope' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(statementFindById).not.toHaveBeenCalled();
  });

  it('400 "bad id" for a malformed id, without querying', async () => {
    const res = await GET(makeReq(), ctx('not-an-oid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(statementFindById).not.toHaveBeenCalled();
  });

  it('404 when the statement is missing', async () => {
    findByIdState.doc = null;
    const res = await GET(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(findByIdState.calls).toEqual([OID]);
  });
});

describe('GET /api/v1/statements/:id — statement envelope', () => {
  it('serializes every field for a full doc', async () => {
    findByIdState.doc = statementDoc({
      _id: 's9',
      card: 'National Mastercard',
      last4: '7791',
      period: '2026-06',
      statementDate: new Date('2026-06-03T00:00:00.000Z'),
      dueDate: new Date('2026-06-28T00:00:00.000Z'),
      totalAmount: 1234.56,
      minimumPayment: 62,
      paidAmount: 200,
      currency: 'USD',
      transactions: [],
    });
    const res = await GET(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.statement).toEqual({
      id: 's9',
      card: 'National Mastercard',
      last4: '7791',
      period: '2026-06',
      statementDate: '2026-06-03T00:00:00.000Z',
      dueDate: '2026-06-28T00:00:00.000Z',
      totalAmount: 1234.56,
      minimumPayment: 62,
      paidAmount: 200,
      currency: 'USD',
    });
    expect(body.transactions).toEqual([]);
  });

  it('applies every default for a bare doc (no last4/dates/amounts/currency)', async () => {
    findByIdState.doc = statementDoc({ _id: 's0' });
    const res = await GET(makeReq(), ctx(OID));
    const { statement, transactions } = await res.json();
    expect(statement).toEqual({
      id: 's0',
      card: 'National Mastercard',
      last4: '',
      period: '2026-06',
      statementDate: null,
      dueDate: null,
      totalAmount: 0,
      minimumPayment: 0,
      paidAmount: 0,
      currency: 'EUR',
    });
    expect(transactions).toEqual([]); // missing transactions → []
  });
});

describe('GET /api/v1/statements/:id — transactions map + installment', () => {
  it('maps a full transaction with an installment object', async () => {
    findByIdState.doc = statementDoc({
      transactions: [
        {
          _id: 't1',
          date: new Date('2026-06-01T00:00:00.000Z'),
          description: 'PLAISIO 09/12',
          amount: 39.47,
          category: 'electronics',
          installmentInfo: { currentInstallment: 9, totalInstallments: 12 },
        },
      ],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { transactions } = await res.json();
    expect(transactions).toEqual([
      {
        id: 't1',
        date: '2026-06-01T00:00:00.000Z',
        description: 'PLAISIO 09/12',
        amount: 39.47,
        category: 'electronics',
        installment: { current: 9, total: 12 },
      },
    ]);
  });

  it('defaults description/amount/category and null date for a bare transaction', async () => {
    findByIdState.doc = statementDoc({ transactions: [{ _id: 't2' }] });
    const res = await GET(makeReq(), ctx(OID));
    const { transactions } = await res.json();
    expect(transactions).toEqual([
      { id: 't2', date: null, description: '', amount: 0, category: 'uncategorized', installment: null },
    ]);
  });

  it('installment is null when installmentInfo is missing, null, or totalInstallments is 0/undefined', async () => {
    findByIdState.doc = statementDoc({
      transactions: [
        { _id: 'a', amount: 3, installmentInfo: null },
        { _id: 'b', amount: 2, installmentInfo: { currentInstallment: 4 } }, // no total → null
        { _id: 'c', amount: 1, installmentInfo: { currentInstallment: 2, totalInstallments: 0 } }, // 0 → null
      ],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { transactions } = await res.json();
    expect(transactions.map((t: { installment: unknown }) => t.installment)).toEqual([null, null, null]);
  });

  it('current defaults to 0 when only totalInstallments is present', async () => {
    findByIdState.doc = statementDoc({
      transactions: [{ _id: 'x', amount: 5, installmentInfo: { totalInstallments: 6 } }],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { transactions } = await res.json();
    expect(transactions[0].installment).toEqual({ current: 0, total: 6 });
  });

  it('sorts transactions by DESCENDING absolute amount (biggest/refund-largest first)', async () => {
    findByIdState.doc = statementDoc({
      transactions: [
        { _id: 'small', amount: 10 },
        { _id: 'big', amount: 500 },
        { _id: 'refund', amount: -300 }, // abs 300 ranks above the +10 charge
        { _id: 'mid', amount: 120 },
      ],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { transactions } = await res.json();
    expect(transactions.map((t: { id: string }) => t.id)).toEqual(['big', 'refund', 'mid', 'small']);
  });
});
