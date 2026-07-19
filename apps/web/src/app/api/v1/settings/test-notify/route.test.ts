import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/settings/test-notify is the "Send test notification" button in Settings →
// Notifications (web + mobile): it fires a one-off ntfy push using whatever channel config is
// already saved, with NO request body at all. The route is a thin wrapper around sendTestNtfy,
// but two route-only behaviours live nowhere else and a drift silently breaks the test-notify
// button: the Bearer-auth gate (withAuth → 401 BEFORE calling sendTestNtfy), and the envelope —
// ok → 200 { ok: true }; not-ok → apiError(r.error || 'Notification failed') i.e. 400 { error }
// with a 'Notification failed' fallback when the action returns an empty error string.
// We exercise the REAL apiAuth helpers (withAuth + apiError) and only mock the DB seam
// (@/lib/db + @/models/User for the auth lookup) and the sendTestNtfy action.

type NotifyResult = { ok: true } | { ok: false; error?: string };

const { connectDBMock, userFindOne, userState, sendTestNtfy } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const sendTestNtfy = vi.fn<() => Promise<NotifyResult>>(async () => ({ ok: true }));
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, sendTestNtfy };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/settings/actions', () => ({ sendTestNtfy }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/settings/test-notify';

/** Minimal NextRequest stand-in — the route only reads headers.get (authorization); no body. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null),
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  sendTestNtfy.mockImplementation(async () => ({ ok: true as const }));
});

describe('auth gate', () => {
  it('no token → 401, never sends', async () => {
    const res = await POST(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(sendTestNtfy).not.toHaveBeenCalled();
  });

  it('unknown token → 401, never sends', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(sendTestNtfy).not.toHaveBeenCalled();
  });
});

describe('envelope', () => {
  it('ok result → 200 { ok: true }, called with no args', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendTestNtfy).toHaveBeenCalledOnce();
    expect(sendTestNtfy.mock.calls[0]).toEqual([]);
  });

  it('not-ok result → 400 { error } with the action message', async () => {
    sendTestNtfy.mockResolvedValueOnce({ ok: false as const, error: 'Set an ntfy URL first' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Set an ntfy URL first' });
  });

  it('empty error string falls back to 400 { error: "Notification failed" }', async () => {
    sendTestNtfy.mockResolvedValueOnce({ ok: false as const, error: '' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Notification failed' });
  });

  it('undefined error falls back to 400 { error: "Notification failed" }', async () => {
    sendTestNtfy.mockResolvedValueOnce({ ok: false as const });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Notification failed' });
  });
});
