import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/cards/:id closes the cards pair the Expo mobile app drives (edit + remove
// a payment card, plus the active on/off toggle). The body coercion lives in cardFieldsFromBody
// (unit-tested separately in cardFields.test.ts); what lives ONLY here, and would silently corrupt
// the mobile contract on drift, is the route wiring:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, no DB touch),
//   - the isObjectId id guard (malformed id → 400 'bad id', never issues a write),
//   - PATCH: partial-mode cardFieldsFromBody (name NOT required, unlike POST); an empty $set →
//     apiError('no valid fields'); a valid $set → findByIdAndUpdate(id, {$set}, {new:true}) and a
//     bare { ok:true, id } response; 404 when the doc is missing. The active toggle is the key
//     divergence from POST: here { active:false } is a legitimate write (partial mode keeps it),
//     whereas POST force-spreads active:true.
//   - DELETE: a HARD removal via findByIdAndDelete (cards are NOT soft-deleted, mirrors web
//     deleteCard) → { ok:true, id }; 404 when missing. A regression to soft-delete would change
//     the contract, so we lock the hard-delete call explicitly.
// We exercise the REAL apiAuth/apiBody helpers and mock only the DB seam.

const { connectDBMock, userFindOne, userState, cardUpdate, cardDelete, updateState, deleteState } = vi.hoisted(() => {
  // User model — bearerUser does User.findOne(...).select(...).lean()
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Card.findByIdAndUpdate(id, update, opts).lean() — capture args, return controllable doc.
  const updateState: { calls: Array<{ id: string; update: unknown; opts: unknown }>; doc: unknown } = { calls: [], doc: { _id: 'c1' } };
  const cardUpdate = vi.fn((id: string, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  // Card.findByIdAndDelete(id).lean() — capture id, return controllable doc.
  const deleteState: { calls: string[]; doc: unknown } = { calls: [], doc: { _id: 'c1' } };
  const cardDelete = vi.fn((id: string) => {
    deleteState.calls.push(id);
    return { lean: async () => deleteState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, cardUpdate, cardDelete, updateState, deleteState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Card', () => ({ Card: { findByIdAndUpdate: cardUpdate, findByIdAndDelete: cardDelete } }));

import { PATCH, DELETE } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/cards/${OID}`;

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
  updateState.doc = { _id: 'c1' };
  deleteState.calls = [];
  deleteState.doc = { _id: 'c1' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  cardUpdate.mockImplementation((id: string, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  cardDelete.mockImplementation((id: string) => {
    deleteState.calls.push(id);
    return { lean: async () => deleteState.doc };
  });
});

describe('auth gate', () => {
  it('PATCH without a token → 401, never issues an update', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { name: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(cardUpdate).not.toHaveBeenCalled();
  });

  it('DELETE with an unknown token → 401, never removes', async () => {
    userState.doc = null; // token resolves to no user
    const res = await DELETE(makeReq({ auth: 'Bearer bad' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(cardDelete).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 bad id, no update', async () => {
    const res = await PATCH(makeReq({ body: { name: 'X' } }), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(cardUpdate).not.toHaveBeenCalled();
  });

  it('DELETE with a malformed id → 400 bad id, no delete', async () => {
    const res = await DELETE(makeReq(), ctx('123'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(cardDelete).not.toHaveBeenCalled();
  });
});

describe('PATCH', () => {
  it('rejects an empty changeset with 400 no valid fields and no write', async () => {
    const res = await PATCH(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(cardUpdate).not.toHaveBeenCalled();
  });

  it('an all-invalid body (out-of-enum kind, non-boolean active) is still an empty set → 400', async () => {
    const res = await PATCH(makeReq({ body: { kind: 'prepaid', active: 'yes' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(cardUpdate).not.toHaveBeenCalled();
  });

  it('does NOT require a name (partial mode): a last4-only body is a valid update', async () => {
    const res = await PATCH(makeReq({ body: { last4: '4321' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(updateState.calls).toHaveLength(1);
    expect(updateState.calls[0].update).toEqual({ $set: { last4: '4321' } });
  });

  it('updates via findByIdAndUpdate with $set, {new:true}, and returns { ok, id }', async () => {
    const res = await PATCH(makeReq({ body: { name: '  Εθνική  ', creditLimit: '5000', type: 'mastercard' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: OID });
    const { id, update, opts } = updateState.calls[0];
    expect(id).toBe(OID);
    expect(update).toEqual({ $set: { name: 'Εθνική', creditLimit: 5000, type: 'mastercard' } });
    expect(opts).toEqual({ new: true });
  });

  it('toggles the card off: { active:false } is a legitimate partial write (unlike POST)', async () => {
    const res = await PATCH(makeReq({ body: { active: false } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(updateState.calls[0].update).toEqual({ $set: { active: false } });
  });

  it('toggles the card on: { active:true } sets active true', async () => {
    await PATCH(makeReq({ body: { active: true } }), ctx(OID));
    expect(updateState.calls[0].update).toEqual({ $set: { active: true } });
  });

  it('returns 404 when the card does not exist', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { name: 'Ghost' } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    // the write is still attempted (findByIdAndUpdate returns null for a missing id)
    expect(cardUpdate).toHaveBeenCalledOnce();
  });
});

describe('DELETE', () => {
  it('hard-removes via findByIdAndDelete and returns { ok, id }', async () => {
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: OID });
    // HARD delete, NOT a soft-delete $set deletedAt (regression guard: mirrors web deleteCard).
    expect(cardDelete).toHaveBeenCalledWith(OID);
    expect(cardUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the card does not exist', async () => {
    deleteState.doc = null;
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(cardDelete).toHaveBeenCalledOnce();
  });
});
