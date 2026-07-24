import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH /api/v1/trash/:type/:id restores a soft-deleted record (clears deletedAt) — backs the
// mobile/web Trash screen's "Restore" button. DELETE permanently purges it (doc + files +
// cross-refs) — backs the "Delete forever" button, admin-only. Thin wrappers around the shared
// `restoreFromTrash`/`purgeTrashEntry` actions (settings/actions.ts) — their own DB/file-cleanup
// logic is NOT re-tested here.
//
// Route-only behaviour pinned here:
//   1. the local `:type` allow-list is a NARROWER copy of the action layer's `TrashType` union —
//      it's missing 'loyaltycard' (present in settings/actions.ts TRASH_MODELS) — so that one
//      400s 'bad type' at the route even though the action would accept it. 'goal' was added to
//      the allow-list alongside the P12 v1 goals route (mobile parity needs goal-trash restore to
//      actually work) — pinned as current behaviour, not "fixed" here (loyaltycard remains out of
//      this test's scope).
//   2. PATCH has NO role check — any authenticated user can restore.
//   3. DELETE's admin-role check runs BEFORE the type/id guards — a non-admin gets 403 without
//      the route ever validating (or even reading) :type/:id, and without calling the action.
//   4. NEITHER handler remaps `{ ok: false }` from the action to an error status — both always
//      respond 200 with `{ ok: r.ok, type, id }` verbatim, even when `r.ok` is false.
//
// We run the REAL apiAuth/apiBody helpers and mock only the DB + action seam.

