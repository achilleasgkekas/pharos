import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/expenses/:id are two of the ~50 REST endpoints the mobile app drives.
// Their route-level logic lives NOWHERE else and would silently corrupt the mobile contract:
//   - the shared `isObjectId` guard (a malformed :id must 400 BEFORE any DB touch),
//   - PATCH partial-update: only whitelisted, well-typed fields land in $set; setting a
//     vendor also recomputes vendorKey; recurringCycle accepts '' (clear) or the enum;
//     an empty changeset returns 400,
//   - PATCH returns the SPEC shape { expense: Expense } (the full trimmed doc), NOT a bare
//     { ok, id } — the mobile detail re-prefills in place from the response,
//   - DELETE is a SOFT delete ($set deletedAt, recoverable from Trash), and a missing row 404s.
// We exercise the REAL apiAuth/apiBody/apiList helpers + the real trimExpense serializer,
// and only mock the DB seam.

const { connectDBMock, userFindOne, userState, expenseUpdate, updateState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
  const expenseUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, expenseUpdate, updateState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Expense', () => ({ Expense: { findByIdAndUpdate: expenseUpdate } }));

import { PATCH, DELETE } from './route';

const OID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const BASE = 'http://pharos.local/api/v1/expenses';

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
  expenseUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
});

describe('auth + id guards', () => {
  it('PATCH without a token → 401, never touches the DB', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { vendor: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(expenseUpdate).not.toHaveBeenCalled();
  });
  it('PATCH with a malformed id → 400 before any DB touch', async () => {
    const res = await PATCH(makeReq({ body: { vendor: 'X' } }), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(expenseUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH partial-update', () => {
  it('rejects an empty changeset with 400 and no update', async () => {
    const res = await PATCH(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(expenseUpdate).not.toHaveBeenCalled();
  });

  it('setting vendor also recomputes vendorKey', async () => {
    updateState.doc = { _id: OID, vendor: 'ΔΕΗ', amount: 84 };
    await PATCH(makeReq({ body: { vendor: '  ΔΕΗ  ' } }), ctx(OID));
    const set = lastSet();
    expect(set.vendor).toBe('ΔΕΗ');
    expect(typeof set.vendorKey).toBe('string');
    expect(set.vendorKey).toBeTruthy();
  });

  it('accepts an empty recurringCycle (clear) and a valid enum value', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({ body: { recurringCycle: '' } }), ctx(OID));
    expect(lastSet().recurringCycle).toBe('');
    await PATCH(makeReq({ body: { recurringCycle: 'monthly' } }), ctx(OID));
    expect(lastSet().recurringCycle).toBe('monthly');
  });

  it('returns the SPEC { expense } wrapper (not a bare ok/id)', async () => {
    updateState.doc = { _id: OID, kind: 'expense', vendor: 'ΔΕΗ', amount: 84, category: 'utilities', updatedAt: new Date('2026-07-04T00:00:00Z') };
    const res = await PATCH(makeReq({ body: { amount: 84 } }), ctx(OID));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { expense: { id: string; vendor: string; amount: number } };
    expect(json).toHaveProperty('expense');
    expect(json).not.toHaveProperty('ok');
    expect(json.expense).toMatchObject({ id: OID, vendor: 'ΔΕΗ', amount: 84, category: 'utilities', currency: 'EUR' });
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { amount: 10 } }), ctx(OID));
    expect(res.status).toBe(404);
  });
});

describe('DELETE soft-delete', () => {
  it('sets deletedAt (soft delete) and returns { ok, id }', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
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
