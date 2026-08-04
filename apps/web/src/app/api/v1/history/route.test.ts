import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/history is one of the ~50 REST endpoints under /api/v1.
// It backs the "History" view: a newest-first list of saved AI command-bar conversations,
// so an API client can reopen a past exchange. The route is a thin verbatim wrapper — it
// delegates the whole find-sort-shape to getConversations — but two pieces of route-only
// behaviour live NOWHERE else, so a drift here silently breaks the History tab:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any getConversations call),
//   - the envelope: the rows come back under a bare { rows } key, verbatim (no projection, no
//     filtering, no data/total list envelope) — exactly the ConversationRow[] getConversations returns.
// We exercise the REAL apiAuth helper (withAuth) and only mock the DB (auth chain) + getConversations.

const { connectDBMock, userFindOne, userState, getConversationsMock, state } = vi.hoisted(() => {
  const state: { rows: unknown[] } = { rows: [] };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const getConversationsMock = vi.fn(async () => state.rows);
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, getConversationsMock, state };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/history/actions', () => ({ getConversations: getConversationsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/history';

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
  getConversationsMock.mockImplementation(async () => state.rows);
});

describe('auth gate', () => {
  it('without a token → 401, never reads the conversations', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getConversationsMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never reads the conversations', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(getConversationsMock).not.toHaveBeenCalled();
  });
});

describe('listing', () => {
  it('wraps getConversations output verbatim under { rows }', async () => {
    state.rows = [
      {
        id: 'c2',
        title: 'Add subscription',
        turns: 3,
        updatedAt: '2026-07-09T10:00:00.000Z',
        preview: 'Καταχώρησα τη συνδρομή Netflix, 15€ κάθε μήνα ✓',
        messages: [
          { role: 'user', content: 'add a subscription', actions: [] },
          { role: 'assistant', content: 'Ποια συνδρομή;', actions: [] },
        ],
      },
      {
        id: 'c1',
        title: 'Show stats',
        turns: 1,
        updatedAt: '2026-07-08T09:00:00.000Z',
        preview: 'This month you spent €30',
        messages: [{ role: 'assistant', content: 'This month you spent €30', actions: [{ name: 'get_overview', summary: 'overview' }] }],
      },
    ];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: state.rows });
    expect(getConversationsMock).toHaveBeenCalledOnce();
  });

  it('returns { rows: [] } when there is no history', async () => {
    state.rows = [];
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [] });
    expect(getConversationsMock).toHaveBeenCalledOnce();
  });

  it('does not re-shape or filter rows — every field (incl. nested messages/actions) passes through untouched', async () => {
    state.rows = [
      {
        id: 't1',
        title: 'Ship OSS',
        turns: 2,
        updatedAt: '2026-07-09T12:00:00.000Z',
        preview: '',
        messages: [
          { role: 'user', content: 'ship it', actions: [] },
          { role: 'assistant', content: 'done', actions: [{ name: 'add_task', summary: 'task Ship OSS' }] },
        ],
      },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as { rows: Record<string, unknown>[] };
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0]).toEqual({
      id: 't1',
      title: 'Ship OSS',
      turns: 2,
      updatedAt: '2026-07-09T12:00:00.000Z',
      preview: '',
      messages: [
        { role: 'user', content: 'ship it', actions: [] },
        { role: 'assistant', content: 'done', actions: [{ name: 'add_task', summary: 'task Ship OSS' }] },
      ],
    });
  });
});
