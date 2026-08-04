import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/loyaltycards — P20 (loyalty / membership card wallet). Mirrors the
// giftcards v1 route shape/tests (same archived-filter/sort idiom), minus the
// balance-derivation logic (LoyaltyCard has no balance — it's just an identity card a
// checkout scanner reads). A drift here silently corrupts the Loyalty cards API contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - GET default excludes archived cards; `?archived=1` includes them,
//   - sort is archived-first-false, then title A-Z,
//   - POST: `title` AND `cardNumber` required, response is the SPEC { loyaltyCard }
//     wrapper at 201,
//   - trim() defaults barcodeFormat to 'CODE128' when absent,
//   - POST resolves barcodeFormat from the card number's shape when not given (13-digit →
//     EAN13), same as the web createLoyaltyCard action.
// We exercise the REAL apiAuth/apiBody/apiList/lib/loyaltyCard helpers and only mock the DB seam.

const { connectDBMock, userFindOne, userState, lcFind, lcCount, lcCreate, findQuery, countQuery, state } =
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
    const lcFind = vi.fn(() => findQuery);
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const lcCount = vi.fn(() => countQuery);
    const lcCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-24T00:00:00Z'), ...arg }) };
    });
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, lcFind, lcCount, lcCreate, findQuery, countQuery, state };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: { find: lcFind, countDocuments: lcCount, create: lcCreate } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/loyaltycards';

function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

function findFilter(): Record<string, unknown> {
  return (lcFind.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
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
  lcFind.mockImplementation(() => findQuery);
  lcCount.mockImplementation(() => countQuery);
  lcCreate.mockImplementation(async (arg: Record<string, unknown>) => {
    state.lastCreate = arg;
    return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-24T00:00:00Z'), ...arg }) };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(lcFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ body: { title: 'AB Card', cardNumber: '123' } }));
    expect(res.status).toBe(401);
    expect(lcCreate).not.toHaveBeenCalled();
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

  it('sorts archived-last, title A-Z', async () => {
    await GET(makeReq());
    expect(lcFind.mock.results[0].value.sort).toHaveBeenCalledWith({ archived: 1, title: 1 });
  });

  it('defaults barcodeFormat to CODE128 when absent from the stored doc', async () => {
    state.docs = [{ _id: 'c1', title: 'AB Card', cardNumber: '1234', updatedAt: new Date() }];
    state.total = 1;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: Array<{ barcodeFormat: string }> };
    expect(json.data[0].barcodeFormat).toBe('CODE128');
  });
});

describe('POST', () => {
  it('rejects a blank title', async () => {
    const res = await POST(makeReq({ body: { title: '   ', cardNumber: '123' } }));
    expect(res.status).toBe(400);
    expect(lcCreate).not.toHaveBeenCalled();
  });

  it('rejects a blank cardNumber', async () => {
    const res = await POST(makeReq({ body: { title: 'AB Card', cardNumber: '   ' } }));
    expect(res.status).toBe(400);
    expect(lcCreate).not.toHaveBeenCalled();
  });

  it('creates with defaults and returns the SPEC { loyaltyCard } wrapper at 201', async () => {
    const res = await POST(makeReq({ body: { title: '  AB Card  ', cardNumber: ' 9876543210999 ' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ title: 'AB Card', cardNumber: '9876543210999', store: '', notes: '', archived: false });
    const json = (await res.json()) as { loyaltyCard: { id: string; title: string; barcodeFormat: string } };
    expect(json).toHaveProperty('loyaltyCard');
    expect(json.loyaltyCard).toMatchObject({ id: 'newid', title: 'AB Card' });
  });

  it('guesses EAN13 for a 13-digit card number when no format is given', async () => {
    await POST(makeReq({ body: { title: 'X', cardNumber: '1234567890123' } }));
    expect(state.lastCreate).toMatchObject({ barcodeFormat: 'EAN13' });
  });

  it('falls back to CODE128 for a non-numeric card number', async () => {
    await POST(makeReq({ body: { title: 'X', cardNumber: 'AB-1234' } }));
    expect(state.lastCreate).toMatchObject({ barcodeFormat: 'CODE128' });
  });

  it('accepts an explicit valid barcodeFormat over the guess', async () => {
    await POST(makeReq({ body: { title: 'X', cardNumber: '1234567890123', barcodeFormat: 'CODE39' } }));
    expect(state.lastCreate).toMatchObject({ barcodeFormat: 'CODE39' });
  });

  it('accepts store and notes', async () => {
    await POST(makeReq({ body: { title: 'X', cardNumber: '123', store: 'AB Vassilopoulos', notes: 'fuel points' } }));
    expect(state.lastCreate).toMatchObject({ store: 'AB Vassilopoulos', notes: 'fuel points' });
  });
});
