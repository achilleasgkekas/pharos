import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/subscriptions/:id are two of the ~50 REST endpoints the mobile app drives.
// Their route-level logic lives NOWHERE else and would silently corrupt the mobile contract:
//   - the shared `isObjectId` guard (a malformed :id must 400 BEFORE any DB touch),
//   - PATCH partial-update: only whitelisted, well-typed fields land in $set; a blank name
//     is dropped, an out-of-enum billingCycle is dropped, an empty changeset returns 400,
//   - PATCH returns the SPEC shape { subscription: Subscription } (the full trimmed doc), NOT
//     a bare { ok, id } — the mobile detail re-prefills in place from the response,
//   - DELETE is a SOFT delete ($set deletedAt, recoverable from Trash), and a missing row 404s.
// We exercise the REAL apiAuth/apiBody/apiList helpers + the real trim serializer (imported
// by the route from ../route), and only mock the DB seam.

const { connectDBMock, userFindOne, userState, subUpdate, updateState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
  const subUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, subUpdate, updateState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { findByIdAndUpdate: subUpdate } }));

import { PATCH, DELETE } from './route';

const OID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const BASE = 'http://pharos.local/api/v1/subscriptions';

function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function lastSet(): Record<string, unknown> {
  const call = updateState.calls[updateState.calls.length - 1];
  return (call.update as { $set: Record<string, unknown> }).$set;
}

beforeEach(() => {
  updateState.doc = null;
  updateState.calls = [];
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  subUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
});

describe('auth + id guards', () => {
  it('PATCH without a token → 401, never touches the DB', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { name: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(subUpdate).not.toHaveBeenCalled();
  });
  it('PATCH with a malformed id → 400 before any DB touch', async () => {
    const res = await PATCH(makeReq({ body: { name: 'X' } }), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(subUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH partial-update', () => {
  it('drops a blank name / out-of-enum billingCycle, rejecting an empty changeset with 400', async () => {
    const res = await PATCH(makeReq({ body: { name: '  ', billingCycle: 'biweekly' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it('keeps a valid billingCycle + active toggle', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { billingCycle: 'yearly', active: false } }), ctx(OID));
    const set = lastSet();
    expect(set.billingCycle).toBe('yearly');
    expect(set.active).toBe(false);
  });

  it('returns the SPEC { subscription } wrapper (not a bare ok/id)', async () => {
    updateState.doc = { _id: OID, name: 'Netflix', amount: 15, billingCycle: 'monthly', active: true, updatedAt: new Date('2026-07-04T00:00:00Z') };
    const res = await PATCH(makeReq({ body: { amount: 15 } }), ctx(OID));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { subscription: { id: string; name: string; amount: number } };
    expect(json).toHaveProperty('subscription');
    expect(json).not.toHaveProperty('ok');
    expect(json.subscription).toMatchObject({ id: OID, name: 'Netflix', amount: 15, billingCycle: 'monthly', active: true, currency: 'EUR' });
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { amount: 10 } }), ctx(OID));
    expect(res.status).toBe(404);
  });

  it('sets trialEndsAt from a valid date string', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { trialEndsAt: '2026-08-01' } }), ctx(OID));
    const set = lastSet();
    expect(set.trialEndsAt).toBeInstanceOf(Date);
    expect((set.trialEndsAt as Date).toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('explicitly clears trialEndsAt when sent as null', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { trialEndsAt: null } }), ctx(OID));
    expect(lastSet()).toEqual({ trialEndsAt: null });
  });

  it('ignores a malformed trialEndsAt (no change, not an empty-changeset 400)', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { amount: 20, trialEndsAt: 'nope' } }), ctx(OID));
    const set = lastSet();
    expect(set.amount).toBe(20);
    expect(set).not.toHaveProperty('trialEndsAt');
  });

  it('sets firstChargeAmount', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { firstChargeAmount: 9.99 } }), ctx(OID));
    expect(lastSet()).toEqual({ firstChargeAmount: 9.99 });
  });
});

describe('DELETE soft-delete', () => {
  it('sets deletedAt (soft delete) and returns { ok, id }', async () => {
    updateState.doc = { _id: OID, name: 'X' };
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
