import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/settings/test-notify is the "Send test notification" button in Settings →
// Notifications (web + API clients): it fires a one-off ntfy push using whatever channel config is
// already saved, with NO request body at all.
//
// Route-only behaviours that live nowhere else, and that a drift here silently breaks:
//   - the Bearer-auth gate (withAuth → 401 BEFORE anything is sent),
//   - the admin gate on the Bearer ROLE. This route used to delegate to the `sendTestNtfy`
//     server action, which guards with `requireAdmin()` → `getCurrentUser()` → the session
//     COOKIE. A Bearer request from the phone carries no cookie, so that guard did not deny
//     non-admins, it threw a redirect out of the route and broke the endpoint for EVERYONE.
//     The old version of this test mocked the action, so it stayed green while the real path
//     was dead. Hence: mock the shared `runNtfyTest` body instead, and assert the role gate
//     here, where the transport can actually evaluate it.
//   - the envelope — ok → 200 { ok: true }; not-ok → apiError(r.error || 'Notification failed')
//     i.e. 400 { error } with a fallback when the helper returns an empty error string.
// We exercise the REAL apiAuth helpers (withAuth + apiError) and the REAL role table, and only
// mock the DB seam (@/lib/db + @/models/User for the auth lookup) and the send itself.

type NotifyResult = { ok: boolean; error?: string };

const { connectDBMock, userFindOne, userState, runNtfyTest } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const runNtfyTest = vi.fn<() => Promise<NotifyResult>>(async () => ({ ok: true }));
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, runNtfyTest };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/lib/notify', () => ({ runNtfyTest }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/settings/test-notify';

/** Minimal NextRequest stand-in — the route only reads headers.get (authorization); no body. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    method: 'POST',
    headers: {
      get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null),
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  runNtfyTest.mockImplementation(async () => ({ ok: true }));
});

describe('auth gate', () => {
  it('no token → 401, never sends', async () => {
    const res = await POST(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(runNtfyTest).not.toHaveBeenCalled();
  });

  it('unknown token → 401, never sends', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(runNtfyTest).not.toHaveBeenCalled();
  });

  it('a member → 403 Admin only, never sends', async () => {
    userState.doc = { _id: 'u2', name: 'Member', username: 'mem', role: 'member' };
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/admin only/i);
    expect(runNtfyTest).not.toHaveBeenCalled();
  });

  // A viewer never reaches the admin check: withAuth blocks every non-read method first.
  it('a viewer → 403 from the read-only guard, never sends', async () => {
    userState.doc = { _id: 'u3', name: 'Guest', username: 'guest', role: 'viewer' };
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(runNtfyTest).not.toHaveBeenCalled();
  });

  it('an admin is allowed through', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(runNtfyTest).toHaveBeenCalledOnce();
  });
});

describe('envelope', () => {
  it('ok result → 200 { ok: true }, called with no args', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(runNtfyTest.mock.calls[0]).toEqual([]);
  });

  it('not-ok result → 400 { error } with the helper message', async () => {
    runNtfyTest.mockResolvedValueOnce({ ok: false, error: 'Set an ntfy URL first' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Set an ntfy URL first' });
  });

  it('empty error string falls back to 400 { error: "Notification failed" }', async () => {
    runNtfyTest.mockResolvedValueOnce({ ok: false, error: '' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Notification failed' });
  });

  it('undefined error falls back to 400 { error: "Notification failed" }', async () => {
    runNtfyTest.mockResolvedValueOnce({ ok: false });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Notification failed' });
  });
});
