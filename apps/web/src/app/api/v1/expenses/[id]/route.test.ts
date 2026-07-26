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
//   - DELETE is a SOFT delete ($set deletedAt, recoverable from Trash), and a missing row 404s,
//   - P9 multi-currency: `amount` arrives PRINTED, so touching amount/currency/fxRate re-resolves
//     all four fields together against the CURRENT doc (never half-converted), and `{ currency }`
//     or `{ fxRate }` alone is a valid changeset even though neither writes into $set by itself.
// We exercise the REAL apiAuth/apiBody/apiList helpers + the real trimExpense serializer and the
// real resolveFx, and only mock the DB seam.

const { connectDBMock, userFindOne, userState, expenseUpdate, expenseFindById, updateState, existingState, settingsState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
  // The pre-update read the FX path does. `undefined` (the default) means "same doc the update
  // returns", so every pre-P9 test keeps working untouched; a test that cares about the stored
  // triple sets it explicitly.
  const existingState: { doc: unknown } = { doc: undefined };
  const settingsState = { currency: 'EUR' };
  const expenseUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  const expenseFindById = vi.fn(() => ({ lean: async () => (existingState.doc === undefined ? updateState.doc : existingState.doc) }));
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, expenseUpdate, expenseFindById, updateState, existingState, settingsState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Expense', () => ({ Expense: { findByIdAndUpdate: expenseUpdate, findById: expenseFindById } }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: settingsState.currency }) }));

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
  existingState.doc = undefined;
  settingsState.currency = 'EUR';
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  expenseUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  // vi.clearAllMocks() wipes the hoisted implementation too — restore it, or the FX path
  // would read `undefined` from findById and 404 every amount edit.
  expenseFindById.mockImplementation(() => ({ lean: async () => (existingState.doc === undefined ? updateState.doc : existingState.doc) }));
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

  it('trims+caps space to 40 chars', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({ body: { space: '  ' + 'Kalamos'.repeat(10) + '  ' } }), ctx(OID));
    const space = lastSet().space as string;
    expect(space.length).toBe(40);
    expect(space).toBe('Kalamos'.repeat(10).slice(0, 40));
  });

  it('accepts an empty space (clear)', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({ body: { space: '' } }), ctx(OID));
    expect(lastSet().space).toBe('');
  });

  it('cleans a submitted split array (trim/round/drop-nameless)', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({
      body: { split: [{ name: '  Anna  ', share: '15.5', settled: true }, { name: '  ', share: 5, settled: false }] },
    }), ctx(OID));
    expect(lastSet().split).toEqual([{ name: 'Anna', share: 15.5, settled: true }]);
  });

  it('an explicit empty split array clears all rows', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({ body: { split: [] } }), ctx(OID));
    expect(lastSet().split).toEqual([]);
  });

  it('omitting space/split leaves them out of $set entirely', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({ body: { amount: 10 } }), ctx(OID));
    const set = lastSet();
    expect(set).not.toHaveProperty('space');
    expect(set).not.toHaveProperty('split');
  });

  it('accepts taxDeductible (boolean) and taxCategory (trimmed+capped string)', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({ body: { taxDeductible: true, taxCategory: '  ' + 'Ιατρικά'.repeat(10) + '  ' } }), ctx(OID));
    const set = lastSet();
    expect(set.taxDeductible).toBe(true);
    expect((set.taxCategory as string).length).toBe(60);
    expect(set.taxCategory).toBe('Ιατρικά'.repeat(10).slice(0, 60));
  });

  it('omitting taxDeductible/taxCategory leaves them out of $set entirely', async () => {
    updateState.doc = { _id: OID, vendor: 'X' };
    await PATCH(makeReq({ body: { amount: 10 } }), ctx(OID));
    const set = lastSet();
    expect(set).not.toHaveProperty('taxDeductible');
    expect(set).not.toHaveProperty('taxCategory');
  });
});

