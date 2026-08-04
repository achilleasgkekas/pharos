import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/PATCH /api/v1/notifications is one of the ~50 REST endpoints under /api/v1.
// It surfaces the live alert feed (deals / installments / warranties / system) and lets the app
// mark notifications read. The route is thin — it delegates to getNotifications /
// markNotificationRead / markAllNotificationsRead — but the response SHAPE and the
// validation/branch mapping live NOWHERE else, so a drift here silently breaks the
// notification centre:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any action call),
//   - GET: returns getNotifications() verbatim ({ items, unread } — NOT a list envelope, no wrapper),
//   - PATCH: id present + string + non-empty → isObjectId guard (400 'bad id' on malformed) →
//     markNotificationRead(id) (mark ONE); id missing / empty / non-string → markAllNotificationsRead
//     (mark ALL). Both branches ignore the action result and return { ok:true } at 200.
// We exercise the REAL apiAuth/apiBody helpers (withAuth + readBody + isObjectId) and only mock
// the DB (auth chain) + the notifications actions seam.

const { connectDBMock, userFindOne, userState, getNotificationsMock, markOneMock, markAllMock, getAppSettingsMock, settingsState, state } =
  vi.hoisted(() => {
    const state: {
      feed: { items: unknown[]; unread: number };
      markedOne: string | null;
      markedAllCount: number;
    } = { feed: { items: [], unread: 0 }, markedOne: null, markedAllCount: 0 };
    const settingsState: { currency: string } = { currency: 'EUR' };
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    const getNotificationsMock = vi.fn(async () => state.feed);
    const getAppSettingsMock = vi.fn(async () => ({ currency: settingsState.currency }));
    const markOneMock = vi.fn(async (id: string) => {
      state.markedOne = id;
      return { ok: true };
    });
    const markAllMock = vi.fn(async () => {
      state.markedAllCount += 1;
      return { ok: true };
    });
    return {
      connectDBMock: vi.fn(async () => {}),
      userFindOne,
      userState,
      getNotificationsMock,
      markOneMock,
      markAllMock,
      getAppSettingsMock,
      settingsState,
      state,
    };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/notifications/actions', () => ({
  getNotifications: getNotificationsMock,
  markNotificationRead: markOneMock,
  markAllNotificationsRead: markAllMock,
}));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, PATCH } from './route';

const BASE = 'http://pharos.local/api/v1/notifications';
const OID = 'a'.repeat(24); // valid 24-hex ObjectId

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
  state.feed = { items: [], unread: 0 };
  state.markedOne = null;
  state.markedAllCount = 0;
  settingsState.currency = 'EUR';
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  getNotificationsMock.mockImplementation(async () => state.feed);
  getAppSettingsMock.mockImplementation(async () => ({ currency: settingsState.currency }));
  markOneMock.mockImplementation(async (id: string) => {
    state.markedOne = id;
    return { ok: true };
  });
  markAllMock.mockImplementation(async () => {
    state.markedAllCount += 1;
    return { ok: true };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never loads the feed', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getNotificationsMock).not.toHaveBeenCalled();
  });

  it('PATCH with an unknown token → 401, never marks anything', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await PATCH(makeReq({ body: { id: OID } }));
    expect(res.status).toBe(401);
    expect(markOneMock).not.toHaveBeenCalled();
    expect(markAllMock).not.toHaveBeenCalled();
  });
});

describe('GET feed', () => {
  it('returns getNotifications() verbatim ({ items, unread }), no envelope/wrapper', async () => {
    state.feed = {
      items: [
        { _id: 'n1', kind: 'deal', title: 'Price drop', body: 'U7 Pro €270', href: '/items?open=n1', read: false, createdAt: '2026-07-01T00:00:00.000Z' },
        { _id: 'n2', kind: 'warranty', title: 'Expiring', body: 'Apple Pencil', href: null, read: true, createdAt: '2026-06-01T00:00:00.000Z' },
      ],
      unread: 1,
    };
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { currency: string; items: unknown[]; unread: number };
    expect(json).toEqual({ currency: 'EUR', ...state.feed });
    expect(json).not.toHaveProperty('data');
    expect(json).not.toHaveProperty('total');
  });

  it('returns an empty feed when there is nothing', async () => {
    const res = await GET(makeReq());
    expect(await res.json()).toEqual({ currency: 'EUR', items: [], unread: 0 });
  });

  it('passes through the configured currency from getAppSettings, defaulting to EUR when unset', async () => {
    settingsState.currency = 'USD';
    const res = await GET(makeReq());
    const json = (await res.json()) as { currency: string };
    expect(json.currency).toBe('USD');

    settingsState.currency = '';
    const res2 = await GET(makeReq());
    expect(((await res2.json()) as { currency: string }).currency).toBe('EUR');
  });
});

describe('PATCH mark-one branch', () => {
  it('marks a single notification read for a valid ObjectId and returns { ok:true }', async () => {
    const res = await PATCH(makeReq({ body: { id: OID } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(markOneMock).toHaveBeenCalledOnce();
    expect(state.markedOne).toBe(OID);
    expect(markAllMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed id with 400 "bad id" before any mark call', async () => {
    const res = await PATCH(makeReq({ body: { id: 'not-an-oid' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(markOneMock).not.toHaveBeenCalled();
    expect(markAllMock).not.toHaveBeenCalled();
  });
});

describe('PATCH mark-all branch', () => {
  it('marks all read when no id is present', async () => {
    const res = await PATCH(makeReq({ body: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(markAllMock).toHaveBeenCalledOnce();
    expect(markOneMock).not.toHaveBeenCalled();
  });

  it('marks all read when id is an empty string (falls out of the mark-one guard)', async () => {
    await PATCH(makeReq({ body: { id: '' } }));
    expect(markAllMock).toHaveBeenCalledOnce();
    expect(markOneMock).not.toHaveBeenCalled();
  });

  it('marks all read when id is a non-string (e.g. a number)', async () => {
    await PATCH(makeReq({ body: { id: 123 } }));
    expect(markAllMock).toHaveBeenCalledOnce();
    expect(markOneMock).not.toHaveBeenCalled();
  });
});