const { connectDBMock, userFindOne, userState, restoreMock, purgeMock, restoreState, purgeState } =
  vi.hoisted(() => {
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    const restoreState: { calls: Array<{ type: string; id: string }>; result: { ok: boolean } } = {
      calls: [],
      result: { ok: true },
    };
    const purgeState: { calls: Array<{ type: string; id: string }>; result: { ok: boolean } } = {
      calls: [],
      result: { ok: true },
    };
    const restoreMock = vi.fn((type: string, id: string) => {
      restoreState.calls.push({ type, id });
      return Promise.resolve(restoreState.result);
    });
    const purgeMock = vi.fn((type: string, id: string) => {
      purgeState.calls.push({ type, id });
      return Promise.resolve(purgeState.result);
    });
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, restoreMock, purgeMock, restoreState, purgeState };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/settings/actions', () => ({ restoreFromTrash: restoreMock, purgeTrashEntry: purgeMock }));

import { PATCH, DELETE } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const base = (type: string, id: string) => `http://pharos.local/api/v1/trash/${type}/${id}`;

/** Minimal NextRequest stand-in — neither handler ever reads a body, only headers.get. */
function makeReq(type: string, id: string, opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: base(type, id),
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

/** The dynamic route receives { params: Promise<{ type, id }> }. */
function ctx(type: string, id: string) {
  return { params: Promise.resolve({ type, id }) };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  restoreState.calls = [];
  restoreState.result = { ok: true };
  purgeState.calls = [];
  purgeState.result = { ok: true };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  restoreMock.mockImplementation((type: string, id: string) => {
    restoreState.calls.push({ type, id });
    return Promise.resolve(restoreState.result);
  });
  purgeMock.mockImplementation((type: string, id: string) => {
    purgeState.calls.push({ type, id });
    return Promise.resolve(purgeState.result);
  });
});

describe('PATCH (restore) — auth gate', () => {
  it('without a token → 401, never restores', async () => {
    const res = await PATCH(makeReq('item', OID, { auth: null }), ctx('item', OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never restores', async () => {
    userState.doc = null;
    const res = await PATCH(makeReq('item', OID, { auth: 'Bearer bad' }), ctx('item', OID));
    expect(res.status).toBe(401);
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it('a non-admin CAN restore (no role check on PATCH)', async () => {
    userState.doc = { _id: 'u2', name: 'Member', username: 'mem', role: 'member' };
    const res = await PATCH(makeReq('item', OID), ctx('item', OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: 'item', id: OID });
    expect(restoreState.calls).toEqual([{ type: 'item', id: OID }]);
  });
});

describe('PATCH (restore) — type guard', () => {
  it.each(['item', 'receipt', 'expense', 'subscription', 'voucher', 'giftcard', 'bill', 'goal', 'task'])(
    'accepts allow-listed type %s',
    async (type) => {
      const res = await PATCH(makeReq(type, OID), ctx(type, OID));
      expect(res.status).toBe(200);
      expect(restoreState.calls).toEqual([{ type, id: OID }]);
    }
  );

  it.each(['loyaltycard'])(
    'rejects %s — present in the action-layer TrashType union but NOT in this route\'s local allow-list',
    async (type) => {
      const res = await PATCH(makeReq(type, OID), ctx(type, OID));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad type' });
      expect(restoreMock).not.toHaveBeenCalled();
    }
  );

  it('an unrelated string type → 400 bad type, no action call', async () => {
    const res = await PATCH(makeReq('widget', OID), ctx('widget', OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad type' });
    expect(restoreMock).not.toHaveBeenCalled();
  });
});

describe('PATCH (restore) — id guard', () => {
  it('a malformed id → 400 bad id, no action call', async () => {
    const res = await PATCH(makeReq('item', 'not-an-id'), ctx('item', 'not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(restoreMock).not.toHaveBeenCalled();
  });
});

describe('PATCH (restore) — response shape passes r.ok through verbatim', () => {
  it('action { ok: true } → 200 { ok: true, type, id } (no error remap)', async () => {
    restoreState.result = { ok: true };
    const res = await PATCH(makeReq('receipt', OID), ctx('receipt', OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: 'receipt', id: OID });
  });

  it('action { ok: false } (unknown model) → STILL 200, body carries ok:false — no failure remap', async () => {
    restoreState.result = { ok: false };
    const res = await PATCH(makeReq('receipt', OID), ctx('receipt', OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, type: 'receipt', id: OID });
  });
});

describe('DELETE (purge) — auth gate', () => {
  it('without a token → 401, never purges', async () => {
    const res = await DELETE(makeReq('item', OID, { auth: null }), ctx('item', OID));
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never purges', async () => {
    userState.doc = null;
    const res = await DELETE(makeReq('item', OID, { auth: 'Bearer bad' }), ctx('item', OID));
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });
});

describe('DELETE (purge) — admin gate runs BEFORE type/id validation', () => {
  it('a non-admin → 403, even with a malformed type AND id — neither is ever checked', async () => {
    userState.doc = { _id: 'u2', name: 'Member', username: 'mem', role: 'member' };
    const res = await DELETE(makeReq('not-a-type', 'not-an-id'), ctx('not-a-type', 'not-an-id'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Admin access required' });
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('an admin passes the role gate and proceeds to type/id validation', async () => {
    const res = await DELETE(makeReq('item', OID), ctx('item', OID));
    expect(res.status).toBe(200);
    expect(purgeState.calls).toEqual([{ type: 'item', id: OID }]);
  });
});

describe('DELETE (purge) — type guard (admin)', () => {
  it.each(['loyaltycard'])('rejects %s — not in the local allow-list', async (type) => {
    const res = await DELETE(makeReq(type, OID), ctx(type, OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad type' });
    expect(purgeMock).not.toHaveBeenCalled();
  });
});

describe('DELETE (purge) — id guard (admin)', () => {
  it('a malformed id → 400 bad id, no action call', async () => {
    const res = await DELETE(makeReq('item', 'not-an-id'), ctx('item', 'not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(purgeMock).not.toHaveBeenCalled();
  });
});

describe('DELETE (purge) — response shape passes r.ok through verbatim', () => {
  it('action { ok: true } → 200 { ok: true, type, id }', async () => {
    purgeState.result = { ok: true };
    const res = await DELETE(makeReq('voucher', OID), ctx('voucher', OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: 'voucher', id: OID });
  });

  it('action { ok: false } → STILL 200, body carries ok:false — no failure remap', async () => {
    purgeState.result = { ok: false };
    const res = await DELETE(makeReq('voucher', OID), ctx('voucher', OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, type: 'voucher', id: OID });
  });
});