// P9 — the mobile app edits an expense in the currency the bill is PRINTED in, while the DB
// stores base currency. These pin the "recompute the four fields together" rule: a partial edit
// must never leave a row half-converted, and re-saving an unchanged foreign row must not
// convert it twice.
describe('PATCH multi-currency (P9)', () => {
  it('a body without currency/fxRate stores the amount untouched, with the triple at base/0/0', async () => {
    updateState.doc = { _id: OID, vendor: 'ΔΕΗ', amount: 84 };
    await PATCH(makeReq({ body: { amount: 84 } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 84, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('a foreign amount + rate is converted before storage (printed stays in origAmount)', async () => {
    updateState.doc = { _id: OID, vendor: 'AWS', amount: 80.96 };
    await PATCH(makeReq({ body: { amount: 88, currency: 'USD', fxRate: 0.92 } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 });
  });

  it('a foreign amount with NO rate is stored as printed and flagged, never guessed at 1:1', async () => {
    updateState.doc = { _id: OID, vendor: 'AWS', amount: 88 };
    await PATCH(makeReq({ body: { amount: 88, currency: 'USD' } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 88, currency: 'USD', origAmount: 88, fxRate: 0 });
  });

  it('{ fxRate } alone re-converts the stored printed amount (no `no valid fields` 400)', async () => {
    // The common correction: the entry was saved foreign with no rate, the rate arrives later.
    existingState.doc = { _id: OID, vendor: 'AWS', amount: 88, currency: 'USD', origAmount: 88, fxRate: 0 };
    updateState.doc = { _id: OID, vendor: 'AWS', amount: 80.96 };
    const res = await PATCH(makeReq({ body: { fxRate: 0.92 } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet()).toMatchObject({ amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 });
  });

  it('{ currency } back to base un-converts: printed amount becomes the stored one, triple resets', async () => {
    existingState.doc = { _id: OID, vendor: 'AWS', amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 };
    updateState.doc = { _id: OID, vendor: 'AWS', amount: 88 };
    await PATCH(makeReq({ body: { currency: 'EUR' } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 88, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('editing a NON-money field on a foreign expense leaves its amount alone (no extra read)', async () => {
    existingState.doc = { _id: OID, vendor: 'AWS', amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 };
    updateState.doc = { _id: OID, vendor: 'AWS' };
    await PATCH(makeReq({ body: { category: 'software' } }), ctx(OID));
    const set = lastSet();
    expect(set).not.toHaveProperty('amount');
    expect(set).not.toHaveProperty('fxRate');
    expect(expenseFindById).not.toHaveBeenCalled();
  });

  it('re-sending the same printed amount on a foreign expense does not convert it twice', async () => {
    existingState.doc = { _id: OID, vendor: 'AWS', amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92 };
    updateState.doc = { _id: OID, vendor: 'AWS', amount: 80.96 };
    await PATCH(makeReq({ body: { amount: 88, currency: 'USD', fxRate: 0.92 } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 80.96, origAmount: 88 });
  });

  it('the base currency comes from settings: on a USD deployment, USD is not foreign', async () => {
    settingsState.currency = 'USD';
    updateState.doc = { _id: OID, vendor: 'AWS', amount: 88 };
    await PATCH(makeReq({ body: { amount: 88, currency: 'USD', fxRate: 0.92 } }), ctx(OID));
    expect(lastSet()).toMatchObject({ amount: 88, currency: 'USD', origAmount: 0, fxRate: 0 });
  });

  it('an empty body still 400s (the FX path must not invent a changeset)', async () => {
    const res = await PATCH(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(expenseUpdate).not.toHaveBeenCalled();
  });

  it('404s when the row an FX edit targets is gone', async () => {
    existingState.doc = null;
    const res = await PATCH(makeReq({ body: { fxRate: 0.92 } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(expenseUpdate).not.toHaveBeenCalled();
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
