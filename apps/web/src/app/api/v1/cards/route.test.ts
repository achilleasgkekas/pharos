import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/cards is one of the ~50 REST endpoints the Expo mobile app drives.
// The body coercion lives in cardFieldsFromBody (unit-tested separately); what lives ONLY
// here, and would silently corrupt the mobile contract on drift, is the route wiring:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, no DB touch),
//   - POST: a null $set (name missing on create) → apiError('name required'); a valid body →
//     Card.create({ ...set, active: true }) + 201 + trim(doc.toObject()),
//   - GET: the sort({ active: -1, name: 1 }) order and the trim() serialization DEFAULTS
//     (last4 '', bank '', kind 'credit', type 'other', color '#00d4ff', creditLimit 0,
//     notes '', active !== false) — this route has no pagination envelope, it returns { cards }.
// We exercise the REAL apiAuth/apiBody helpers and mock only the DB seam (connectDB + the
// User/Card models), so validation + serialization run for real.

// Hoisted so the vi.mock factories (which run before imports) can reference the plumbing.
const { connectDBMock, userFindOne, userState, cardFind, cardCreate, findQuery, state } = vi.hoisted(() => {
  const state: { docs: unknown[]; lastCreate: Record<string, unknown> | null } = { docs: [], lastCreate: null };
  // User model — bearerUser does User.findOne(...).select(...).lean()
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Card.find().sort().lean() — a self-returning chain (no pagination on this route).
  const lean = vi.fn(async () => state.docs);
  const findQuery: Record<string, unknown> = { sort: vi.fn(() => findQuery), lean };
  const cardFind = vi.fn(() => findQuery);
  // Card.create(arg) returns a doc exposing .toObject() (the route trims doc.toObject()).
  const cardCreate = vi.fn(async (arg: Record<string, unknown>) => {
    state.lastCreate = arg;
    return { toObject: () => ({ _id: 'newid', ...arg }) };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, cardFind, cardCreate, findQuery, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Card', () => ({ Card: { find: cardFind, create: cardCreate } }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/cards';

/** Minimal NextRequest stand-in — the route only reads headers.get and json(). */
function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.docs = [];
  state.lastCreate = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  // clearAllMocks resets return values on the chain stubs → re-point them.
  (findQuery.sort as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  cardFind.mockImplementation(() => findQuery);
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(cardFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null; // token resolves to no user
    const res = await POST(makeReq({ body: { name: 'Εθνική Mastercard' } }));
    expect(res.status).toBe(401);
    expect(cardCreate).not.toHaveBeenCalled();
  });
});

describe('POST', () => {
  it('rejects a missing/blank name with 400 and no create', async () => {
    const res = await POST(makeReq({ body: { last4: '7791' } })); // no name → cardFieldsFromBody(_, false) === null
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name required' });
    expect(cardCreate).not.toHaveBeenCalled();
  });

  it('a whitespace-only name also fails as name required', async () => {
    const res = await POST(makeReq({ body: { name: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name required' });
    expect(cardCreate).not.toHaveBeenCalled();
  });

  it('creates a card with active:true forced on and returns 201', async () => {
    const res = await POST(makeReq({ body: { name: 'Εθνική Mastercard', last4: '7791', kind: 'credit', type: 'mastercard' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ name: 'Εθνική Mastercard', last4: '7791', kind: 'credit', type: 'mastercard', active: true });
  });

  it('forces active:true even when the body says active:false', async () => {
    await POST(makeReq({ body: { name: 'Card', active: false } }));
    // cardFieldsFromBody sets active:false, but the route spreads { ...set, active: true } after it.
    expect(state.lastCreate?.active).toBe(true);
  });

  it('returns the trimmed card with serialization defaults for a name-only body', async () => {
    const res = await POST(makeReq({ body: { name: 'Bare Card' } }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { card: Record<string, unknown> };
    expect(json.card).toEqual({
      id: 'newid',
      name: 'Bare Card',
      last4: '',
      bank: '',
      kind: 'credit',
      type: 'other',
      color: '#00d4ff',
      creditLimit: 0,
      notes: '',
      active: true,
    });
  });

  it('passes the coerced fields through to the response (last4 digits, creditLimit)', async () => {
    const res = await POST(makeReq({ body: { name: 'Visa', last4: 'ab12cd34ef', creditLimit: '3500', type: 'visa', color: '#ff0000' } }));
    const json = (await res.json()) as { card: Record<string, unknown> };
    // last4 keeps only digits, capped at 4; creditLimit coerced to a finite number.
    expect(json.card).toMatchObject({ last4: '1234', creditLimit: 3500, type: 'visa', color: '#ff0000' });
  });
});

describe('GET listing', () => {
  it('returns the { cards } envelope with every card trimmed', async () => {
    state.docs = [
      { _id: 'c1', name: 'Εθνική Mastercard', last4: '7791', bank: 'Εθνική', kind: 'credit', type: 'mastercard', color: '#123456', creditLimit: 5000, notes: 'main' },
      { _id: 'c2', name: 'Backup', active: false },
    ];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { cards: Array<Record<string, unknown>> };
    expect(json.cards).toEqual([
      { id: 'c1', name: 'Εθνική Mastercard', last4: '7791', bank: 'Εθνική', kind: 'credit', type: 'mastercard', color: '#123456', creditLimit: 5000, notes: 'main', active: true },
      { id: 'c2', name: 'Backup', last4: '', bank: '', kind: 'credit', type: 'other', color: '#00d4ff', creditLimit: 0, notes: '', active: false },
    ]);
  });

  it('active !== false maps a missing active flag to true', async () => {
    state.docs = [{ _id: 'c3', name: 'No-flag' }];
    const res = await GET(makeReq());
    const json = (await res.json()) as { cards: Array<{ active: boolean }> };
    expect(json.cards[0].active).toBe(true);
  });

  it('sorts active-first then by name ascending', async () => {
    await GET(makeReq());
    expect(findQuery.sort).toHaveBeenCalledWith({ active: -1, name: 1 });
  });

  it('returns an empty list without error when there are no cards', async () => {
    state.docs = [];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cards: [] });
  });
});
