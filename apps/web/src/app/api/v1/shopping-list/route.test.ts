import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/shopping-list is one of the ~50 REST endpoints the Expo mobile app drives.
// The [id] PATCH/DELETE half is separate; this covers the collection route. The route is thin —
// it delegates to getListItems/addListItem — but the response SHAPE and error mapping live
// NOWHERE else, so a drift here silently corrupts the mobile shopping list:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any action call),
//   - GET: the { items } wrapper (NOT the standard list envelope), mapped straight off
//     getListItems(),
//   - POST: the 5 fields fed through strField (String(b[k]||'') coercion, non-strings stringified,
//     missing → ''), the failure path (addListItem { ok:false } → apiError with r.error OR the
//     'Bad request' fallback when error is absent, and NO items re-fetch), and the success path
//     ({ ok:true, items } at 201 with the freshly re-fetched list).
// We exercise the REAL apiAuth/apiBody helpers and only mock the DB (auth chain) + actions seam.

const { connectDBMock, userFindOne, userState, getListItemsMock, addListItemMock, state } = vi.hoisted(() => {
  const state: { items: unknown[]; lastAdd: Record<string, unknown> | null; addResult: { ok: boolean; error?: string } } = {
    items: [],
    lastAdd: null,
    addResult: { ok: true },
  };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const getListItemsMock = vi.fn(async () => state.items);
  const addListItemMock = vi.fn(async (arg: Record<string, unknown>) => {
    state.lastAdd = arg;
    return state.addResult;
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, getListItemsMock, addListItemMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/shopping-list/actions', () => ({ getListItems: getListItemsMock, addListItem: addListItemMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/shopping-list';

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
  state.items = [];
  state.lastAdd = null;
  state.addResult = { ok: true };
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  getListItemsMock.mockImplementation(async () => state.items);
  addListItemMock.mockImplementation(async (arg: Record<string, unknown>) => {
    state.lastAdd = arg;
    return state.addResult;
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never loads items', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getListItemsMock).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never adds', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { name: 'Milk' } }));
    expect(res.status).toBe(401);
    expect(addListItemMock).not.toHaveBeenCalled();
  });
});

describe('GET listing', () => {
  it('returns the { items } wrapper (not a list envelope), straight off getListItems', async () => {
    state.items = [
      { id: 'a1', name: 'Milk', quantity: '2', category: 'grocery', brand: '', note: '', checked: false },
      { id: 'a2', name: 'Bread', quantity: '', category: '', brand: '', note: '', checked: true },
    ];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[] };
    expect(json).toHaveProperty('items');
    expect(json).not.toHaveProperty('data');
    expect(json).not.toHaveProperty('total');
    expect(json.items).toEqual(state.items);
  });

  it('returns an empty items array when the list is empty', async () => {
    const res = await GET(makeReq());
    expect(await res.json()).toEqual({ items: [] });
  });
});

describe('POST validation', () => {
  it('maps an addListItem failure to 400 with its error and does NOT re-fetch items', async () => {
    state.addResult = { ok: false, error: 'Name required' };
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Name required' });
    expect(getListItemsMock).not.toHaveBeenCalled();
  });

  it('falls back to "Bad request" when the failed result carries no error message', async () => {
    state.addResult = { ok: false };
    const res = await POST(makeReq({ body: { name: 'x' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Bad request' });
  });
});

describe('POST create', () => {
  it('feeds all five strField-coerced fields to addListItem and returns { ok, items } at 201', async () => {
    state.items = [{ id: 'new', name: 'Eggs', quantity: '12', category: 'grocery', brand: 'Bio', note: 'large', checked: false }];
    const res = await POST(makeReq({ body: { name: '  Eggs  ', quantity: '12', category: 'grocery', brand: 'Bio', note: 'large' } }));
    expect(res.status).toBe(201);
    // strField has no trim flag here → String(b[k]||''); addListItem itself trims later.
    expect(state.lastAdd).toEqual({ name: '  Eggs  ', quantity: '12', category: 'grocery', brand: 'Bio', note: 'large' });
    const json = (await res.json()) as { ok: boolean; items: unknown[] };
    expect(json.ok).toBe(true);
    expect(json.items).toEqual(state.items);
  });

  it('coerces non-string fields to strings and defaults missing fields to empty strings', async () => {
    await POST(makeReq({ body: { name: 'Batteries', quantity: 4 } }));
    expect(state.lastAdd).toEqual({ name: 'Batteries', quantity: '4', category: '', brand: '', note: '' });
  });
});
