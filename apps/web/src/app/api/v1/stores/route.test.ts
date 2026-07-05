import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/stores is one of the ~50 REST endpoints the Expo mobile app drives.
// The [id] PATCH/DELETE half is separate; this covers the collection route, whose logic
// lives NOWHERE else, so a drift here silently corrupts the mobile store picker + receipt
// store field:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any DB/getStores),
//   - GET: the { stores: [...] } wrapper (NOT the standard list envelope) with per-store
//     ?? '' / ?? [] / ?? false defaults, mapped straight off getStores(),
//   - POST: `name` required (strField trim → blank/whitespace → 400 'name required'), `url`
//     trimmed, `cleanAliases` (array OR comma-string → trim + lowercase + drop empties), the
//     aliases fallback to [name.toLowerCase()] when the cleaned list is empty, auto:false, the
//     SPEC { store } wrapper at 201, invalidateStoreCache() firing ONLY on a successful create,
//     and the duplicate-name catch → 400 'A store with that name already exists' (no invalidate).
// We exercise the REAL apiAuth/apiBody helpers and only mock the DB + storeService seam.

const { connectDBMock, userFindOne, userState, getStoresMock, invalidateMock, storeCreate, state } = vi.hoisted(() => {
  const state: { stores: unknown[]; lastCreate: Record<string, unknown> | null; createThrows: boolean } = {
    stores: [],
    lastCreate: null,
    createThrows: false,
  };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const getStoresMock = vi.fn(async () => state.stores);
  const invalidateMock = vi.fn();
  const storeCreate = vi.fn(async (arg: Record<string, unknown>) => {
    if (state.createThrows) throw new Error('E11000 duplicate key');
    state.lastCreate = arg;
    return { _id: 'newid', ...arg };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, getStoresMock, invalidateMock, storeCreate, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/lib/storeService', () => ({ getStores: getStoresMock, invalidateStoreCache: invalidateMock }));
vi.mock('@/models/Store', () => ({ Store: { create: storeCreate } }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/stores';

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
  state.stores = [];
  state.lastCreate = null;
  state.createThrows = false;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  getStoresMock.mockImplementation(async () => state.stores);
  storeCreate.mockImplementation(async (arg: Record<string, unknown>) => {
    if (state.createThrows) throw new Error('E11000 duplicate key');
    state.lastCreate = arg;
    return { _id: 'newid', ...arg };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never loads stores', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getStoresMock).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { name: 'X' } }));
    expect(res.status).toBe(401);
    expect(storeCreate).not.toHaveBeenCalled();
  });
});

describe('GET listing', () => {
  it('returns the { stores } wrapper (not a list envelope) with per-store defaults filled', async () => {
    state.stores = [
      { _id: 's1', name: 'Skroutz', url: 'https://skroutz.gr', aliases: ['skroutz', 'skroutz.gr'], auto: true },
      { _id: 's2', name: 'Bare' }, // near-empty doc exercises every ?? fallback
    ];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { stores: Record<string, unknown>[] };
    expect(json).toHaveProperty('stores');
    expect(json).not.toHaveProperty('data');
    expect(json).not.toHaveProperty('total');
    expect(json.stores[0]).toEqual({ id: 's1', name: 'Skroutz', url: 'https://skroutz.gr', aliases: ['skroutz', 'skroutz.gr'], auto: true });
    expect(json.stores[1]).toEqual({ id: 's2', name: 'Bare', url: '', aliases: [], auto: false });
  });

  it('returns an empty stores array when the DB is empty', async () => {
    const res = await GET(makeReq());
    expect((await res.json())).toEqual({ stores: [] });
  });
});

describe('POST validation', () => {
  it('rejects a missing name with 400 and never creates', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name required' });
    expect(storeCreate).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only name with 400 (strField trims to empty)', async () => {
    const res = await POST(makeReq({ body: { name: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name required' });
    expect(storeCreate).not.toHaveBeenCalled();
  });
});

describe('POST create', () => {
  it('creates a name-only store, defaulting aliases to [name.toLowerCase()] and returning the SPEC { store } at 201', async () => {
    const res = await POST(makeReq({ body: { name: '  TechLamb  ' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toEqual({ name: 'TechLamb', url: '', aliases: ['techlamb'], auto: false });
    const json = (await res.json()) as { store: Record<string, unknown> };
    expect(json).toHaveProperty('store');
    expect(json).not.toHaveProperty('ok');
    expect(json).not.toHaveProperty('data');
    expect(json.store).toEqual({ id: 'newid', name: 'TechLamb', url: '', aliases: ['techlamb'], auto: false });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it('trims the url and cleans an array of aliases (trim + lowercase + drop empties)', async () => {
    const res = await POST(makeReq({ body: { name: 'Public', url: '  https://public.gr  ', aliases: [' Public ', 'PUBLIC.GR', '', '  '] } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toEqual({ name: 'Public', url: 'https://public.gr', aliases: ['public', 'public.gr'], auto: false });
  });

  it('accepts a comma-separated aliases string and splits it into cleaned entries', async () => {
    await POST(makeReq({ body: { name: 'iStorm', aliases: 'istorm.gr, i-Storm , ISTORM' } }));
    expect((state.lastCreate as Record<string, unknown>).aliases).toEqual(['istorm.gr', 'i-storm', 'istorm']);
  });

  it('falls back to [name.toLowerCase()] when the aliases input cleans to empty', async () => {
    await POST(makeReq({ body: { name: 'Kotsovolos', aliases: ['   ', ''] } }));
    expect((state.lastCreate as Record<string, unknown>).aliases).toEqual(['kotsovolos']);
  });

  it('maps a duplicate-name create failure to 400 and does NOT invalidate the cache', async () => {
    state.createThrows = true;
    const res = await POST(makeReq({ body: { name: 'Skroutz' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A store with that name already exists' });
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
