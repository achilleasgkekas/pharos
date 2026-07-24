import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/loyaltycards/:id — P20 mobile-parity. Mirrors the vouchers [id]
// route tests (plain field PATCH, no subarray) plus the barcodeFormat resolution rule
// unique to this route. A drift here silently corrupts the mobile Loyalty cards contract:
//   - the shared `isObjectId` guard (400 before any DB touch),
//   - PATCH partial-update: only whitelisted fields land in $set, blank title/cardNumber
//     dropped, empty changeset → 400, returns the SPEC { loyaltyCard } shape,
//   - barcodeFormat is set verbatim when EXPLICIT + valid, regardless of cardNumber,
//   - barcodeFormat is re-guessed from the new cardNumber's shape ONLY when cardNumber
//     itself changes and no explicit valid format was given,
//   - an invalid/absent barcodeFormat with NO cardNumber change never touches
//     barcodeFormat at all (must not clobber a good stored value from a guess with no
//     cardNumber context),
//   - DELETE is a soft delete, a missing row 404s.

const { connectDBMock, userFindOne, userState, lcUpdate, updateState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
  const lcUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, lcUpdate, updateState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: { findByIdAndUpdate: lcUpdate } }));

import { PATCH, DELETE } from './route';

const OID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const BASE = 'http://pharos.local/api/v1/loyaltycards';

function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function lastUpdate(): Record<string, unknown> {
  return updateState.calls[updateState.calls.length - 1].update as Record<string, unknown>;
}
function lastSet(): Record<string, unknown> {
  return (lastUpdate().$set ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  updateState.doc = null;
  updateState.calls = [];
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  lcUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
});

describe('auth gate', () => {
  it('PATCH without a token → 401, never touches the DB', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(lcUpdate).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 before any DB touch', async () => {
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(lcUpdate).not.toHaveBeenCalled();
  });
  it('DELETE with a malformed id → 400', async () => {
    const res = await DELETE(makeReq(), ctx('short'));
    expect(res.status).toBe(400);
    expect(lcUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH plain field updates', () => {
  it('drops a blank title and rejects an empty changeset with 400', async () => {
    const res = await PATCH(makeReq({ body: { title: '   ' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(lcUpdate).not.toHaveBeenCalled();
  });

  it('drops a blank cardNumber (does not clear it)', async () => {
    const res = await PATCH(makeReq({ body: { cardNumber: '   ' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(lcUpdate).not.toHaveBeenCalled();
  });

  it('trims string fields, returns the SPEC { loyaltyCard } wrapper', async () => {
    updateState.doc = { _id: OID, title: 'AB Card', cardNumber: '123', updatedAt: new Date('2026-07-24T00:00:00Z') };
    const res = await PATCH(makeReq({ body: { title: '  AB Card  ', store: ' AB Vassilopoulos ' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet()).toMatchObject({ title: 'AB Card', store: 'AB Vassilopoulos' });
    const json = (await res.json()) as { loyaltyCard: { id: string; title: string } };
    expect(json).toHaveProperty('loyaltyCard');
    expect(json.loyaltyCard).toMatchObject({ id: OID, title: 'AB Card' });
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(404);
  });

  it('can set archived', async () => {
    updateState.doc = { _id: OID, title: 'X', cardNumber: '1', archived: true };
    await PATCH(makeReq({ body: { archived: true } }), ctx(OID));
    expect(lastSet()).toMatchObject({ archived: true });
  });
});

describe('PATCH barcodeFormat resolution', () => {
  it('sets an explicit valid format verbatim even with no cardNumber change', async () => {
    updateState.doc = { _id: OID, title: 'X', cardNumber: '1' };
    await PATCH(makeReq({ body: { barcodeFormat: 'CODE39' } }), ctx(OID));
    expect(lastSet()).toMatchObject({ barcodeFormat: 'CODE39' });
  });

  it('ignores an invalid format string, never touches barcodeFormat', async () => {
    updateState.doc = { _id: OID, title: 'AB Card', cardNumber: '1' };
    const res = await PATCH(makeReq({ body: { title: 'AB Card', barcodeFormat: 'NOT_A_FORMAT' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet()).not.toHaveProperty('barcodeFormat');
  });

  it('re-guesses from a changed cardNumber when no explicit format is given', async () => {
    updateState.doc = { _id: OID, title: 'X', cardNumber: '1234567890123' };
    await PATCH(makeReq({ body: { cardNumber: '1234567890123' } }), ctx(OID));
    expect(lastSet()).toMatchObject({ cardNumber: '1234567890123', barcodeFormat: 'EAN13' });
  });

  it('an explicit format wins over the cardNumber-shape guess', async () => {
    updateState.doc = { _id: OID, title: 'X', cardNumber: '1234567890123' };
    await PATCH(makeReq({ body: { cardNumber: '1234567890123', barcodeFormat: 'CODE128' } }), ctx(OID));
    expect(lastSet()).toMatchObject({ barcodeFormat: 'CODE128' });
  });

  it('plain title-only edit never touches barcodeFormat', async () => {
    updateState.doc = { _id: OID, title: 'New title', cardNumber: '1' };
    await PATCH(makeReq({ body: { title: 'New title' } }), ctx(OID));
    expect(lastSet()).not.toHaveProperty('barcodeFormat');
  });
});

describe('DELETE soft-delete', () => {
  it('sets deletedAt (soft delete) and returns { ok, id }', async () => {
    updateState.doc = { _id: OID, title: 'X' };
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet().deletedAt).toBeInstanceOf(Date);
    expect(await res.json()).toEqual({ ok: true, id: OID });
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
  });
});
