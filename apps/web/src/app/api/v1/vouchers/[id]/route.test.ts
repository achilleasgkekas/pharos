import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/DELETE /api/v1/vouchers/:id are two of the ~50 REST endpoints the mobile app drives.
// Their route-level logic lives NOWHERE else and would silently corrupt the mobile contract:
//   - the shared `isObjectId` guard (a malformed :id must 400 BEFORE any DB touch),
//   - PATCH partial-update: only whitelisted, well-typed fields land in $set; a blank
//     title is dropped, an empty changeset returns 400, `expiresAt` uses key-presence
//     ('expiresAt' in body) so an explicit null clears it,
//   - PATCH returns the SPEC shape { voucher: Voucher } (the full trimmed doc), NOT a bare
//     { ok, id } — the mobile detail re-prefills in place from the response,
//   - DELETE is a SOFT delete ($set deletedAt, recoverable from Trash), and a missing row 404s.
// We exercise the REAL apiAuth/apiBody/apiList helpers and only mock the DB seam.

const { connectDBMock, userFindOne, userState, voucherUpdate, updateState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const updateState: { doc: unknown; calls: Array<{ id: unknown; update: unknown; opts: unknown }> } = { doc: null, calls: [] };
  const voucherUpdate = vi.fn((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, voucherUpdate, updateState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { findByIdAndUpdate: voucherUpdate } }));

import { PATCH, DELETE } from './route';

const OID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const BASE = 'http://pharos.local/api/v1/vouchers';

function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function lastSet(): Record<string, unknown> {
  const call = updateState.calls[updateState.calls.length - 1];
  return (call.update as { $set: Record<string, unknown> }).$set;
}

beforeEach(() => {
  updateState.doc = null;
  updateState.calls = [];
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  voucherUpdate.mockImplementation((id: unknown, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
});

describe('auth gate', () => {
  it('PATCH without a token → 401, never touches the DB', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(voucherUpdate).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('PATCH with a malformed id → 400 before any DB touch', async () => {
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(voucherUpdate).not.toHaveBeenCalled();
  });
  it('DELETE with a malformed id → 400', async () => {
    const res = await DELETE(makeReq(), ctx('short'));
    expect(res.status).toBe(400);
    expect(voucherUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH partial-update', () => {
  it('drops a blank title and rejects an empty changeset with 400', async () => {
    const res = await PATCH(makeReq({ body: { title: '   ' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(voucherUpdate).not.toHaveBeenCalled();
  });

  it('trims string fields and sets used, then returns the SPEC { voucher } wrapper', async () => {
    updateState.doc = { _id: OID, title: 'Skroutz 15%', code: 'SUMMER15', store: 'Skroutz', discount: '15%', used: true, updatedAt: new Date('2026-07-04T00:00:00Z') };
    const res = await PATCH(makeReq({ body: { title: '  Skroutz 15%  ', code: ' SUMMER15 ', used: true } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = lastSet();
    expect(set).toMatchObject({ title: 'Skroutz 15%', code: 'SUMMER15', used: true });
    const json = (await res.json()) as { voucher: { id: string; title: string; used: boolean } };
    expect(json).toHaveProperty('voucher');
    expect(json).not.toHaveProperty('ok');
    expect(json.voucher).toMatchObject({ id: OID, title: 'Skroutz 15%', code: 'SUMMER15', used: true });
  });

  it('clears expiresAt when body sends explicit null', async () => {
    updateState.doc = { _id: OID, title: 'X' };
    await PATCH(makeReq({ body: { expiresAt: null } }), ctx(OID));
    expect(lastSet()).toMatchObject({ expiresAt: null });
  });

  it('parses a valid expiresAt into a Date', async () => {
    updateState.doc = { _id: OID, title: 'X' };
    await PATCH(makeReq({ body: { expiresAt: '2026-12-31' } }), ctx(OID));
    expect(lastSet().expiresAt).toBeInstanceOf(Date);
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(404);
  });
});

describe('DELETE soft-delete', () => {
  it('sets deletedAt (soft delete) and returns { ok, id }', async () => {
    updateState.doc = { _id: OID, title: 'X' };
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(lastSet().deletedAt).toBeInstanceOf(Date);
    expect(await res.json()).toEqual({ ok: true, id: OID });
  });

  it('404s when the row is missing', async () => {
    updateState.doc = null;
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
  });
});
