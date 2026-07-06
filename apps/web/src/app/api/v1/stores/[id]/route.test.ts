import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/stores/:id closes the store-management pair the Expo mobile app drives
// (rename a store, retag its aliases, or remove it). What lives ONLY here, and would silently
// corrupt the mobile store picker / receipt store field on drift, is the route wiring:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, no DB touch),
//   - the isObjectId id guard (malformed id → 400 'bad id', never issues a write),
//   - PATCH: a $set that is ALWAYS seeded with { auto:false } (so, unlike cards, there is no
//     'no valid fields' rejection — even an empty body issues an update). name (when a string)
//     is trimmed and an empty trim → 400 'name cannot be empty' BEFORE any DB touch; url (when a
//     string) is trimmed; aliases (when present) run through cleanAliases (array or comma-string →
//     trim + lowercase + drop empties). A missing doc → 404. A duplicate-name write throw →
//     400 'A store with that name already exists' (mirrors the unique-name index). On success
//     invalidateStoreCache() fires and the response is a bare { ok:true, id }.
//   - DELETE: a HARD removal via findByIdAndDelete (stores are NOT soft-deleted, mirrors web
//     deleteStore) → { ok:true, id }; 404 when missing; invalidateStoreCache() on success.
// We exercise the REAL apiAuth/apiBody helpers and the REAL module-local cleanAliases (via the
// route); we mock only the DB seam + the storeService cache-invalidation seam.

const { connectDBMock, userFindOne, userState, storeUpdate, storeDelete, updateState, deleteState, invalidateMock } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Store.findByIdAndUpdate(id, update, opts).lean() — capture args; doc controls found/missing;
  // throws controls the duplicate-name path.
  const updateState: { calls: Array<{ id: string; update: unknown; opts: unknown }>; doc: unknown; throws: boolean } = { calls: [], doc: { _id: 's1' }, throws: false };
  const storeUpdate = vi.fn((id: string, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => { if (updateState.throws) throw new Error('E11000 duplicate key'); return updateState.doc; } };
  });
  // Store.findByIdAndDelete(id).lean() — capture id, return controllable doc.
  const deleteState: { calls: string[]; doc: unknown } = { calls: [], doc: { _id: 's1' } };
  const storeDelete = vi.fn((id: string) => {
    deleteState.calls.push(id);
    return { lean: async () => deleteState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, storeUpdate, storeDelete, updateState, deleteState, invalidateMock: vi.fn() };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Store', () => ({ Store: { findByIdAndUpdate: storeUpdate, findByIdAndDelete: storeDelete } }));
vi.mock('@/lib/storeService', () => ({ invalidateStoreCache: invalidateMock }));

import { PATCH, DELETE } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/stores/${OID}`;

/** Minimal NextRequest stand-in — the route only reads headers.get and json(). */
function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

/** The dynamic route receives { params: Promise<{ id }> }. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  updateState.calls = [];
  updateState.doc = { _id: 's1' };
  updateState.throws = false;
  deleteState.calls = [];
  deleteState.doc = { _id: 's1' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  storeUpdate.mockImplementation((id: string, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => { if (updateState.throws) throw new Error('E11000 duplicate key'); return updateState.doc; } };
  });
  storeDelete.mockImplementation((id: string) => {
    deleteState.calls.push(id);
    return { lean: async () => deleteState.doc };
  });
});

describe('auth gate', () => {
  it('PATCH without a token → 401, never issues an update', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { name: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(storeUpdate).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it('DELETE with an unknown token → 401, never removes', async () => {
    userState.doc = null; // token resolves to no user
    const res = await DELETE(makeReq({ auth: 'Bearer bad' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(storeDelete).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 bad id, no update', async () => {
    const res = await PATCH(makeReq({ body: { name: 'X' } }), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('DELETE with a malformed id → 400 bad id, no delete', async () => {
    const res = await DELETE(makeReq(), ctx('123'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(storeDelete).not.toHaveBeenCalled();
  });
});

describe('PATCH', () => {
  it('an empty body still issues an update ({ auto:false } is always seeded) → 200', async () => {
    const res = await PATCH(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: OID });
    expect(updateState.calls).toHaveLength(1);
    expect(updateState.calls[0].update).toEqual({ $set: { auto: false } });
  });

  it('rejects a whitespace-only name with 400 and no write (name checked before DB touch)', async () => {
    const res = await PATCH(makeReq({ body: { name: '   ' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name cannot be empty' });
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('trims name + url and normalises aliases (array → trim/lowercase/drop empties), always auto:false', async () => {
    const res = await PATCH(makeReq({ body: { name: '  iStorm  ', url: '  https://istorm.gr  ', aliases: [' i-Storm ', 'ISTORM.GR', ''] } }), ctx(OID));
    expect(res.status).toBe(200);
    const { id, update, opts } = updateState.calls[0];
    expect(id).toBe(OID);
    expect(update).toEqual({ $set: { auto: false, name: 'iStorm', url: 'https://istorm.gr', aliases: ['i-storm', 'istorm.gr'] } });
    expect(opts).toEqual({ new: true });
    expect(invalidateMock).toHaveBeenCalledOnce();
  });

  it('accepts a comma-string aliases input and splits it', async () => {
    await PATCH(makeReq({ body: { aliases: 'Foo, BAR ,,baz' } }), ctx(OID));
    expect(updateState.calls[0].update).toEqual({ $set: { auto: false, aliases: ['foo', 'bar', 'baz'] } });
  });

  it('a non-string url is ignored (only auto:false is set)', async () => {
    await PATCH(makeReq({ body: { url: 123 } }), ctx(OID));
    expect(updateState.calls[0].update).toEqual({ $set: { auto: false } });
  });

  it('returns 404 when the store does not exist (write attempted, invalidate NOT fired)', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { name: 'Ghost' } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(storeUpdate).toHaveBeenCalledOnce();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it('maps a duplicate-name write throw to 400 (unique-name index), no cache invalidation', async () => {
    updateState.throws = true;
    const res = await PATCH(makeReq({ body: { name: 'Existing' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A store with that name already exists' });
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE', () => {
  it('hard-removes via findByIdAndDelete, invalidates cache, returns { ok, id }', async () => {
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: OID });
    // HARD delete, NOT a soft-delete $set deletedAt (regression guard: mirrors web deleteStore).
    expect(storeDelete).toHaveBeenCalledWith(OID);
    expect(storeUpdate).not.toHaveBeenCalled();
    expect(invalidateMock).toHaveBeenCalledOnce();
  });

  it('returns 404 when the store does not exist, no cache invalidation', async () => {
    deleteState.doc = null;
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(storeDelete).toHaveBeenCalledOnce();
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
