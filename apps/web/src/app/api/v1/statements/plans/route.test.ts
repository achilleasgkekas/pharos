import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/statements/plans is the mobile app's read side of the installment-plan overview
// (mirror of the web InstallmentOverview). It has no sibling test, yet it carries the projection
// contract the merge/bind write-ops depend on, and it lives NOWHERE else, so a drift here silently
// corrupts the mobile contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, DB never queried),
//   - the field projection: `key` (the stable grouping key the merge/unmerge write-ops key on) and
//     `merged` (drives the mobile "unmerge" affordance) MUST be exposed; `itemIds` must be collapsed
//     to `itemCount` (never leaked), `signature` kept for back-compat,
//   - the active-before-done sort (computeInstallmentPlans already orders active by soonest payoff;
//     the route only floats done plans to the end, preserving relative order otherwise),
//   - the currency default ('EUR' when settings.currency is falsy).
// We exercise the REAL apiAuth helpers and only mock the DB seam (connectDB + User for the auth gate,
// Statement.find) plus getAppSettings and the proven computeInstallmentPlans engine, so the route's
// own projection + sort run for real against controlled plan shapes.

const { connectDBMock, userFindOne, userState, stmtFind, findQuery, settingsMock, computeMock, state } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; plans: unknown[]; currency: string | undefined } = {
      docs: [],
      plans: [],
      currency: 'EUR',
    };
    // User model — bearerUser does User.findOne(...).select(...).lean()
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    // Statement.find().sort().lean() — a self-returning chain resolving to the raw docs.
    const findQuery: Record<string, unknown> = {};
    findQuery.sort = vi.fn(() => findQuery);
    findQuery.lean = vi.fn(async () => state.docs);
    const stmtFind = vi.fn(() => findQuery);
    const settingsMock = vi.fn(async () => ({ currency: state.currency }));
    const computeMock = vi.fn(() => state.plans);
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, stmtFind, findQuery, settingsMock, computeMock, state };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: stmtFind } }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: settingsMock }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: computeMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/statements/plans';

/** Minimal NextRequest stand-in — the route only reads headers.get. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

/** A full plan shape as computeInstallmentPlans emits it (itemIds, not itemCount). */
function plan(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: 'k1',
    signature: 'sig1',
    label: 'PLAISIO',
    card: 'Mastercard 7791',
    perAmount: 39.47,
    totalInstallments: 12,
    paidInstallments: 3,
    remainingInstallments: 9,
    remainingAmount: 355.23,
    totalAmount: 473.64,
    projectedEndDate: '2027-03-01',
    done: false,
    itemIds: ['i1', 'i2'],
    merged: false,
    ...over,
  };
}

beforeEach(() => {
  state.docs = [];
  state.plans = [];
  state.currency = 'EUR';
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  findQuery.sort = vi.fn(() => findQuery);
  findQuery.lean = vi.fn(async () => state.docs);
  stmtFind.mockImplementation(() => findQuery);
  settingsMock.mockImplementation(async () => ({ currency: state.currency }));
  computeMock.mockImplementation(() => state.plans);
});

describe('auth gate', () => {
  it('without a token → 401, never queries statements', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(stmtFind).not.toHaveBeenCalled();
    expect(computeMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never queries statements', async () => {
    userState.doc = null; // token resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(stmtFind).not.toHaveBeenCalled();
    expect(computeMock).not.toHaveBeenCalled();
  });
});

describe('projection', () => {
  it('exposes key + merged and collapses itemIds to itemCount (no itemIds leak)', async () => {
    state.plans = [plan({ key: 'ka', merged: true, itemIds: ['x', 'y', 'z'] })];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const p = body.plans[0];
    expect(p.key).toBe('ka');
    expect(p.merged).toBe(true);
    expect(p.itemCount).toBe(3);
    expect(p).not.toHaveProperty('itemIds');
  });

  it('carries every documented scalar field through verbatim', async () => {
    state.plans = [plan()];
    const res = await GET(makeReq());
    const p = (await res.json()).plans[0];
    expect(p).toEqual({
      key: 'k1',
      signature: 'sig1',
      label: 'PLAISIO',
      card: 'Mastercard 7791',
      perAmount: 39.47,
      totalInstallments: 12,
      paidInstallments: 3,
      remainingInstallments: 9,
      remainingAmount: 355.23,
      totalAmount: 473.64,
      projectedEndDate: '2027-03-01',
      done: false,
      itemCount: 2,
      merged: false,
    });
  });

  it('itemCount is 0 when a plan has no linked items', async () => {
    state.plans = [plan({ itemIds: [] })];
    const p = (await GET(makeReq()).then((r) => r.json())).plans[0];
    expect(p.itemCount).toBe(0);
  });

  it('feeds the serialized statement docs into computeInstallmentPlans', async () => {
    state.docs = [{ _id: 's1', card: 'Mastercard 7791', period: '2026-06' }];
    state.plans = [plan()];
    await GET(makeReq());
    expect(computeMock).toHaveBeenCalledTimes(1);
    // route JSON-round-trips the lean docs before handing them off
    expect(computeMock).toHaveBeenCalledWith([{ _id: 's1', card: 'Mastercard 7791', period: '2026-06' }]);
  });
});

describe('active-before-done sort', () => {
  it('floats done plans to the end, preserving active order', async () => {
    state.plans = [
      plan({ key: 'active-1', done: false }),
      plan({ key: 'done-1', done: true }),
      plan({ key: 'active-2', done: false }),
      plan({ key: 'done-2', done: true }),
    ];
    const body = await GET(makeReq()).then((r) => r.json());
    expect(body.plans.map((p: { key: string }) => p.key)).toEqual(['active-1', 'active-2', 'done-1', 'done-2']);
  });

  it('leaves an all-active list in its incoming (soonest-payoff) order', async () => {
    state.plans = [plan({ key: 'first' }), plan({ key: 'second' }), plan({ key: 'third' })];
    const body = await GET(makeReq()).then((r) => r.json());
    expect(body.plans.map((p: { key: string }) => p.key)).toEqual(['first', 'second', 'third']);
  });
});

describe('currency + empty', () => {
  it('passes a configured currency through', async () => {
    state.currency = 'USD';
    state.plans = [plan()];
    const body = await GET(makeReq()).then((r) => r.json());
    expect(body.currency).toBe('USD');
  });

  it("defaults currency to 'EUR' when settings.currency is falsy", async () => {
    state.currency = undefined;
    const body = await GET(makeReq()).then((r) => r.json());
    expect(body.currency).toBe('EUR');
  });

  it('returns an empty plans array when there are no plans', async () => {
    state.plans = [];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currency: 'EUR', plans: [] });
  });
});
