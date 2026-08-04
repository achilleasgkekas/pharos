import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/auth/login is the ONLY unauthenticated /api/v1 route: an API client posts
// { username, password } here to obtain the per-user bearer `apiToken` it then sends as
// `Authorization: Bearer <token>` on every other request. Several route-only behaviours live
// NOWHERE else and a drift silently locks callers out (or worse, opens brute-force):
//   - the login rate-limit gate (rateLimit(`login:<ip>`) → 429 BEFORE any body parse / DB read,
//     keyed by x-forwarded-for → x-real-ip → 'unknown'); off unless API_RATE_LIMIT is set,
//   - body validation: malformed JSON → 400 'Invalid JSON body'; missing username OR password
//     (after trim) → 400 'username and password required', both WITHOUT touching the DB,
//   - username is trimmed + lowercased before the User.findOne lookup,
//   - credential check: unknown user OR verifyPassword() false → 401 'Invalid credentials',
//   - token minting: an existing apiToken is returned as-is (no save); a user WITHOUT one gets a
//     freshly minted `phk_<base64url>` token persisted via user.save() and returned,
//   - the response user shape { id, name (falls back to username), username, role }.
// We run the REAL rateLimit / apiRateLimit / apiError helpers and node:crypto, and mock only the
// DB seam (@/lib/db connectDB, @/models/User findOne) + the verifyPassword crypto seam.

