import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/ai/subscription is the "AI-fill by name" seam used by the New Subscription form
// (web + API clients): given just a name like "Netflix", it asks suggestSubscriptionInfo (subscriptions/
// actions.ts) to guess provider/amount/billingCycle/category/etc. The route itself is a thin
// envelope, but two route-only behaviours live nowhere else and a drift here silently breaks the
// autofill button:
//   - `name` is read as `String(b.name || '').trim()` — non-string bodies are coerced, whitespace-only
//     names are rejected — and a missing/empty name short-circuits to 400 WITHOUT ever calling
//     suggestSubscriptionInfo (no wasted AI call),
//   - the envelope: ok → 200 { data } (the parsed ParsedSubscription verbatim); not-ok → apiError(r.error, 400)
//     — this covers both "not a validation problem" errors (feature-flag off, Ollama unreachable) since
//     suggestSubscriptionInfo folds all of those into the same ok:false shape.
// We exercise the REAL apiAuth/apiBody helpers (withAuth + readBody) and only mock the DB seam
// (@/lib/db + @/models/User for the auth lookup) and suggestSubscriptionInfo itself.

type ParsedSubscription = Record<string, unknown>;
type SuggestResult = { ok: true; data: ParsedSubscription } | { ok: false; error: string };

const { userFindOne, userState, suggestSubscriptionInfo } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const suggestSubscriptionInfo = vi.fn<(name: string) => Promise<SuggestResult>>(async () => ({
    ok: true,
    data: { name: 'Netflix', provider: 'Netflix', amount: 15.99, billingCycle: 'monthly' },
  }));
  return { userFindOne, userState, suggestSubscriptionInfo };
});

vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/subscriptions/actions', () => ({ suggestSubscriptionInfo }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/ai/subscription';

/** Minimal NextRequest stand-in — the route reads headers.get (authorization only) and json()
 *  (via readBody, never throws on malformed JSON). */
function makeReq(opts: { auth?: string | null; body?: unknown; badJson?: boolean } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null),
    },
    json: async () => {
      if (opts.badJson) throw new Error('bad json');
      return opts.body === undefined ? {} : opts.body;
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  suggestSubscriptionInfo.mockImplementation(async () => ({
    ok: true as const,
    data: { name: 'Netflix', provider: 'Netflix', amount: 15.99, billingCycle: 'monthly' },
  }));
});

describe('auth gate', () => {
  it('no token → 401, never calls suggestSubscriptionInfo', async () => {
    const res = await POST(makeReq({ auth: null, body: { name: 'Netflix' } }));
    expect(res.status).toBe(401);
    expect(suggestSubscriptionInfo).not.toHaveBeenCalled();
  });

  it('unknown token → 401, never calls suggestSubscriptionInfo', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { name: 'Netflix' } }));
    expect(res.status).toBe(401);
    expect(suggestSubscriptionInfo).not.toHaveBeenCalled();
  });
});

describe('name validation (never throws)', () => {
  it('missing name → 400 "name required", never calls suggestSubscriptionInfo', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name required' });
    expect(suggestSubscriptionInfo).not.toHaveBeenCalled();
  });

  it('empty string name → 400, never calls suggestSubscriptionInfo', async () => {
    const res = await POST(makeReq({ body: { name: '' } }));
    expect(res.status).toBe(400);
    expect(suggestSubscriptionInfo).not.toHaveBeenCalled();
  });

  it('whitespace-only name → 400 (trimmed to empty), never calls suggestSubscriptionInfo', async () => {
    const res = await POST(makeReq({ body: { name: '   ' } }));
    expect(res.status).toBe(400);
    expect(suggestSubscriptionInfo).not.toHaveBeenCalled();
  });

  it('a malformed JSON body → readBody swallows it to {} → 400, never calls suggestSubscriptionInfo', async () => {
    const res = await POST(makeReq({ badJson: true }));
    expect(res.status).toBe(400);
    expect(suggestSubscriptionInfo).not.toHaveBeenCalled();
  });

  it('a non-string name is coerced via String() and trimmed before being forwarded', async () => {
    await POST(makeReq({ body: { name: 42 } }));
    expect(suggestSubscriptionInfo).toHaveBeenCalledWith('42');
  });

  it('leading/trailing whitespace is trimmed before being forwarded', async () => {
    await POST(makeReq({ body: { name: '  Spotify  ' } }));
    expect(suggestSubscriptionInfo).toHaveBeenCalledWith('Spotify');
  });
});

describe('envelope', () => {
  it('ok result → 200 { data } verbatim', async () => {
    suggestSubscriptionInfo.mockResolvedValueOnce({
      ok: true as const,
      data: { name: 'Spotify', provider: 'Spotify', amount: 9.99, billingCycle: 'monthly', category: 'streaming' },
    });
    const res = await POST(makeReq({ body: { name: 'Spotify' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { name: 'Spotify', provider: 'Spotify', amount: 9.99, billingCycle: 'monthly', category: 'streaming' },
    });
  });

  it('not-ok result (e.g. feature disabled) → 400 { error } with the action message', async () => {
    suggestSubscriptionInfo.mockResolvedValueOnce({
      ok: false as const,
      error: 'Subscription autofill (AI) is turned off.',
    });
    const res = await POST(makeReq({ body: { name: 'Netflix' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Subscription autofill (AI) is turned off.' });
  });

  it('not-ok result (e.g. Ollama unreachable) → 400 { error } verbatim, no fallback message', async () => {
    suggestSubscriptionInfo.mockResolvedValueOnce({ ok: false as const, error: 'Ollama is not reachable' });
    const res = await POST(makeReq({ body: { name: 'Netflix' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Ollama is not reachable' });
  });
});
