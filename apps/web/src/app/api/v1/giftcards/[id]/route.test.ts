import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/giftcards/:id — P32 mobile-parity. Mirrors the bills [id] route
// tests, plus the `addUse`/`removeUseId` spend/reload/undo operations which — like the
// web `addGiftCardUse`/`removeGiftCardUse` actions — push/pull a single entry into the
// `uses` subarray (balance is always derived, never stored). A drift here silently
// corrupts the mobile Gift cards contract:
//   - the shared `isObjectId` guard (400 before any DB touch),
//   - PATCH partial-update: only whitelisted fields land in $set, blank title dropped,
//     empty changeset → 400, returns the SPEC { giftCard } shape,
//   - `addUse` validates a non-zero numeric amount and $push-es a use entry,
//   - `removeUseId` $pull-s that entry by _id,
//   - addUse + removeUseId together in one request → 400 (ambiguous),
//   - DELETE is a soft delete, a missing row 404s.

const { connectDBMock, userFindOne, userState, gcUpdate, updateState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
  const gcUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, gcUpdate, updateState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { findByIdAndUpdate: gcUpdate } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { PATCH, DELETE } from './route';

const OID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const BASE = 'http://pharos.local/api/v1/giftcards';

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
  gcUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
});

describe('auth gate', () => {
  it('PATCH without a token → 401, never touches the DB', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(gcUpdate).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 before any DB touch', async () => {
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(gcUpdate).not.toHaveBeenCalled();
  });
  it('DELETE with a malformed id → 400', async () => {
    const res = await DELETE(makeReq(), ctx('short'));
    expect(res.status).toBe(400);
    expect(gcUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH plain field updates', () => {
  it('drops a blank title and rejects an empty changeset with 400', async () => {
    const res = await PATCH(makeReq({ body: { title: '   ' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(gcUpdate).not.toHaveBeenCalled();
  });

  it('trims string fields, clamps a negative initialAmount, returns the SPEC { giftCard } wrapper', async () => {
    updateState.doc = { _id: OID, title: 'IKEA gift card', initialAmount: 0, uses: [], updatedAt: new Date('2026-07-24T00:00:00Z') };
    const res = await PATCH(makeReq({ body: { title: '  IKEA gift card  ', store: ' IKEA ', initialAmount: -20 } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet()).toMatchObject({ title: 'IKEA gift card', store: 'IKEA', initialAmount: 0 });
    const json = (await res.json()) as { giftCard: { id: string; title: string } };
    expect(json).toHaveProperty('giftCard');
    expect(json.giftCard).toMatchObject({ id: OID, title: 'IKEA gift card' });
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(404);
  });
});

describe('PATCH addUse (spend/reload)', () => {
  it('rejects a missing/zero amount', async () => {
    const res = await PATCH(makeReq({ body: { addUse: { amount: 0 } } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(gcUpdate).not.toHaveBeenCalled();
  });

  it('$push-es a spend (positive amount) rounded to cents', async () => {
    updateState.doc = { _id: OID, title: 'X', initialAmount: 100, uses: [{ _id: 'u1', amount: 40.005, date: new Date(), note: 'sofa' }] };
    const res = await PATCH(makeReq({ body: { addUse: { amount: 40.005, note: 'sofa' } } }), ctx(OID));
    expect(res.status).toBe(200);
    const push = (lastUpdate().$push as { uses: { amount: number; note: string } }).uses;
    expect(push.amount).toBe(40.01);
    expect(push.note).toBe('sofa');
  });

  it('accepts a negative amount (reload/top-up)', async () => {
    updateState.doc = { _id: OID, title: 'X', initialAmount: 100, uses: [] };
    await PATCH(makeReq({ body: { addUse: { amount: -20 } } }), ctx(OID));
    const push = (lastUpdate().$push as { uses: { amount: number } }).uses;
    expect(push.amount).toBe(-20);
  });

  it('addUse + removeUseId together → 400, never updates', async () => {
    const res = await PATCH(makeReq({ body: { addUse: { amount: 10 }, removeUseId: 'u1' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(gcUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH removeUseId (undo)', () => {
  it('$pull-s the given use entry', async () => {
    updateState.doc = { _id: OID, title: 'X', initialAmount: 100, uses: [] };
    const res = await PATCH(makeReq({ body: { removeUseId: 'u1' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastUpdate().$pull).toEqual({ uses: { _id: 'u1' } });
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
