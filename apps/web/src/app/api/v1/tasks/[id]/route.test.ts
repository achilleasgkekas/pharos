import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/tasks/:id are two of the ~50 REST endpoints the Expo mobile
// app drives. Their route-level logic lives NOWHERE else and would silently corrupt
// the mobile contract if it drifted:
//   - the shared `isObjectId` guard (a malformed :id must 400 BEFORE any DB touch),
//   - PATCH partial-update: only the whitelisted, well-typed fields land in $set;
//     a blank title / out-of-enum status / non-array tags are dropped, an empty
//     changeset returns 400, status==='done' toggles completedAt, and `dueDate` uses
//     key-presence ('dueDate' in body) so an explicit null clears it,
//   - the full-array `steps` replacement (trim + drop empty-text, mobile sends the
//     whole list on every add/toggle/remove),
//   - DELETE is a SOFT delete ($set deletedAt, recoverable from Trash) — never a hard
//     removeById — and a missing row 404s.
// We exercise the REAL apiAuth/apiBody/apiList helpers and only mock the DB seam
// (connectDB + the User/Task models), so validation + serialization run for real.

const { connectDBMock, userFindOne, userState, taskUpdate, updateState } = vi.hoisted(() => {
  // User model — bearerUser does User.findOne(...).select(...).lean()
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Task.findByIdAndUpdate(id, update, opts).lean() — capture args, control the returned doc.
  const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = {
    doc: null,
    calls: [],
  };
  const taskUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, taskUpdate, updateState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Task', () => ({ Task: { findByIdAndUpdate: taskUpdate } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { PATCH, DELETE } from './route';

const OID = 'a1b2c3d4e5f6a1b2c3d4e5f6'; // valid 24-hex ObjectId
const BASE = 'http://pharos.local/api/v1/tasks';

/** Minimal NextRequest stand-in — the route only reads headers.get + json(). */
function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

/** The Next.js `{ params: Promise<{ id }> }` context arg the dynamic route awaits. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** The $set object the route handed findByIdAndUpdate on the most recent call. */
function lastSet(): Record<string, unknown> {
  const call = updateState.calls[updateState.calls.length - 1];
  return (call.update as { $set: Record<string, unknown> }).$set;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  updateState.doc = null;
  updateState.calls = [];
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  taskUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
});

describe('auth gate', () => {
  it('PATCH without a token → 401, never touches the DB', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { title: 'x' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it('DELETE with an unknown token → 401, never soft-deletes', async () => {
    userState.doc = null;
    const res = await DELETE(makeReq({ auth: 'Bearer nope' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(taskUpdate).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 bad id, before any DB touch', async () => {
    const res = await PATCH(makeReq({ body: { title: 'x' } }), ctx('not-an-oid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    // (connectDB runs during the auth lookup; the guard's job is to block the Task write.)
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it('DELETE with a malformed id → 400 bad id, before any DB touch', async () => {
    const res = await DELETE(makeReq(), ctx('123'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(taskUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH partial update', () => {
  it('rejects an empty changeset with 400 and no DB write', async () => {
    const res = await PATCH(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it('drops invalid fields (blank title, out-of-enum status, non-array tags) → still empty → 400', async () => {
    const res = await PATCH(makeReq({ body: { title: '   ', status: 'archived', priority: 'urgent', tags: 'a,b' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
  });

  it('builds $set from the whitelisted fields only and trims the title', async () => {
    updateState.doc = { _id: OID, title: 'Wire rack', status: 'todo' };
    const res = await PATCH(makeReq({ body: { title: '  Wire rack  ', unknownField: 'ignored' } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = lastSet();
    expect(set).toEqual({ title: 'Wire rack' });
    expect('unknownField' in set).toBe(false);
    // findByIdAndUpdate called with the id, {$set}, and {new:true}
    const call = updateState.calls[0];
    expect(call.id).toBe(OID);
    expect(call.opts).toEqual({ new: true });
  });

  it('status=done sets completedAt to a Date; a non-done status nulls it', async () => {
    updateState.doc = { _id: OID, title: 't', status: 'done' };
    await PATCH(makeReq({ body: { status: 'done' } }), ctx(OID));
    expect(lastSet().status).toBe('done');
    expect(lastSet().completedAt).toBeInstanceOf(Date);

    updateState.calls = [];
    await PATCH(makeReq({ body: { status: 'in-progress' } }), ctx(OID));
    expect(lastSet().status).toBe('in-progress');
    expect(lastSet().completedAt).toBeNull();
  });

  it('stringifies an array of tags', async () => {
    updateState.doc = { _id: OID, title: 't' };
    await PATCH(makeReq({ body: { tags: ['net', 3, 'order'] } }), ctx(OID));
    expect(lastSet().tags).toEqual(['net', '3', 'order']);
  });

  it('replaces steps as a full array, trimming text and dropping empty-text entries', async () => {
    updateState.doc = { _id: OID, title: 't' };
    await PATCH(
      makeReq({ body: { steps: [{ text: '  buy  ', done: 1 }, { text: '', done: false }, { text: 'wire', done: false }] } }),
      ctx(OID),
    );
    expect(lastSet().steps).toEqual([
      { text: 'buy', done: true },
      { text: 'wire', done: false },
    ]);
  });

  it("clears dueDate when the key is present with a falsy value (key-presence semantics)", async () => {
    updateState.doc = { _id: OID, title: 't' };
    await PATCH(makeReq({ body: { dueDate: null } }), ctx(OID));
    expect('dueDate' in lastSet()).toBe(true);
    expect(lastSet().dueDate).toBeNull();
  });

  it('parses a dueDate string into a Date', async () => {
    updateState.doc = { _id: OID, title: 't' };
    await PATCH(makeReq({ body: { dueDate: '2026-09-01' } }), ctx(OID));
    expect(lastSet().dueDate).toBeInstanceOf(Date);
    expect((lastSet().dueDate as Date).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('serializes the updated task (id-mapped steps, ISO dates, defaults)', async () => {
    updateState.doc = {
      _id: OID,
      title: 'Done thing',
      status: 'done',
      priority: 'high',
      tags: ['a'],
      steps: [{ _id: 's1', text: 'x', done: true }],
      dueDate: new Date('2026-09-01T00:00:00Z'),
      completedAt: new Date('2026-07-03T10:00:00Z'),
      updatedAt: new Date('2026-07-03T10:00:00Z'),
    };
    const res = await PATCH(makeReq({ body: { status: 'done' } }), ctx(OID));
    const json = (await res.json()) as { task: Record<string, unknown> };
    expect(json.task).toMatchObject({
      id: OID,
      title: 'Done thing',
      status: 'done',
      priority: 'high',
      tags: ['a'],
      steps: [{ id: 's1', text: 'x', done: true }],
      dueDate: '2026-09-01T00:00:00.000Z',
      completedAt: '2026-07-03T10:00:00.000Z',
    });
  });

  it('404s when the task does not exist', async () => {
    updateState.doc = null; // findByIdAndUpdate resolved to nothing
    const res = await PATCH(makeReq({ body: { title: 'x' } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});

describe('DELETE (soft-delete)', () => {
  it('sets deletedAt via findByIdAndUpdate (never a hard delete) and returns { ok, id }', async () => {
    updateState.doc = { _id: OID, title: 'gone', deletedAt: new Date() };
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: OID });
    const call = updateState.calls[0];
    expect(call.id).toBe(OID);
    expect((call.update as { $set: { deletedAt: unknown } }).$set.deletedAt).toBeInstanceOf(Date);
    expect(call.opts).toEqual({ new: true });
  });

  it('404s when the task does not exist', async () => {
    updateState.doc = null;
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});
