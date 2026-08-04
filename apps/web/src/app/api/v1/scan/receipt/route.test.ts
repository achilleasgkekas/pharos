import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/scan/receipt is the endpoint the Expo mobile app (and the web receipts dropzone)
// hits to snap a receipt photo/PDF, run the AI parse, and PERSIST it as a draft the user can later
// verify/fix. Unlike scan/product & scan/voucher this route SAVES: it delegates to uploadReceipt,
// then reads the fresh doc back and serializes it. Several route-only behaviours live NOWHERE else
// and a drift silently breaks mobile receipt capture:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any upload),
//   - multipart-only intake: it always calls uploadReceipt(await req.formData()),
//   - the uploadReceipt not-ok passthrough → apiError(error || 'Bad request') i.e. 400 { error },
//   - the read-back: connectDB → Receipt.findById(id).select('-rawAiResponse').lean(),
//   - the `!doc` 201-fallback envelope { receipt: { id, aiUsed } } when the read-back misses,
//   - the happy 201 envelope: { receipt: { ...trimReceipt(d), lineItems, aiUsed, aiError: r.aiError ?? null } }.
// We exercise the REAL apiAuth helpers (withAuth + apiError) and the REAL serialize helpers
// (trimReceipt + serializeLineItems), mocking only the DB seam (@/lib/db + @/models/User for auth,
// @/models/Receipt for the read-back) and the uploadReceipt action.

type UploadResult =
  | { ok: true; id: string; aiUsed: boolean; aiError?: string }
  | { ok: false; error: string };

const { connectDBMock, userState, userFindOne, receiptFindById, receiptState, uploadReceipt } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const receiptState: { doc: unknown } = { doc: null };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const receiptFindById = vi.fn((_id?: unknown) => ({ select: (_p?: unknown) => ({ lean: async () => receiptState.doc }) }));
  const uploadReceipt = vi.fn<(form: FormData) => Promise<UploadResult>>(async () => ({ ok: true, id: 'r1', aiUsed: true }));
  return { connectDBMock: vi.fn(async () => {}), userState, userFindOne, receiptFindById, receiptState, uploadReceipt };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { findById: receiptFindById } }));
vi.mock('@/app/receipts/actions', () => ({ uploadReceipt }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/scan/receipt';

/** Minimal NextRequest stand-in — the route only reads headers.get('authorization') (via withAuth)
 *  and formData() (the multipart intake). No JSON branch on this route. */
function makeReq(opts: { auth?: string | null; form?: FormData } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    formData: async () => opts.form ?? new FormData(),
  } as unknown as NextRequest;
}

/** A representative stored (lean) receipt doc for the read-back. */
function leanReceipt(over: Record<string, unknown> = {}) {
  return {
    _id: 'r1',
    store: 'Πλαίσιο',
    date: new Date('2026-02-20T00:00:00Z'),
    total: 193.39,
    subtotal: 155.96,
    vatAmount: 37.43,
    currency: 'EUR',
    paymentMethod: 'Mastercard',
    warrantyMonths: 24,
    verified: false,
    archived: false,
    filePath: 'receipts/2026/02/x.pdf',
    thumbPath: 'receipts/2026/02/x.jpg',
    updatedAt: new Date('2026-02-21T00:00:00Z'),
    deletedAt: null,
    lineItems: [
      { name: 'RAW', refinedName: 'Lenovo Tab M9', qty: 1, price: 155.96, vatRate: 24 },
      { name: 'Case', qty: 2, price: 8, vatRate: 24 },
    ],
    ...over,
  };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  receiptState.doc = null;
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  receiptFindById.mockImplementation((_id?: unknown) => ({ select: (_p?: unknown) => ({ lean: async () => receiptState.doc }) }));
  uploadReceipt.mockImplementation(async () => ({ ok: true, id: 'r1', aiUsed: true }));
});

describe('auth gate', () => {
  it('no token → 401, never uploads or reads back', async () => {
    const res = await POST(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(uploadReceipt).not.toHaveBeenCalled();
    expect(receiptFindById).not.toHaveBeenCalled();
  });

  it('unknown token → 401, never uploads', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(uploadReceipt).not.toHaveBeenCalled();
  });
});

describe('multipart intake', () => {
  it('passes the parsed formData straight to uploadReceipt', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'receipt.pdf', { type: 'application/pdf' }));
    receiptState.doc = leanReceipt();
    await POST(makeReq({ form }));
    expect(uploadReceipt).toHaveBeenCalledOnce();
    expect(uploadReceipt.mock.calls[0][0]).toBe(form);
  });
});

describe('uploadReceipt failure passthrough', () => {
  it('not-ok → 400 { error } with the action message, no read-back', async () => {
    uploadReceipt.mockResolvedValueOnce({ ok: false, error: 'File too large (max 15MB)' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'File too large (max 15MB)' });
    expect(receiptFindById).not.toHaveBeenCalled();
  });

  it('not-ok with empty error → 400 { error: "Bad request" } fallback', async () => {
    uploadReceipt.mockResolvedValueOnce({ ok: false, error: '' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Bad request' });
  });
});

describe('read-back 201-fallback', () => {
  it('upload ok but doc gone → 201 { receipt: { id, aiUsed } } minimal shape', async () => {
    uploadReceipt.mockResolvedValueOnce({ ok: true, id: 'r99', aiUsed: false });
    receiptState.doc = null; // findById misses
    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ receipt: { id: 'r99', aiUsed: false } });
    expect(receiptFindById).toHaveBeenCalledWith('r99');
  });
});

describe('happy 201 envelope', () => {
  it('returns the serialized receipt with lineItems, aiUsed and aiError', async () => {
    uploadReceipt.mockResolvedValueOnce({ ok: true, id: 'r1', aiUsed: true });
    receiptState.doc = leanReceipt();
    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    // trimReceipt-derived headline fields
    expect(body.receipt.id).toBe('r1');
    expect(body.receipt.store).toBe('Πλαίσιο');
    expect(body.receipt.total).toBe(193.39);
    expect(body.receipt.itemCount).toBe(2);
    expect(body.receipt.date).toBe('2026-02-20T00:00:00.000Z'); // iso() = full ISO timestamp
    expect(body.receipt.file).toBe('receipts/2026/02/x.pdf');
    // serializeLineItems: refinedName wins over name; defaults applied
    expect(body.receipt.lineItems).toEqual([
      { name: 'Lenovo Tab M9', qty: 1, price: 155.96, vatRate: 24 },
      { name: 'Case', qty: 2, price: 8, vatRate: 24 },
    ]);
    // upload-provided flags
    expect(body.receipt.aiUsed).toBe(true);
    expect(body.receipt.aiError).toBeNull(); // r.aiError undefined → ?? null
  });

  it('surfaces uploadReceipt.aiError verbatim when the parse degraded', async () => {
    uploadReceipt.mockResolvedValueOnce({
      ok: true,
      id: 'r1',
      aiUsed: false,
      aiError: 'AI is off — saved as a draft to fill in manually.',
    });
    receiptState.doc = leanReceipt({ lineItems: [] });
    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.receipt.aiUsed).toBe(false);
    expect(body.receipt.aiError).toBe('AI is off — saved as a draft to fill in manually.');
    expect(body.receipt.itemCount).toBe(0);
    expect(body.receipt.lineItems).toEqual([]);
  });
});
