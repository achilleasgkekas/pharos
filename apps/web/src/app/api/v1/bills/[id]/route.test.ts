import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/bills/:id — P28. Mirrors the vouchers [id] route
// tests, plus the `paid`/`paidDate` mark-paid transition which — like the web
// `markBillPaid` action — spawns the next pending instance one cycle ahead the FIRST
// time a recurring bill is paid (guarded by the existing paidAt, never on a re-mark).
// A drift here silently corrupts the Bills API contract:
//   - the shared `isObjectId` guard (400 before any DB touch),
//   - PATCH partial-update: only whitelisted fields land in $set, blank title dropped,
//     empty changeset → 400, returns the SPEC { bill, spawnedNext } shape,
//   - `paid: true` sets paidAt (now or paidDate) and spawns exactly once per bill,
//   - `paid: false` clears paidAt without touching anything else,
//   - DELETE is a soft delete, a missing row 404s.

const { connectDBMock, userFindOne, userState, billUpdate, billFindById, billFindOne, findOneState, billCreate, updateState, findByIdState, settingsState, getAppSettingsMock } =
  vi.hoisted(() => {
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
    const billUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
      updateState.calls.push({ id, update, opts });
      return { lean: async () => updateState.doc };
    });
    const findByIdState: { doc: unknown } = { doc: null };
    const billFindById = vi.fn(() => ({ lean: async () => findByIdState.doc }));
    // #33: the spawn first looks for a live successor of this bill; null = none yet.
    const findOneState: { doc: unknown } = { doc: null };
    const billFindOne = vi.fn((_filter: unknown) => ({ lean: async () => findOneState.doc }));
    const billCreate = vi.fn(async (arg: Record<string, unknown>) => ({ toObject: () => arg }));
    // P9: a money-touching PATCH re-resolves against the deployment's base currency.
    const settingsState = { currency: 'EUR' };
    const getAppSettingsMock = vi.fn(async () => settingsState);
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, billUpdate, billFindById, billFindOne, findOneState, billCreate, updateState, findByIdState, settingsState, getAppSettingsMock };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Bill', () => ({ Bill: { findByIdAndUpdate: billUpdate, findById: billFindById, findOne: billFindOne, findOneAndUpdate: vi.fn(async () => ({})), create: billCreate } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { PATCH, DELETE } from './route';

const OID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const BASE = 'http://pharos.local/api/v1/bills';

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
  findOneState.doc = null;
  updateState.calls = [];
  findByIdState.doc = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  settingsState.currency = 'EUR';
  vi.clearAllMocks();
  getAppSettingsMock.mockImplementation(async () => settingsState);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  billUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  billFindById.mockImplementation(() => ({ lean: async () => findByIdState.doc }));
  billCreate.mockImplementation(async (arg: Record<string, unknown>) => ({ toObject: () => arg }));
});

