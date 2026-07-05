import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST/DELETE /api/v1/statements/plans/merge is the mobile app's only path to the installment
// plan merge/bind write-ops (mirror of the web PlanMergeControl). It carries no serialization,
// but it does carry the contract that MUST hold or the mobile "⑂ Merge into…" affordance breaks:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, action never runs),
//   - POST body validation: BOTH sourceKey and targetKey required (blank → 400 'sourceKey and
//     targetKey required') before touching the DB, and the action's own error is surfaced,
//   - DELETE body validation: key required (blank → 400 'key required'),
//   - the response envelope shape ({ ok, moved }) the mobile client reads, with moved defaulting
//     to 0 when the wrapped action omits it.
// We exercise the REAL apiAuth/apiBody helpers and only mock the DB seam (connectDB + User for the
// auth gate) plus the two proven server actions, so the route's validation runs for real.

const { connectDBMock, userFindOne, userState, bindMock, unbindMock, state } = vi.hoisted(() => {
  const state: { bind: unknown; unbind: unknown } = {
    bind: { ok: true, moved: 3 },
    unbind: { ok: true, moved: 2 },
  };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const bindMock = vi.fn(async () => state.bind);
  const unbindMock = vi.fn(async () => state.unbind);
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, bindMock, unbindMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/statements/actions', () => ({
  bindInstallmentGroup: bindMock,
  unbindInstallmentGroup: unbindMock,
}));

import { POST, DELETE } from './route';

const BASE = 'http://pharos.local/api/v1/statements/plans/merge';

/** Minimal NextRequest stand-in — the route only reads headers.get and json(). */
function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.bind = { ok: true, moved: 3 };
  state.unbind = { ok: true, moved: 2 };
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  bindMock.mockImplementation(async () => state.bind);
  unbindMock.mockImplementation(async () => state.unbind);
});

describe('auth gate', () => {
  it('POST without a token → 401, never binds', async () => {
    const res = await POST(makeReq({ auth: null, body: { sourceKey: 'a', targetKey: 'b' } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(bindMock).not.toHaveBeenCalled();
  });

  it('DELETE with an unknown token → 401, never unbinds', async () => {
    userState.doc = null; // token resolves to no user
    const res = await DELETE(makeReq({ body: { key: 'a' } }));
    expect(res.status).toBe(401);
    expect(unbindMock).not.toHaveBeenCalled();
  });
});

describe('POST validation', () => {
  it('rejects a missing sourceKey with 400 and no bind', async () => {
    const res = await POST(makeReq({ body: { targetKey: 'b' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'sourceKey and targetKey required' });
    expect(bindMock).not.toHaveBeenCalled();
  });

  it('rejects a missing targetKey with 400 and no bind', async () => {
    const res = await POST(makeReq({ body: { sourceKey: 'a' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'sourceKey and targetKey required' });
    expect(bindMock).not.toHaveBeenCalled();
  });

  it('rejects a blank (whitespace) targetKey with 400', async () => {
    const res = await POST(makeReq({ body: { sourceKey: 'a', targetKey: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'sourceKey and targetKey required' });
    expect(bindMock).not.toHaveBeenCalled();
  });
});

describe('POST happy path', () => {
  it('binds and returns 200 + { ok, moved } from the action', async () => {
    const res = await POST(makeReq({ body: { sourceKey: 'a', targetKey: 'b' } }));
    expect(res.status).toBe(200);
    expect(bindMock).toHaveBeenCalledWith('a', 'b');
    expect(await res.json()).toEqual({ ok: true, moved: 3 });
  });

  it('trims the keys before binding', async () => {
    await POST(makeReq({ body: { sourceKey: '  a  ', targetKey: '  b  ' } }));
    expect(bindMock).toHaveBeenCalledWith('a', 'b');
  });

  it('defaults moved to 0 when the action omits it', async () => {
    state.bind = { ok: true };
    const res = await POST(makeReq({ body: { sourceKey: 'a', targetKey: 'b' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moved: 0 });
  });

  it('surfaces the action error as a 400', async () => {
    state.bind = { ok: false, error: 'Pick two different plans' };
    const res = await POST(makeReq({ body: { sourceKey: 'a', targetKey: 'a' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Pick two different plans' });
  });

  it('falls back to a generic message when the action fails without an error', async () => {
    state.bind = { ok: false };
    const res = await POST(makeReq({ body: { sourceKey: 'a', targetKey: 'b' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'merge failed' });
  });
});

describe('DELETE validation', () => {
  it('rejects a missing key with 400 and no unbind', async () => {
    const res = await DELETE(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'key required' });
    expect(unbindMock).not.toHaveBeenCalled();
  });

  it('rejects a blank (whitespace) key with 400', async () => {
    const res = await DELETE(makeReq({ body: { key: '  ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'key required' });
    expect(unbindMock).not.toHaveBeenCalled();
  });
});

describe('DELETE happy path', () => {
  it('unbinds and returns 200 + { ok, moved } from the action', async () => {
    const res = await DELETE(makeReq({ body: { key: 'a' } }));
    expect(res.status).toBe(200);
    expect(unbindMock).toHaveBeenCalledWith('a');
    expect(await res.json()).toEqual({ ok: true, moved: 2 });
  });

  it('trims the key before unbinding', async () => {
    await DELETE(makeReq({ body: { key: '  a  ' } }));
    expect(unbindMock).toHaveBeenCalledWith('a');
  });

  it('defaults moved to 0 when the action omits it', async () => {
    state.unbind = { ok: true };
    const res = await DELETE(makeReq({ body: { key: 'a' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moved: 0 });
  });

  it('propagates ok:false from the action (still 200 envelope)', async () => {
    state.unbind = { ok: false };
    const res = await DELETE(makeReq({ body: { key: 'a' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, moved: 0 });
  });
});
