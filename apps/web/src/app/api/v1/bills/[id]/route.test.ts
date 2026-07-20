import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/bills/:id — P28 mobile-parity. Mirrors the vouchers [id] route
// tests, plus the `paid`/`paidDate` mark-paid transition which — like the web
// `markBillPaid` action — spawns the next pending instance one cycle ahead the FIRST
// time a recurring bill is paid (guarded by the existing paidAt, never on a re-mark).
// A drift here silently corrupts the mobile Bills contract:
//   - the shared `isObjectId` guard (400 before any DB touch),
//   - PATCH partial-update: only whitelisted fields land in $set, blank title dropped,
//     empty changeset → 400, returns the SPEC { bill, spawnedNext } shape,
//   - `paid: true` sets paidAt (now or paidDate) and spawns exactly once per bill,
//   - `paid: false` clears paidAt without touching anything else,
//   - DELETE is a soft delete, a missing row 404s.

const { connectDBMock, userFindOne, userState, billUpdate, billFindById, billCreate, updateState, findByIdState } =
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
    const billCreate = vi.fn(async (arg: Record<string, unknown>) => ({ toObject: () => arg }));
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, billUpdate, billFindById, billCreate, updateState, findByIdState };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Bill', () => ({ Bill: { findByIdAndUpdate: billUpdate, findById: billFindById, create: billCreate } }));

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
  updateState.calls = [];
  findByIdState.doc = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
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
