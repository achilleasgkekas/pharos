import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST/DELETE /api/v1/push/register is the endpoint the Expo mobile app hits to register (on
// sign-in / permission grant) and unregister (on sign-out) its Expo push token, so Pharos can
// fan out alert notifications (deals / installments / warranties) to the device via Expo's push
// service. The route is thin — it delegates the write to User.updateOne — but three route-only
// behaviours live NOWHERE else and a drift silently breaks mobile push:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any DB write),
//   - POST: body.token must pass the REAL isExpoPushToken regex (ExponentPushToken[..] /
//     ExpoPushToken[..]); anything else → 400 'valid Expo push token required' with NO write.
//     On success → $addToSet the TRIMMED token onto the user's pushTokens, returns { ok:true }.
//   - DELETE: NO format check — any non-empty (post-trim) string is accepted → $pull the trimmed
//     token; empty / whitespace / non-string → 400 'token required' with NO write.
// We exercise the REAL apiAuth/apiBody/expoPush helpers (withAuth + readBody + isExpoPushToken)
// and only mock the DB seam: @/lib/db (connectDB) + @/models/User (findOne for auth, updateOne
// for the mutation).

const { connectDBMock, userFindOne, userState, updateOneMock, calls } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const calls: { updateOne: Array<{ filter: unknown; update: unknown }> } = { updateOne: [] };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const updateOneMock = vi.fn(async (filter: unknown, update: unknown) => {
    calls.updateOne.push({ filter, update });
    return { acknowledged: true, modifiedCount: 1 };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, updateOneMock, calls };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne, updateOne: updateOneMock } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST, DELETE } from './route';

const BASE = 'http://pharos.local/api/v1/push/register';
const GOOD = 'ExponentPushToken[abcDEF123]'; // canonical Expo token

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
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  calls.updateOne = [];
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  updateOneMock.mockImplementation(async (filter: unknown, update: unknown) => {
    calls.updateOne.push({ filter, update });
    return { acknowledged: true, modifiedCount: 1 };
  });
});

describe('auth gate', () => {
  it('POST without a token → 401, never writes', async () => {
    const res = await POST(makeReq({ auth: null, body: { token: GOOD } }));
    expect(res.status).toBe(401);
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never writes', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { token: GOOD } }));
    expect(res.status).toBe(401);
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('DELETE without a token → 401, never writes', async () => {
    const res = await DELETE(makeReq({ auth: null, body: { token: GOOD } }));
    expect(res.status).toBe(401);
    expect(updateOneMock).not.toHaveBeenCalled();
  });
});

describe('POST register', () => {
  it('stores a canonical ExponentPushToken via $addToSet, returns { ok:true }', async () => {
    const res = await POST(makeReq({ body: { token: GOOD } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateOneMock).toHaveBeenCalledOnce();
    expect(calls.updateOne[0]).toEqual({
      filter: { _id: 'u1' },
      update: { $addToSet: { pushTokens: GOOD } },
    });
  });

  it('accepts the shorter ExpoPushToken[..] variant', async () => {
    const tok = 'ExpoPushToken[xyz789]';
    const res = await POST(makeReq({ body: { token: tok } }));
    expect(res.status).toBe(200);
    expect(calls.updateOne[0].update).toEqual({ $addToSet: { pushTokens: tok } });
  });

  it('trims surrounding whitespace before storing', async () => {
    const res = await POST(makeReq({ body: { token: `   ${GOOD}\n` } }));
    expect(res.status).toBe(200);
    // $addToSet stores the TRIMMED token, not the padded input
    expect(calls.updateOne[0].update).toEqual({ $addToSet: { pushTokens: GOOD } });
  });

  it('rejects a token that is not Expo-shaped with 400, no write', async () => {
    const res = await POST(makeReq({ body: { token: 'just-a-plain-string' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'valid Expo push token required' });
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('rejects an FCM-looking token (wrong bracket shape) with 400', async () => {
    const res = await POST(makeReq({ body: { token: 'ExponentPushToken-no-brackets' } }));
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('rejects a missing token with 400, no write', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'valid Expo push token required' });
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string token (number) with 400', async () => {
    const res = await POST(makeReq({ body: { token: 12345 } }));
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
  });
});

describe('DELETE unregister', () => {
  it('pulls a canonical Expo token via $pull, returns { ok:true }', async () => {
    const res = await DELETE(makeReq({ body: { token: GOOD } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls.updateOne[0]).toEqual({
      filter: { _id: 'u1' },
      update: { $pull: { pushTokens: GOOD } },
    });
  });

  it('accepts ANY non-empty string (no Expo-format check on removal)', async () => {
    // A device may need to drop a token that no longer parses; DELETE must still remove it.
    const res = await DELETE(makeReq({ body: { token: 'legacy-non-expo-token' } }));
    expect(res.status).toBe(200);
    expect(calls.updateOne[0].update).toEqual({ $pull: { pushTokens: 'legacy-non-expo-token' } });
  });

  it('trims surrounding whitespace before pulling', async () => {
    const res = await DELETE(makeReq({ body: { token: `  ${GOOD}  ` } }));
    expect(res.status).toBe(200);
    expect(calls.updateOne[0].update).toEqual({ $pull: { pushTokens: GOOD } });
  });

  it('rejects an empty-string token with 400 "token required", no write', async () => {
    const res = await DELETE(makeReq({ body: { token: '' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'token required' });
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only token with 400 (trims to empty)', async () => {
    const res = await DELETE(makeReq({ body: { token: '   ' } }));
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('rejects a missing token with 400, no write', async () => {
    const res = await DELETE(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string token (number) with 400', async () => {
    const res = await DELETE(makeReq({ body: { token: 999 } }));
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
  });
});
