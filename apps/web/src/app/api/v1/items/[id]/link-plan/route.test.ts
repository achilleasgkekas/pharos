import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST/DELETE /api/v1/items/:id/link-plan back the mobile "link this product to an installment
// plan" / "unlink" actions on the item-detail screen. Both are thin wrappers around the proven
// web `linkPlanToItem` / `removeItemFromPlanByKey` actions (statements/actions.ts) — a plan can
// carry several products, so linking is additive and unlinking only drops this one item.
//
// Route-only behaviour that lives ONLY here (not exercised by the action's own tests):
//   1. the ObjectId guard (malformed :id → 400 bad id, BEFORE any body read or action call),
//   2. the signature gate: `typeof b.signature === 'string' ? b.signature.trim() : ''` — a
//      non-string signature collapses to '', and a whitespace-only signature trims to '' too →
//      400 'signature required' WITHOUT calling the action,
//   3. the trimmed signature (not the raw one) is what gets forwarded to the action,
//   4. **no failure remap**: unlike items/[id]/price, these two handlers just echo `r.ok` (and
//      POST's `r.linked`) straight into a 200 JSON body — even an `{ ok: false }` action result
//      does NOT become a 400 here. That's a real behavioural difference worth pinning.
//
// We run the REAL apiAuth/apiBody helpers and mock only the DB + action seam.

const {
  connectDBMock,
  userFindOne,
  userState,
  linkPlanToItemMock,
  removeItemFromPlanByKeyMock,
  linkState,
  removeState,
} = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const linkState: { calls: Array<{ signature: string; itemId: string }>; result: { ok: boolean; linked: number } } = {
    calls: [],
    result: { ok: true, linked: 1 },
  };
  const removeState: { calls: Array<{ signature: string; itemId: string }>; result: { ok: boolean } } = {
    calls: [],
    result: { ok: true },
  };
  const linkPlanToItemMock = vi.fn((signature: string, itemId: string) => {
    linkState.calls.push({ signature, itemId });
    return Promise.resolve(linkState.result);
  });
  const removeItemFromPlanByKeyMock = vi.fn((signature: string, itemId: string) => {
    removeState.calls.push({ signature, itemId });
    return Promise.resolve(removeState.result);
  });
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userState,
    linkPlanToItemMock,
    removeItemFromPlanByKeyMock,
    linkState,
    removeState,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/statements/actions', () => ({
  linkPlanToItem: linkPlanToItemMock,
  removeItemFromPlanByKey: removeItemFromPlanByKeyMock,
}));

import { POST, DELETE } from './route';

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/items/${OID}/link-plan`;

/** Minimal NextRequest stand-in — the route only reads headers.get and json(). */
function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

/** The dynamic route receives { params: Promise<{ id }> }. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  linkState.calls = [];
  linkState.result = { ok: true, linked: 1 };
  removeState.calls = [];
  removeState.result = { ok: true };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  linkPlanToItemMock.mockImplementation((signature: string, itemId: string) => {
    linkState.calls.push({ signature, itemId });
    return Promise.resolve(linkState.result);
  });
  removeItemFromPlanByKeyMock.mockImplementation((signature: string, itemId: string) => {
    removeState.calls.push({ signature, itemId });
    return Promise.resolve(removeState.result);
  });
});

describe('POST — link', () => {
  describe('auth gate', () => {
    it('without a token → 401, never links', async () => {
      const res = await POST(makeReq({ auth: null, body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
      expect(linkPlanToItemMock).not.toHaveBeenCalled();
    });

    it('with an unknown token → 401, never links', async () => {
      userState.doc = null;
      const res = await POST(makeReq({ auth: 'Bearer bad', body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(401);
      expect(linkPlanToItemMock).not.toHaveBeenCalled();
    });
  });

  describe('id guard', () => {
    it('a malformed id → 400 bad id, no action call', async () => {
      const res = await POST(makeReq({ body: { signature: 'sig-1' } }), ctx('not-an-id'));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad id' });
      expect(linkPlanToItemMock).not.toHaveBeenCalled();
    });
  });

  describe('signature validation', () => {
    it('rejects a missing signature with 400 and the exact message, no action call', async () => {
      const res = await POST(makeReq({ body: {} }), ctx(OID));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'signature required' });
      expect(linkPlanToItemMock).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only signature (trims to empty)', async () => {
      const res = await POST(makeReq({ body: { signature: '   ' } }), ctx(OID));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'signature required' });
      expect(linkPlanToItemMock).not.toHaveBeenCalled();
    });

    it('rejects a non-string signature (collapses to empty)', async () => {
      const res = await POST(makeReq({ body: { signature: 42 } }), ctx(OID));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'signature required' });
      expect(linkPlanToItemMock).not.toHaveBeenCalled();
    });

    it('forwards the TRIMMED signature, not the raw one', async () => {
      const res = await POST(makeReq({ body: { signature: '  plaisio|12|2026-04  ' } }), ctx(OID));
      expect(res.status).toBe(200);
      expect(linkState.calls[0]).toEqual({ signature: 'plaisio|12|2026-04', itemId: OID });
    });
  });

  describe('happy path + no failure remap', () => {
    it('links and echoes { ok, linked } straight through', async () => {
      linkState.result = { ok: true, linked: 2 };
      const res = await POST(makeReq({ body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, linked: 2 });
      expect(linkPlanToItemMock).toHaveBeenCalledOnce();
    });

    it('an action { ok: false } is still returned as 200 (no remap to 400)', async () => {
      linkState.result = { ok: false, linked: 0 };
      const res = await POST(makeReq({ body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: false, linked: 0 });
    });
  });
});

describe('DELETE — unlink', () => {
  describe('auth gate', () => {
    it('without a token → 401, never unlinks', async () => {
      const res = await DELETE(makeReq({ auth: null, body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(401);
      expect(removeItemFromPlanByKeyMock).not.toHaveBeenCalled();
    });

    it('with an unknown token → 401, never unlinks', async () => {
      userState.doc = null;
      const res = await DELETE(makeReq({ auth: 'Bearer bad', body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(401);
      expect(removeItemFromPlanByKeyMock).not.toHaveBeenCalled();
    });
  });

  describe('id guard', () => {
    it('a malformed id → 400 bad id, no action call', async () => {
      const res = await DELETE(makeReq({ body: { signature: 'sig-1' } }), ctx('not-an-id'));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad id' });
      expect(removeItemFromPlanByKeyMock).not.toHaveBeenCalled();
    });
  });

  describe('signature validation', () => {
    it('rejects a missing signature with 400, no action call', async () => {
      const res = await DELETE(makeReq({ body: {} }), ctx(OID));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'signature required' });
      expect(removeItemFromPlanByKeyMock).not.toHaveBeenCalled();
    });

    it('forwards the trimmed signature', async () => {
      const res = await DELETE(makeReq({ body: { signature: ' sig-2 ' } }), ctx(OID));
      expect(res.status).toBe(200);
      expect(removeState.calls[0]).toEqual({ signature: 'sig-2', itemId: OID });
    });
  });

  describe('happy path + no failure remap', () => {
    it('unlinks and echoes { ok: true }', async () => {
      const res = await DELETE(makeReq({ body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(removeItemFromPlanByKeyMock).toHaveBeenCalledOnce();
    });

    it('an action { ok: false } is still returned as 200 (no remap to 400)', async () => {
      removeState.result = { ok: false };
      const res = await DELETE(makeReq({ body: { signature: 'sig-1' } }), ctx(OID));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: false });
    });
  });
});
