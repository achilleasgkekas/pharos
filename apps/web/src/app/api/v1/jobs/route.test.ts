import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/jobs is one of the ~50 REST endpoints the Expo mobile app drives.
// It backs the background-jobs feed (the floating "N running" widget + the /jobs view): the recent
// AI jobs (bulk receipt re-scan, item AI-fill, ...), running ones first then newest. The route is a
// thin verbatim wrapper — it delegates the whole find-sort-serialize (and the ensureProcessor
// self-heal side effect) to getJobs — but two pieces of route-only behaviour live NOWHERE else, so
// a drift here silently breaks the mobile jobs widget:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any getJobs call),
//   - the envelope: the rows come back under a bare { rows } key, verbatim (no projection, no
//     filtering, no data/total list envelope) — exactly the JobRow[] getJobs returns.
// We exercise the REAL apiAuth helper (withAuth) and only mock the DB (auth chain) + getJobs.

const { connectDBMock, userFindOne, userState, getJobsMock, state } = vi.hoisted(() => {
  const state: { rows: unknown[] } = { rows: [] };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const getJobsMock = vi.fn(async () => state.rows);
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, getJobsMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/jobActions', () => ({ getJobs: getJobsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/jobs';

/** Minimal NextRequest stand-in — the route only reads headers.get and url. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.rows = [];
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  getJobsMock.mockImplementation(async () => state.rows);
});

describe('auth gate', () => {
  it('without a token → 401, never reads the jobs', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getJobsMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never reads the jobs', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(getJobsMock).not.toHaveBeenCalled();
  });
});

describe('listing', () => {
  it('wraps getJobs output verbatim under { rows }', async () => {
    state.rows = [
      {
        _id: 'j1',
        kind: 'rescan-receipts',
        title: 'Re-scan 238 receipts',
        href: '/receipts',
        status: 'running',
        total: 238,
        done: 40,
        ok: 37,
        current: 'Πλαίσιο',
        lastLabel: 'Κωτσόβολος',
        lastOk: true,
        lastDetail: '€149.50',
        error: '',
        createdAt: '2026-07-09T10:00:00.000Z',
        finishedAt: null,
      },
      {
        _id: 'j2',
        kind: 'ai-fill-items',
        title: 'AI fill 5 items',
        href: '/items',
        status: 'done',
        total: 5,
        done: 5,
        ok: 5,
        current: '',
        lastLabel: '',
        lastOk: true,
        lastDetail: '',
        error: '',
        createdAt: '2026-07-09T09:00:00.000Z',
        finishedAt: '2026-07-09T09:05:00.000Z',
      },
    ];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: state.rows });
    expect(getJobsMock).toHaveBeenCalledOnce();
  });

  it('returns { rows: [] } when there are no jobs', async () => {
    state.rows = [];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [] });
    expect(getJobsMock).toHaveBeenCalledOnce();
  });

  it('does not re-shape, re-sort, or filter rows — the order and every field pass through untouched', async () => {
    // getJobs already sorts (running first, then newest); the route must NOT reorder.
    state.rows = [
      { _id: 'a', kind: 'ai-fill-items', title: 'A', status: 'running', createdAt: '2026-07-09T08:00:00.000Z', finishedAt: null },
      { _id: 'b', kind: 'rescan-receipts', title: 'B', status: 'done', createdAt: '2026-07-09T12:00:00.000Z', finishedAt: '2026-07-09T12:01:00.000Z' },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as { rows: Record<string, unknown>[] };
    expect(json.rows).toHaveLength(2);
    expect(json.rows[0]._id).toBe('a'); // order preserved verbatim
    expect(json.rows[1]).toEqual({
      _id: 'b',
      kind: 'rescan-receipts',
      title: 'B',
      status: 'done',
      createdAt: '2026-07-09T12:00:00.000Z',
      finishedAt: '2026-07-09T12:01:00.000Z',
    });
  });
});
