import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/shopping-list/:id is the [id] half of one of the ~50 REST endpoints
// under /api/v1 (the collection GET/POST half is covered in ../route.test.ts). The route
// is thin — it delegates to toggleListItem/updateListItem/deleteListItem — but the request-shaping,
// the id guard, the "no valid fields" rejection, and the found→404 mapping live NOWHERE else, so a
// drift here silently corrupts the shopping list edit/tick/remove flows:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any action call),
//   - the isObjectId guard (malformed id → 400 'bad id', before any DB touch),
//   - PATCH: only the five string fields (name/quantity/category/brand/note) are picked (typeof
//     === 'string'), `checked` only when boolean; neither present → 400 'no valid fields' with no
//     action calls; toggle+update run independently and EITHER reporting found:false → 404,
//   - DELETE: soft-delete via deleteListItem; found:false → 404.
// We exercise the REAL apiAuth/apiBody helpers (withAuth + isObjectId + readBody) and only mock the
// DB (auth chain) + the actions seam.

const { connectDBMock, userFindOne, userState, toggleMock, updateMock, deleteMock, state } = vi.hoisted(() => {
  const state: {
    lastToggle: [string, boolean] | null;
    lastUpdate: [string, Record<string, unknown>] | null;
    lastDelete: string | null;
    toggleFound: boolean;
    updateFound: boolean;
    deleteFound: boolean;
  } = {
    lastToggle: null,
    lastUpdate: null,
    lastDelete: null,
    toggleFound: true,
    updateFound: true,
    deleteFound: true,
  };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const toggleMock = vi.fn(async (id: string, checked: boolean) => {
    state.lastToggle = [id, checked];
    return { ok: true, found: state.toggleFound };
  });
  const updateMock = vi.fn(async (id: string, fields: Record<string, unknown>) => {
    state.lastUpdate = [id, fields];
    return { ok: true, found: state.updateFound };
  });
  const deleteMock = vi.fn(async (id: string) => {
    state.lastDelete = id;
    return { ok: true, found: state.deleteFound };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, toggleMock, updateMock, deleteMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/shopping-list/actions', () => ({
  toggleListItem: toggleMock,
  updateListItem: updateMock,
  deleteListItem: deleteMock,
}));

import { PATCH, DELETE } from './route';

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

const ID = 'a'.repeat(24); // valid 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/shopping-list/${ID}`;

/** Minimal NextRequest stand-in — the route only reads headers.get and json(). */
function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  state.lastToggle = null;
  state.lastUpdate = null;
  state.lastDelete = null;
  state.toggleFound = true;
  state.updateFound = true;
  state.deleteFound = true;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  toggleMock.mockImplementation(async (id: string, checked: boolean) => {
    state.lastToggle = [id, checked];
    return { ok: true, found: state.toggleFound };
  });
  updateMock.mockImplementation(async (id: string, fields: Record<string, unknown>) => {
    state.lastUpdate = [id, fields];
    return { ok: true, found: state.updateFound };
  });
  deleteMock.mockImplementation(async (id: string) => {
    state.lastDelete = id;
    return { ok: true, found: state.deleteFound };
  });
});

describe('auth gate', () => {
  it('PATCH without a token → 401, touches no action', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { checked: true } }), ctx(ID));
    expect(res.status).toBe(401);
    expect(toggleMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('DELETE with an unknown token → 401, never deletes', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await DELETE(makeReq(), ctx(ID));
    expect(res.status).toBe(401);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 "bad id", no action calls', async () => {
    const res = await PATCH(makeReq({ body: { checked: true } }), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(toggleMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('DELETE with a malformed id → 400 "bad id", no delete', async () => {
    const res = await DELETE(makeReq(), ctx('123'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe('PATCH validation', () => {
  it('empty body → 400 "no valid fields", no toggle/update', async () => {
    const res = await PATCH(makeReq({ body: {} }), ctx(ID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(toggleMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('only non-string fields and non-boolean checked → 400 "no valid fields"', async () => {
    // quantity is a number (skipped, typeof !== 'string'); checked is a string (skipped, not boolean).
    const res = await PATCH(makeReq({ body: { quantity: 4, checked: 'yes' } }), ctx(ID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(toggleMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('PATCH ops', () => {
  it('checked-only → toggleListItem, no update, 200 { ok:true }', async () => {
    const res = await PATCH(makeReq({ body: { checked: true } }), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.lastToggle).toEqual([ID, true]);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('checked:false is a valid boolean → toggles with false', async () => {
    await PATCH(makeReq({ body: { checked: false } }), ctx(ID));
    expect(state.lastToggle).toEqual([ID, false]);
  });

  it('fields-only → updateListItem with just the string fields, no toggle', async () => {
    const res = await PATCH(
      makeReq({ body: { name: 'Milk', quantity: '2', category: 'grocery', brand: 'Bio', note: 'cold', extra: 'nope', price: 5 } }),
      ctx(ID)
    );
    expect(res.status).toBe(200);
    // Only the five whitelisted string fields are forwarded; unknown/non-string keys dropped.
    expect(state.lastUpdate).toEqual([ID, { name: 'Milk', quantity: '2', category: 'grocery', brand: 'Bio', note: 'cold' }]);
    expect(toggleMock).not.toHaveBeenCalled();
  });

  it('both checked and fields → both actions run, 200', async () => {
    const res = await PATCH(makeReq({ body: { checked: true, name: 'Bread' } }), ctx(ID));
    expect(res.status).toBe(200);
    expect(state.lastToggle).toEqual([ID, true]);
    expect(state.lastUpdate).toEqual([ID, { name: 'Bread' }]);
  });

  it('toggle reports not-found → 404 (even though update succeeds)', async () => {
    state.toggleFound = false;
    const res = await PATCH(makeReq({ body: { checked: true, name: 'Bread' } }), ctx(ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    // Both ops still attempted — the route runs them independently before deciding.
    expect(toggleMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('update reports not-found → 404', async () => {
    state.updateFound = false;
    const res = await PATCH(makeReq({ body: { name: 'Bread' } }), ctx(ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});

describe('DELETE', () => {
  it('soft-deletes and returns { ok:true } when the item exists', async () => {
    const res = await DELETE(makeReq(), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.lastDelete).toBe(ID);
  });

  it('missing item → 404', async () => {
    state.deleteFound = false;
    const res = await DELETE(makeReq(), ctx(ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(state.lastDelete).toBe(ID);
  });
});