describe('auth gate', () => {
  it('PATCH without a token → 401, never touches the DB', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(billUpdate).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 before any DB touch', async () => {
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(billUpdate).not.toHaveBeenCalled();
  });
  it('DELETE with a malformed id → 400', async () => {
    const res = await DELETE(makeReq(), ctx('short'));
    expect(res.status).toBe(400);
    expect(billUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH plain field updates', () => {
  it('drops a blank title and rejects an empty changeset with 400', async () => {
    const res = await PATCH(makeReq({ body: { title: '   ' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(billUpdate).not.toHaveBeenCalled();
  });

  it('trims string fields and returns the SPEC { bill } wrapper', async () => {
    updateState.doc = { _id: OID, title: 'ΔΕΗ ρεύμα', dueDate: new Date('2026-08-01'), paidAt: null, updatedAt: new Date('2026-07-20T00:00:00Z') };
    const res = await PATCH(makeReq({ body: { title: '  ΔΕΗ ρεύμα  ', vendor: ' ΔΕΗ ' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet()).toMatchObject({ title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ' });
    const json = (await res.json()) as { bill: { id: string; title: string } };
    expect(json).toHaveProperty('bill');
    expect(json.bill).toMatchObject({ id: OID, title: 'ΔΕΗ ρεύμα' });
  });

  it('gates cycle to the known enum', async () => {
    updateState.doc = { _id: OID, title: 'X', dueDate: new Date(), paidAt: null };
    await PATCH(makeReq({ body: { cycle: 'daily' } }), ctx(OID));
    expect(billUpdate).not.toHaveBeenCalled(); // invalid cycle alone → no valid fields, never reaches update
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(404);
  });
});

describe('PATCH paid transition', () => {
  it('marks a one-off bill paid (no cycle) without spawning a next instance', async () => {
    findByIdState.doc = { _id: OID, title: 'One-off', vendor: '', amount: 50, dueDate: new Date('2026-07-01'), paidAt: null, category: 'other', cycle: '', notes: '' };
    updateState.doc = { _id: OID, title: 'One-off', dueDate: new Date('2026-07-01'), paidAt: new Date('2026-07-20') };
    const res = await PATCH(makeReq({ body: { paid: true } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet().paidAt).toBeInstanceOf(Date);
    expect(billCreate).not.toHaveBeenCalled();
    const json = (await res.json()) as { spawnedNext: boolean };
    expect(json.spawnedNext).toBe(false);
  });

  it('marks a recurring bill paid and spawns the next instance one cycle ahead', async () => {
    findByIdState.doc = { _id: OID, title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', amount: 60, dueDate: new Date('2026-07-01'), paidAt: null, category: 'utilities', cycle: 'monthly', notes: '' };
    updateState.doc = { _id: OID, title: 'ΔΕΗ ρεύμα', dueDate: new Date('2026-07-01'), paidAt: new Date('2026-07-20') };
    const res = await PATCH(makeReq({ body: { paid: true } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(billCreate).toHaveBeenCalledTimes(1);
    const spawned = billCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(spawned).toMatchObject({ title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', amount: 60, cycle: 'monthly', paidAt: null, archived: false });
    expect((spawned.dueDate as Date).toISOString().slice(0, 10)).toBe('2026-08-01'); // one month ahead of July 1
    const json = (await res.json()) as { spawnedNext: boolean };
    expect(json.spawnedNext).toBe(true);
  });

  it('does not re-spawn when a recurring bill is already paid (idempotent)', async () => {
    findByIdState.doc = { _id: OID, title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', amount: 60, dueDate: new Date('2026-07-01'), paidAt: new Date('2026-07-05'), category: 'utilities', cycle: 'monthly', notes: '' };
    updateState.doc = { _id: OID, title: 'ΔΕΗ ρεύμα', dueDate: new Date('2026-07-01'), paidAt: new Date('2026-07-06') };
    const res = await PATCH(makeReq({ body: { paid: true, paidDate: '2026-07-06' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(billCreate).not.toHaveBeenCalled();
    const json = (await res.json()) as { spawnedNext: boolean };
    expect(json.spawnedNext).toBe(false);
  });

  it('#33: paid:true after a paid:false undo does not spawn a second next instance', async () => {
    // Undo cleared paidAt, so the bill reads as unpaid again, but its successor is still live.
    findByIdState.doc = { _id: OID, title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', amount: 60, dueDate: new Date('2026-07-01'), paidAt: null, category: 'utilities', cycle: 'monthly', notes: '' };
    findOneState.doc = { _id: 'next', title: 'ΔΕΗ ρεύμα', cycle: 'monthly', dueDate: new Date('2026-08-01'), recurrenceParentId: OID };
    updateState.doc = { _id: OID, title: 'ΔΕΗ ρεύμα', dueDate: new Date('2026-07-01'), paidAt: new Date('2026-07-20') };
    const res = await PATCH(makeReq({ body: { paid: true } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(billCreate).not.toHaveBeenCalled();
    expect(((billFindOne.mock.calls[0][0] as { $or: Array<Record<string, unknown>> }).$or)[0]).toEqual({ recurrenceParentId: OID });
    const json = (await res.json()) as { spawnedNext: boolean };
    expect(json.spawnedNext).toBe(false);
  });

  it('respects an explicit paidDate', async () => {
    findByIdState.doc = { _id: OID, title: 'X', vendor: '', amount: 0, dueDate: new Date('2026-07-01'), paidAt: null, category: 'other', cycle: '', notes: '' };
    updateState.doc = { _id: OID, title: 'X', dueDate: new Date('2026-07-01'), paidAt: new Date('2026-07-10') };
    await PATCH(makeReq({ body: { paid: true, paidDate: '2026-07-10' } }), ctx(OID));
    expect((lastSet().paidAt as Date).toISOString().slice(0, 10)).toBe('2026-07-10');
  });

  it('marks a bill unpaid (undo), clearing paidAt without touching anything else', async () => {
    findByIdState.doc = { _id: OID, title: 'X', dueDate: new Date(), paidAt: new Date(), cycle: '' };
    updateState.doc = { _id: OID, title: 'X', dueDate: new Date(), paidAt: null };
    const res = await PATCH(makeReq({ body: { paid: false } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet()).toEqual({ paidAt: null });
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('404s a paid transition when the bill does not exist', async () => {
    findByIdState.doc = null;
    const res = await PATCH(makeReq({ body: { paid: true } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(billUpdate).not.toHaveBeenCalled();
  });
});

// P9 — `amount` arrives as the PRINTED figure but is stored in base currency, so any money
// field in the body forces all four to be recomputed together from the current doc. A body
// with none of them must not pay for the extra read.
describe('PATCH multi-currency (P9)', () => {
  it('an amount-only PATCH on a base-currency bill stores it untouched and zeroes the triple', async () => {
    findByIdState.doc = { _id: OID, title: 'ΔΕΗ', amount: 62, currency: 'EUR', origAmount: 0, fxRate: 0 };
    updateState.doc = { _id: OID, title: 'ΔΕΗ', amount: 70 };
    await PATCH(makeReq({ body: { amount: 70 } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 70, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('an amount + currency + rate PATCH converts before storing and keeps the printed figure', async () => {
    findByIdState.doc = { _id: OID, title: 'AWS', amount: 62, currency: 'EUR', origAmount: 0, fxRate: 0 };
    updateState.doc = { _id: OID, title: 'AWS', amount: 80.96 };
    await PATCH(makeReq({ body: { amount: 88, currency: 'USD', fxRate: 0.92 } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 });
  });

  it('a rate-only PATCH converts the PRINTED amount already on the doc (origAmount), not the stored one', async () => {
    findByIdState.doc = { _id: OID, title: 'AWS', amount: 88, currency: 'USD', origAmount: 88, fxRate: 0 };
    updateState.doc = { _id: OID, title: 'AWS', amount: 80.96 };
    await PATCH(makeReq({ body: { fxRate: 0.92 } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 80.96, origAmount: 88, fxRate: 0.92 });
  });

  it('a currency-only PATCH back to base wipes the fx fields instead of leaving them stale', async () => {
    findByIdState.doc = { _id: OID, title: 'AWS', amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 };
    updateState.doc = { _id: OID, title: 'AWS', amount: 88 };
    await PATCH(makeReq({ body: { currency: 'EUR' } }), ctx(OID));
    // The printed 88 is what the doc claims it costs, so that is what stays.
    expect(lastSet()).toMatchObject({ amount: 88, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('a PATCH with no money field never reads the doc for fx purposes', async () => {
    updateState.doc = { _id: OID, title: 'Renamed' };
    await PATCH(makeReq({ body: { title: 'Renamed' } }), ctx(OID));
    expect(billFindById).not.toHaveBeenCalled();
    expect(lastSet()).toEqual({ title: 'Renamed' });
  });

  it('a money PATCH against a missing bill 404s before any write', async () => {
    findByIdState.doc = null;
    const res = await PATCH(makeReq({ body: { amount: 70 } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(billUpdate).not.toHaveBeenCalled();
  });

  it('a recurring spawn inherits the fx triple, so the projection stays base-denominated', async () => {
    findByIdState.doc = {
      _id: OID, title: 'AWS', vendor: 'AWS', amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92,
      cycle: 'monthly', paidAt: null, dueDate: new Date('2026-06-15'), category: 'other', notes: '',
    };
    updateState.doc = { _id: OID, title: 'AWS', amount: 80.96 };
    await PATCH(makeReq({ body: { paid: true } }), ctx(OID));
    expect(billCreate).toHaveBeenCalledTimes(1);
    expect(billCreate.mock.calls[0][0]).toMatchObject({ amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 });
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
