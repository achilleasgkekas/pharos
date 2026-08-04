import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/subscriptions/:id are two of the ~50 REST endpoints under /api/v1.
// Their route-level logic lives NOWHERE else and would silently corrupt the API contract:
//   - the shared `isObjectId` guard (a malformed :id must 400 BEFORE any DB touch),
//   - PATCH partial-update: only whitelisted, well-typed fields land in $set; a blank name
//     is dropped, an out-of-enum billingCycle is dropped, an empty changeset returns 400,
//   - PATCH returns the SPEC shape { subscription: Subscription } (the full trimmed doc), NOT
//     a bare { ok, id } — the client's detail view re-prefills in place from the response,
//   - DELETE is a SOFT delete ($set deletedAt, recoverable from Trash), and a missing row 404s.
// We exercise the REAL apiAuth/apiBody/apiList helpers + the real trim serializer (imported
// by the route from ../route), and only mock the DB seam.

const { connectDBMock, userFindOne, userState, subUpdate, updateState, subFindById, existingState, getAppSettingsMock, settingsState } =
  vi.hoisted(() => {
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
    const subUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
      updateState.calls.push({ id, update, opts });
      return { lean: async () => updateState.doc };
    });
    // P9: a money-touching PATCH re-reads the current doc so it can merge the fields the
    // caller did not send (printed amount / currency / rate) before re-resolving all of them.
    const existingState: { doc: unknown } = { doc: { _id: 'a1b2c3d4e5f6a1b2c3d4e5f6', amount: 10, currency: 'EUR', origAmount: 0, fxRate: 0 } };
    const subFindById = vi.fn(() => ({ lean: async () => existingState.doc }));
    const settingsState = { currency: 'EUR' };
    const getAppSettingsMock = vi.fn(async () => settingsState);
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, subUpdate, updateState, subFindById, existingState, getAppSettingsMock, settingsState };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { findByIdAndUpdate: subUpdate, findById: subFindById } }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

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
  existingState.doc = { _id: OID, amount: 10, currency: 'EUR', origAmount: 0, fxRate: 0 };
  settingsState.currency = 'EUR';
  vi.clearAllMocks();
  subFindById.mockImplementation(() => ({ lean: async () => existingState.doc }));
  getAppSettingsMock.mockImplementation(async () => settingsState);
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

  it('sets firstChargeAmount, re-stamping the (unchanged) currency fields alongside it', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { firstChargeAmount: 9.99 } }), ctx(OID));
    // P9: any money field re-resolves the whole set against the base currency, so a
    // base-currency row is rewritten with exactly the values it already had (no drift).
    expect(lastSet()).toEqual({ firstChargeAmount: 9.99, amount: 10, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });
});

// P9 multi-currency. `amount` is stored in base currency, so PATCH must merge whatever the
// caller omitted from the CURRENT doc before converting — otherwise a partial update
// (rate-only, currency-only, amount-only) would leave the row half-converted.
describe('PATCH multi-currency (P9)', () => {
  it('converts a foreign amount with the supplied rate and keeps the printed one', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { amount: 88, currency: 'USD', fxRate: 0.92 } }), ctx(OID));
    const set = lastSet();
    expect(set.amount).toBe(80.96); // 88 * 0.92, rounded to cents
    expect(set.currency).toBe('USD');
    expect(set.origAmount).toBe(88);
    expect(set.fxRate).toBe(0.92);
  });

  it('a rate-only PATCH converts the printed amount already stored on the doc', async () => {
    existingState.doc = { _id: OID, amount: 88, currency: 'USD', origAmount: 88, fxRate: 0 };
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { fxRate: 0.5 } }), ctx(OID));
    const set = lastSet();
    expect(set.amount).toBe(44); // 88 (origAmount, NOT the un-converted amount) * 0.5
    expect(set.origAmount).toBe(88);
    expect(set.currency).toBe('USD');
  });

  it('an amount-only PATCH on a foreign row re-uses the stored rate', async () => {
    existingState.doc = { _id: OID, amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 };
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { amount: 100 } }), ctx(OID));
    const set = lastSet();
    expect(set.amount).toBe(92);
    expect(set.origAmount).toBe(100);
    expect(set.fxRate).toBe(0.92);
  });

  it('does NOT invent a 1:1 rate: a foreign amount with no rate is stored as printed', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { amount: 88, currency: 'USD' } }), ctx(OID));
    const set = lastSet();
    expect(set.amount).toBe(88);
    expect(set.fxRate).toBe(0);
    expect(set.origAmount).toBe(88);
  });

  it('switching a foreign row back to the base currency clears origAmount/fxRate', async () => {
    existingState.doc = { _id: OID, amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 };
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { currency: 'EUR' } }), ctx(OID));
    const set = lastSet();
    expect(set.currency).toBe('EUR');
    expect(set.origAmount).toBe(0);
    expect(set.fxRate).toBe(0);
    expect(set.amount).toBe(88); // the printed figure, now read as base currency
  });

  it('converts firstChargeAmount with the SAME rate as amount', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { amount: 10, currency: 'USD', fxRate: 0.5, firstChargeAmount: 4 } }), ctx(OID));
    const set = lastSet();
    expect(set.amount).toBe(5);
    expect(set.firstChargeAmount).toBe(2);
  });

  it('a currency-only body is a valid changeset (not an empty-changeset 400)', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    const res = await PATCH(makeReq({ body: { currency: 'USD' } }), ctx(OID));
    expect(res.status).toBe(200);
  });

  it('a non-money PATCH skips the extra read entirely', async () => {
    updateState.doc = { _id: OID, name: 'Netflix' };
    await PATCH(makeReq({ body: { name: 'Netflix Premium' } }), ctx(OID));
    expect(subFindById).not.toHaveBeenCalled();
    expect(lastSet()).toEqual({ name: 'Netflix Premium' });
  });

  it('404s (without writing) when a money PATCH targets a missing row', async () => {
    existingState.doc = null;
    const res = await PATCH(makeReq({ body: { amount: 5 } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(subUpdate).not.toHaveBeenCalled();
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
