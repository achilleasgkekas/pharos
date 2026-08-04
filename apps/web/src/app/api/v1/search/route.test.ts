import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/search?q=… is one of the ~50 REST endpoints under /api/v1.
// It backs the global search bar: one query string in, a flat list of hits out across every
// collection (items / receipts / statements / tasks / subscriptions / expenses / vouchers).
// The route is thin — it delegates the actual cross-collection search to searchAll — but three
// pieces of route-only logic live NOWHERE else, so a drift here silently breaks search:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any searchAll call),
//   - the query prep + min-length guard: q = (?q ?? '').trim(); only q.length >= 2 hits searchAll,
//     shorter/blank queries short-circuit to [] WITHOUT touching the DB seam,
//   - the projection: each SearchHit is narrowed to { type, id, title, subtitle } — the `href`
//     field is dropped, so an API client never sees a web route it can't navigate.
// We exercise the REAL apiAuth helper (withAuth) and only mock the DB (auth chain) + searchAll.

const { connectDBMock, userFindOne, userState, searchAllMock, state } = vi.hoisted(() => {
  const state: { hits: unknown[]; lastQuery: string | null } = { hits: [], lastQuery: null };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const searchAllMock = vi.fn(async (q: string) => {
    state.lastQuery = q;
    return state.hits;
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, searchAllMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/search-actions', () => ({ searchAll: searchAllMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/search';

/** Minimal NextRequest stand-in — the route only reads headers.get and url. */
function makeReq(opts: { auth?: string | null; q?: string } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  const url = opts.q === undefined ? BASE : `${BASE}?q=${encodeURIComponent(opts.q)}`;
  return {
    url,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.hits = [];
  state.lastQuery = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  searchAllMock.mockImplementation(async (q: string) => {
    state.lastQuery = q;
    return state.hits;
  });
});

describe('auth gate', () => {
  it('without a token → 401, never runs the search', async () => {
    const res = await GET(makeReq({ auth: null, q: 'skroutz' }));
    expect(res.status).toBe(401);
    expect(searchAllMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never runs the search', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await GET(makeReq({ q: 'skroutz' }));
    expect(res.status).toBe(401);
    expect(searchAllMock).not.toHaveBeenCalled();
  });
});

describe('min-length guard', () => {
  it('returns { hits: [] } and skips searchAll when q is missing', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hits: [] });
    expect(searchAllMock).not.toHaveBeenCalled();
  });

  it('returns { hits: [] } and skips searchAll for a single-char query', async () => {
    const res = await GET(makeReq({ q: 'a' }));
    expect(await res.json()).toEqual({ hits: [] });
    expect(searchAllMock).not.toHaveBeenCalled();
  });

  it('trims before measuring: "  a  " is length 1 → [], no searchAll', async () => {
    const res = await GET(makeReq({ q: '  a  ' }));
    expect(await res.json()).toEqual({ hits: [] });
    expect(searchAllMock).not.toHaveBeenCalled();
  });

  it('a 2-char query is the boundary that DOES hit searchAll', async () => {
    await GET(makeReq({ q: 'ab' }));
    expect(searchAllMock).toHaveBeenCalledOnce();
    expect(state.lastQuery).toBe('ab');
  });

  it('passes the TRIMMED query to searchAll (leading/trailing space stripped)', async () => {
    await GET(makeReq({ q: '  skroutz  ' }));
    expect(searchAllMock).toHaveBeenCalledOnce();
    expect(state.lastQuery).toBe('skroutz');
  });
});

describe('projection', () => {
  it('narrows each hit to { type, id, title, subtitle } and drops href', async () => {
    state.hits = [
      { type: 'item', id: 'i1', title: 'RTX 5080', subtitle: '€1443 · TechLamb', href: '/items?open=i1' },
      { type: 'receipt', id: 'r1', title: 'Πλαίσιο', subtitle: '2025-11-22 · €149.50', href: '/receipts?open=r1' },
    ];
    const res = await GET(makeReq({ q: 'rtx' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { hits: Record<string, unknown>[] };
    expect(json.hits).toEqual([
      { type: 'item', id: 'i1', title: 'RTX 5080', subtitle: '€1443 · TechLamb' },
      { type: 'receipt', id: 'r1', title: 'Πλαίσιο', subtitle: '2025-11-22 · €149.50' },
    ]);
    expect(json.hits[0]).not.toHaveProperty('href');
    expect(json.hits[1]).not.toHaveProperty('href');
  });

  it('returns { hits: [] } when searchAll finds nothing for a valid query', async () => {
    state.hits = [];
    const res = await GET(makeReq({ q: 'zzzznothing' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hits: [] });
    expect(searchAllMock).toHaveBeenCalledOnce();
  });
});
