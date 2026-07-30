import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/calendarFeedActions.ts (41 lines) is a small, standalone concern (NOT part
// of the giant app/settings/actions.ts) — the per-user token behind /api/calendar.ics (a
// read-only "secret address" iCal feed, same model as a Google Calendar private URL).
// Three functions: getCalendarFeed (read), generateCalendarFeed (create/rotate),
// revokeCalendarFeed (clear). Unlike almost every other settings action, this one is
// per-user (keyed by getCurrentUser().id via User.findById/updateOne), not the
// AppConfig singleton, so User is the only model mocked here.
//
// Behaviour pinned:
//  - getCalendarFeed: NO write gate (read-only). Short-circuits to {token:null} WITHOUT
//    ever calling connectDB when there is no session. Reads via
//    User.findById(id).select('calendarToken').lean(); a missing doc or a falsy stored
//    value (null/'') both normalize to {token:null} via `doc?.calendarToken || null`.
//  - generateCalendarFeed: assertCanWrite() runs BEFORE the session check (a gate
//    rejection is an uncaught throw, same class of ordering as reports/fxActions.ts).
//    No session -> {ok:false, error:'Not signed in'} WITHOUT calling connectDB. On
//    success, the token is prefixed 'phcal_' + a random base64url suffix, stored via
//    User.updateOne({_id:u.id}, {$set:{calendarToken:token}}), and returned in the
//    result — rotating silently invalidates any previously-issued token (no history kept).
//  - revokeCalendarFeed: same assertCanWrite-first/no-connectDB-on-no-session shape, but
//    the no-session failure is just {ok:false} (no error field, unlike generate). Success
//    sets calendarToken:null via the same updateOne shape and returns {ok:true}.

const {
  connectDBMock,
  userFindByIdLean,
  userUpdateOne,
  assertCanWriteMock,
  getCurrentUserMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  userFindByIdLean: vi.fn(async (_id: string): Promise<{ calendarToken: string | null } | null> => null),
  userUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>) => ({})),
  assertCanWriteMock: vi.fn(async () => {}),
  getCurrentUserMock: vi.fn(async (): Promise<{ id: string; role: 'admin' | 'member' | 'viewer'; name: string } | null> => null),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({
  User: {
    findById: (id: string) => ({ select: () => ({ lean: () => userFindByIdLean(id) }) }),
    updateOne: userUpdateOne,
  },
}));
vi.mock('@/lib/auth', () => ({
  assertCanWrite: assertCanWriteMock,
  getCurrentUser: getCurrentUserMock,
}));

import { getCalendarFeed, generateCalendarFeed, revokeCalendarFeed } from './calendarFeedActions';

const USER = { id: 'user1', role: 'member' as const, name: 'Achilleas' };

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  userFindByIdLean.mockImplementation(async () => null);
  userUpdateOne.mockImplementation(async () => ({}));
  assertCanWriteMock.mockImplementation(async () => {});
  getCurrentUserMock.mockImplementation(async () => null);
});

describe('getCalendarFeed', () => {
  it('has no write gate (read-only)', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue({ calendarToken: 'phcal_abc' });
    await getCalendarFeed();
    expect(assertCanWriteMock).not.toHaveBeenCalled();
  });

  it('returns {token:null} without hitting the DB when logged out', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const r = await getCalendarFeed();
    expect(r).toEqual({ token: null });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(userFindByIdLean).not.toHaveBeenCalled();
  });

  it('returns the stored token for a logged-in user', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue({ calendarToken: 'phcal_xyz123' });
    const r = await getCalendarFeed();
    expect(userFindByIdLean).toHaveBeenCalledWith('user1');
    expect(r).toEqual({ token: 'phcal_xyz123' });
  });

  it('normalizes a missing doc to {token:null}', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue(null);
    const r = await getCalendarFeed();
    expect(r).toEqual({ token: null });
  });

  it('normalizes a falsy stored token (empty string) to {token:null}', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue({ calendarToken: '' });
    const r = await getCalendarFeed();
    expect(r).toEqual({ token: null });
  });
});

describe('generateCalendarFeed', () => {
  it('checks the write gate before the session', async () => {
    assertCanWriteMock.mockRejectedValue(new Error('Read-only session'));
    getCurrentUserMock.mockResolvedValue(null);
    await expect(generateCalendarFeed()).rejects.toThrow('Read-only session');
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it('returns {ok:false, error} without connecting when logged out', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const r = await generateCalendarFeed();
    expect(r).toEqual({ ok: false, error: 'Not signed in' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('generates a phcal_-prefixed token, persists it, and returns it', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const r = await generateCalendarFeed();
    expect(r.ok).toBe(true);
    expect(r.token).toMatch(/^phcal_[A-Za-z0-9_-]+$/);
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'user1' }, { $set: { calendarToken: r.token } });
  });

  it('rotates: two calls produce two different tokens', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const first = await generateCalendarFeed();
    const second = await generateCalendarFeed();
    expect(first.token).not.toBe(second.token);
  });
});

describe('revokeCalendarFeed', () => {
  it('checks the write gate before the session', async () => {
    assertCanWriteMock.mockRejectedValue(new Error('Read-only session'));
    getCurrentUserMock.mockResolvedValue(null);
    await expect(revokeCalendarFeed()).rejects.toThrow('Read-only session');
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it('returns {ok:false} (no error field) without connecting when logged out', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const r = await revokeCalendarFeed();
    expect(r).toEqual({ ok: false });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('clears the stored token and returns {ok:true}', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const r = await revokeCalendarFeed();
    expect(r).toEqual({ ok: true });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'user1' }, { $set: { calendarToken: null } });
  });
});
