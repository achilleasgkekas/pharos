import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/trash is one of the ~50 REST endpoints under /api/v1.
// It backs the "Trash" view: a flat, most-recently-deleted-first list of soft-deleted records
// across every collection (item / receipt / expense / subscription / voucher / task), so an
// API client can show + restore them. The route is a thin verbatim wrapper — it delegates
// the whole gather-and-sort (and the 30-day auto-purge side effect) to getTrash — but two pieces
// of route-only behaviour live NOWHERE else, so a drift here silently breaks the Trash tab:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any getTrash call),
//   - the envelope: the rows come back under a bare { rows } key, verbatim (no projection, no
//     filtering, no data/total list envelope) — exactly the TrashRow[] getTrash returns.
// We exercise the REAL apiAuth helper (withAuth) and only mock the DB (auth chain) + getTrash.

const { connectDBMock, userFindOne, userState, getTrashMock, state } = vi.hoisted(() => {
  const state: { rows: unknown[] } = { rows: [] };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const getTrashMock = vi.fn(async () => state.rows);
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, getTrashMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/settings/actions', () => ({ getTrash: getTrashMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/trash';

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
  getTrashMock.mockImplementation(async () => state.rows);
});

describe('auth gate', () => {
  it('without a token → 401, never reads the trash', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getTrashMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never reads the trash', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(getTrashMock).not.toHaveBeenCalled();
  });
});

describe('listing', () => {
  it('wraps getTrash output verbatim under { rows }', async () => {
    state.rows = [
      { type: 'receipt', id: 'r1', title: 'Πλαίσιο', subtitle: '€149.50', deletedAt: '2026-07-09T10:00:00.000Z' },
      { type: 'item', id: 'i1', title: 'RTX 5080', subtitle: 'TechLamb', deletedAt: '2026-07-08T09:00:00.000Z' },
    ];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: state.rows });
    expect(getTrashMock).toHaveBeenCalledOnce();
  });

  it('returns { rows: [] } when the trash is empty', async () => {
    state.rows = [];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [] });
    expect(getTrashMock).toHaveBeenCalledOnce();
  });

  it('does not re-shape or filter rows — every field passes through untouched', async () => {
    state.rows = [
      { type: 'task', id: 't1', title: 'Ship OSS', subtitle: '', deletedAt: '2026-07-09T12:00:00.000Z' },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as { rows: Record<string, unknown>[] };
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0]).toEqual({
      type: 'task',
      id: 't1',
      title: 'Ship OSS',
      subtitle: '',
      deletedAt: '2026-07-09T12:00:00.000Z',
    });
  });
});