const { connectDBMock, userFindOne, userState, verifyPasswordMock } = vi.hoisted(() => {
  const userState: { doc: Record<string, unknown> | null; saveCalls: number } = {
    doc: null,
    saveCalls: 0,
  };
  const userFindOne = vi.fn((_q?: unknown) => ({ select: (_f?: unknown) => userState.doc }));
  const verifyPasswordMock = vi.fn((_plain: string, _stored: string) => true);
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userState,
    verifyPasswordMock,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/lib/auth', () => ({ verifyPassword: verifyPasswordMock, assertCanWrite: vi.fn(async () => {}) }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';
// Real store so we can exercise (and reset) the actual fixed-window rate limiter.
import { rateStore } from '@/lib/apiRateLimit';

const BASE = 'http://pharos.local/api/v1/auth/login';

/** A fresh, credential-valid user doc with a spy-able save(). apiToken defaults to unset. */
function makeUser(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: 'u1',
    name: 'Achilleas',
    username: 'ach',
    role: 'admin',
    passwordHash: 'scrypt$hash',
    apiToken: undefined,
    save: vi.fn(async () => {
      userState.saveCalls += 1;
    }),
    ...over,
  };
}

/** Minimal NextRequest stand-in — the route reads headers.get (ip keys) and json(). */
function makeReq(
  opts: { body?: unknown; badJson?: boolean; xff?: string | null; xreal?: string | null } = {}
): NextRequest {
  return {
    url: BASE,
    headers: {
      get: (h: string) => {
        const k = h.toLowerCase();
        if (k === 'x-forwarded-for') return opts.xff ?? null;
        if (k === 'x-real-ip') return opts.xreal ?? null;
        return null;
      },
    },
    json: async () => {
      if (opts.badJson) throw new SyntaxError('Unexpected end of JSON input');
      return opts.body === undefined ? {} : opts.body;
    },
  } as unknown as NextRequest;
}

const CREDS = { username: 'ach', password: 'hunter2' };

beforeEach(() => {
  userState.doc = makeUser();
  userState.saveCalls = 0;
  rateStore.clear();
  delete process.env.API_RATE_LIMIT;
  delete process.env.API_RATE_WINDOW_MS;
  vi.clearAllMocks();
  userFindOne.mockImplementation((_q?: unknown) => ({ select: (_f?: unknown) => userState.doc }));
  verifyPasswordMock.mockImplementation((_plain: string, _stored: string) => true);
});

afterEach(() => {
  delete process.env.API_RATE_LIMIT;
  delete process.env.API_RATE_WINDOW_MS;
  rateStore.clear();
});

describe('body validation', () => {
  it('malformed JSON body → 400 "Invalid JSON body", never reads the DB', async () => {
    const res = await POST(makeReq({ badJson: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('missing username → 400 "username and password required", no DB read', async () => {
    const res = await POST(makeReq({ body: { password: 'x' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'username and password required' });
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('missing password → 400, no DB read', async () => {
    const res = await POST(makeReq({ body: { username: 'ach' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'username and password required' });
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('whitespace-only username (trims to empty) → 400, no DB read', async () => {
    const res = await POST(makeReq({ body: { username: '   ', password: 'x' } }));
    expect(res.status).toBe(400);
    expect(userFindOne).not.toHaveBeenCalled();
  });
});

describe('credential check', () => {
  it('unknown user (findOne → null) → 401 "Invalid credentials"', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ body: CREDS }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });
    // verifyPassword must NOT be reached when the user is absent (short-circuit)
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it('wrong password (verifyPassword → false) → 401, no token minted', async () => {
    verifyPasswordMock.mockReturnValue(false);
    const res = await POST(makeReq({ body: CREDS }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });
    expect(userState.saveCalls).toBe(0);
    // verifyPassword receives the raw password + the stored hash
    expect(verifyPasswordMock).toHaveBeenCalledWith('hunter2', 'scrypt$hash');
  });

  it('trims + lowercases the username before the lookup', async () => {
    await POST(makeReq({ body: { username: '  ACH  ', password: 'hunter2' } }));
    expect(userFindOne).toHaveBeenCalledWith({ username: 'ach' });
  });
});

describe('success + token minting', () => {
  it('mints a phk_ token when the user has none, persists via save(), returns it', async () => {
    userState.doc = makeUser({ apiToken: undefined });
    const res = await POST(makeReq({ body: CREDS }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; user: unknown };
    expect(json.token).toMatch(/^phk_[A-Za-z0-9_-]+$/);
    expect(userState.saveCalls).toBe(1);
    // the minted token is written back onto the doc before saving
    expect(userState.doc?.apiToken).toBe(json.token);
  });

  it('returns an EXISTING apiToken verbatim and does NOT call save()', async () => {
    userState.doc = makeUser({ apiToken: 'phk_existing_TOKEN' });
    const res = await POST(makeReq({ body: CREDS }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string };
    expect(json.token).toBe('phk_existing_TOKEN');
    expect(userState.saveCalls).toBe(0);
  });

  it('returns the { id, name, username, role } user shape', async () => {
    userState.doc = makeUser({ apiToken: 'phk_x', _id: 'abc123', role: 'member' });
    const res = await POST(makeReq({ body: CREDS }));
    expect(await res.json()).toEqual({
      token: 'phk_x',
      user: { id: 'abc123', name: 'Achilleas', username: 'ach', role: 'member' },
    });
  });

  it('falls back to username when the user has no name', async () => {
    userState.doc = makeUser({ apiToken: 'phk_x', name: undefined });
    const res = await POST(makeReq({ body: CREDS }));
    const json = (await res.json()) as { user: { name: string } };
    expect(json.user.name).toBe('ach');
  });
});

describe('rate-limit gate', () => {
  it('is OFF by default → login proceeds normally', async () => {
    const res = await POST(makeReq({ body: CREDS }));
    expect(res.status).toBe(200);
  });

  it('trips 429 once the per-ip window limit is exceeded, BEFORE any DB read', async () => {
    process.env.API_RATE_LIMIT = '2';
    const ip = { xff: '203.0.113.9' };
    // limit=2 → first two allowed, third blocked (all same ip key)
    expect((await POST(makeReq({ body: CREDS, ...ip }))).status).toBe(200);
    expect((await POST(makeReq({ body: CREDS, ...ip }))).status).toBe(200);
    userFindOne.mockClear();
    const blocked = await POST(makeReq({ body: CREDS, ...ip }));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: 'Rate limit exceeded — slow down and retry later',
    });
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe('2');
    // the gate short-circuits: no lookup happens on the blocked attempt
    expect(userFindOne).not.toHaveBeenCalled();
  });

  it('keys the limit per-ip: a different x-forwarded-for is not blocked', async () => {
    process.env.API_RATE_LIMIT = '1';
    expect((await POST(makeReq({ body: CREDS, xff: '198.51.100.1' }))).status).toBe(200);
    // same ip again → blocked
    expect((await POST(makeReq({ body: CREDS, xff: '198.51.100.1' }))).status).toBe(429);
    // fresh ip → still allowed
    expect((await POST(makeReq({ body: CREDS, xff: '198.51.100.2' }))).status).toBe(200);
  });

  it('uses the first x-forwarded-for hop as the ip key', async () => {
    process.env.API_RATE_LIMIT = '1';
    // both requests share the same leading hop → second is blocked despite differing tails
    expect((await POST(makeReq({ body: CREDS, xff: '203.0.113.5, 10.0.0.1' }))).status).toBe(200);
    expect((await POST(makeReq({ body: CREDS, xff: '203.0.113.5, 10.0.0.9' }))).status).toBe(429);
  });
});
