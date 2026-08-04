import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/PATCH /api/v1/lists is one of the ~50 REST endpoints the Expo mobile app drives.
// It exposes the editable category taxonomies (item/expense/subscription category lists) so the
// mobile settings screen can read and overwrite them. The route is thin — it delegates to
// getListsForEditor/saveList — but the response SHAPE and the validation/error mapping live
// NOWHERE else, so a drift here silently breaks the mobile taxonomy editor:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any action call),
//   - GET: the { lists } wrapper (NOT the standard list envelope), mapped straight off
//     getListsForEditor(),
//   - PATCH: key required (string, non-empty → else 400 'key required' BEFORE any saveList call),
//     values coerced via Array.isArray(...).map(String) (non-array → []), the failure path
//     (saveList { ok:false } → apiError('unknown list key') → 400), and the success path
//     ({ ok:true } at 200).
// We exercise the REAL apiAuth/apiBody helpers and only mock the DB (auth chain) + actions seam.

const { connectDBMock, userFindOne, userState, getListsForEditorMock, saveListMock, state } = vi.hoisted(() => {
  const state: {
    lists: unknown[];
    lastSave: { key: string; values: string[] } | null;
    saveResult: { ok: boolean };
  } = { lists: [], lastSave: null, saveResult: { ok: true } };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const getListsForEditorMock = vi.fn(async () => state.lists);
  const saveListMock = vi.fn(async (key: string, values: string[]) => {
    state.lastSave = { key, values };
    return state.saveResult;
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, getListsForEditorMock, saveListMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/settings/actions', () => ({ getListsForEditor: getListsForEditorMock, saveList: saveListMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, PATCH } from './route';

const BASE = 'http://pharos.local/api/v1/lists';

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
  state.lists = [];
  state.lastSave = null;
  state.saveResult = { ok: true };
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  getListsForEditorMock.mockImplementation(async () => state.lists);
  saveListMock.mockImplementation(async (key: string, values: string[]) => {
    state.lastSave = { key, values };
    return state.saveResult;
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never loads lists', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getListsForEditorMock).not.toHaveBeenCalled();
  });

  it('PATCH with an unknown token → 401, never saves', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await PATCH(makeReq({ body: { key: 'itemCategories', values: ['drone'] } }));
    expect(res.status).toBe(401);
    expect(saveListMock).not.toHaveBeenCalled();
  });
});

describe('GET listing', () => {
  it('returns the { lists } wrapper (not a list envelope), straight off getListsForEditor', async () => {
    state.lists = [
      { key: 'itemCategories', values: ['networking', 'storage'], isDefault: false },
      { key: 'expenseCategories', values: ['utilities'], isDefault: true },
    ];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { lists: unknown[] };
    expect(json).toHaveProperty('lists');
    expect(json).not.toHaveProperty('data');
    expect(json).not.toHaveProperty('total');
    expect(json.lists).toEqual(state.lists);
  });

  it('returns an empty lists array when there are no taxonomies', async () => {
    const res = await GET(makeReq());
    expect(await res.json()).toEqual({ lists: [] });
  });
});

describe('PATCH validation', () => {
  it('rejects a missing key with 400 "key required" before any saveList call', async () => {
    const res = await PATCH(makeReq({ body: { values: ['a', 'b'] } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'key required' });
    expect(saveListMock).not.toHaveBeenCalled();
  });

  it('rejects an empty-string key with 400 "key required"', async () => {
    const res = await PATCH(makeReq({ body: { key: '', values: ['a'] } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'key required' });
    expect(saveListMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string key with 400 "key required"', async () => {
    const res = await PATCH(makeReq({ body: { key: 123, values: ['a'] } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'key required' });
    expect(saveListMock).not.toHaveBeenCalled();
  });

  it('maps a saveList failure (unknown key) to 400 "unknown list key"', async () => {
    state.saveResult = { ok: false };
    const res = await PATCH(makeReq({ body: { key: 'bogusKey', values: ['x'] } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown list key' });
    expect(state.lastSave).toEqual({ key: 'bogusKey', values: ['x'] });
  });
});

describe('PATCH save', () => {
  it('passes the key + String-coerced values to saveList and returns { ok:true } at 200', async () => {
    const res = await PATCH(makeReq({ body: { key: 'itemCategories', values: ['drone', 'camera'] } }));
    expect(res.status).toBe(200);
    expect(state.lastSave).toEqual({ key: 'itemCategories', values: ['drone', 'camera'] });
    expect(await res.json()).toEqual({ ok: true });
  });

  it('coerces non-string array entries to strings via .map(String)', async () => {
    await PATCH(makeReq({ body: { key: 'itemCategories', values: ['a', 5, true, null] } }));
    expect(state.lastSave).toEqual({ key: 'itemCategories', values: ['a', '5', 'true', 'null'] });
  });

  it('defaults a non-array values field to an empty array (clears the override)', async () => {
    await PATCH(makeReq({ body: { key: 'itemCategories', values: 'not-an-array' } }));
    expect(state.lastSave).toEqual({ key: 'itemCategories', values: [] });
  });

  it('defaults a missing values field to an empty array', async () => {
    await PATCH(makeReq({ body: { key: 'itemCategories' } }));
    expect(state.lastSave).toEqual({ key: 'itemCategories', values: [] });
    expect(saveListMock).toHaveBeenCalledOnce();
  });
});
