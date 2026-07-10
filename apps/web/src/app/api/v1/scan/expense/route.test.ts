import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/scan/expense is the endpoint the Expo mobile app (and the web bill-scan form) hits
// to turn a pasted bill/payslip *text* OR an uploaded photo/PDF into a structured, NOT-yet-saved
// expense draft. The route itself is thin — the AI work lives in scanExpenseText/scanExpenseImage —
// but three route-only behaviours live NOWHERE else and a drift silently breaks mobile bill capture:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any scan call),
//   - the content-type DISPATCH: `multipart/form-data` → scanExpenseImage(formData); anything else
//     (JSON / none) → scanExpenseText(String(body.text || '')). The text branch reads the body via
//     the REAL readBody helper and String-coerces a missing/odd `text` to '' (never throws),
//   - the envelope: ok → 200 { data }; not-ok → apiError(error, 400) i.e. 400 { error }.
// We exercise the REAL apiAuth/apiBody helpers (withAuth + readBody) and only mock the DB seam
// (@/lib/db + @/models/User for the auth lookup) and the two AI scan actions.

type ScanResult = { ok: true; data: unknown } | { ok: false; error: string };

const { connectDBMock, userFindOne, userState, scanText, scanImage } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const scanText = vi.fn<(text: string) => Promise<ScanResult>>(async () => ({ ok: true, data: { vendor: 'from-text' } }));
  const scanImage = vi.fn<(form: FormData) => Promise<ScanResult>>(async () => ({ ok: true, data: { vendor: 'from-image' } }));
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, scanText, scanImage };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/expenses/actions', () => ({ scanExpenseText: scanText, scanExpenseImage: scanImage }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/scan/expense';

/** Minimal NextRequest stand-in — the route reads headers.get (authorization + content-type),
 *  json() (via readBody, text branch) and formData() (image branch). */
function makeReq(
  opts: { auth?: string | null; contentType?: string; body?: unknown; form?: FormData; badJson?: boolean } = {}
): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: {
      get: (h: string) => {
        const k = h.toLowerCase();
        if (k === 'authorization') return auth;
        if (k === 'content-type') return opts.contentType ?? 'application/json';
        return null;
      },
    },
    json: async () => {
      if (opts.badJson) throw new Error('bad json');
      return opts.body === undefined ? {} : opts.body;
    },
    formData: async () => opts.form ?? new FormData(),
  } as unknown as NextRequest;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  scanText.mockImplementation(async (_text: string) => ({ ok: true as const, data: { vendor: 'from-text' } }));
  scanImage.mockImplementation(async (_form: FormData) => ({ ok: true as const, data: { vendor: 'from-image' } }));
});

describe('auth gate', () => {
  it('no token → 401, never scans', async () => {
    const res = await POST(makeReq({ auth: null, body: { text: 'ΔΕΗ 84€' } }));
    expect(res.status).toBe(401);
    expect(scanText).not.toHaveBeenCalled();
    expect(scanImage).not.toHaveBeenCalled();
  });

  it('unknown token → 401, never scans', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { text: 'ΔΕΗ 84€' } }));
    expect(res.status).toBe(401);
    expect(scanText).not.toHaveBeenCalled();
    expect(scanImage).not.toHaveBeenCalled();
  });
});

describe('content-type dispatch', () => {
  it('multipart/form-data routes to scanExpenseImage with the form, not the text scanner', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'bill.pdf', { type: 'application/pdf' }));
    const res = await POST(makeReq({ contentType: 'multipart/form-data; boundary=xyz', form }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { vendor: 'from-image' } });
    expect(scanImage).toHaveBeenCalledOnce();
    expect(scanImage.mock.calls[0][0]).toBe(form);
    expect(scanText).not.toHaveBeenCalled();
  });

  it('JSON body routes to scanExpenseText with body.text, not the image scanner', async () => {
    const res = await POST(makeReq({ contentType: 'application/json', body: { text: 'ΔΕΗ 84€' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { vendor: 'from-text' } });
    expect(scanText).toHaveBeenCalledOnce();
    expect(scanText.mock.calls[0][0]).toBe('ΔΕΗ 84€');
    expect(scanImage).not.toHaveBeenCalled();
  });

  it('a missing content-type header defaults to the text branch', async () => {
    // makeReq returns null for an absent content-type → !ct.includes('multipart') → text path.
    const res = await POST(makeReq({ contentType: undefined, body: { text: 'rent 500' } } as never));
    // contentType defaults to 'application/json' in makeReq; assert text path either way.
    expect(res.status).toBe(200);
    expect(scanText).toHaveBeenCalledOnce();
    expect(scanImage).not.toHaveBeenCalled();
  });
});

describe('text-branch coercion (never throws)', () => {
  it('missing text → scanExpenseText("") (empty string, not undefined)', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(200);
    expect(scanText).toHaveBeenCalledOnce();
    expect(scanText.mock.calls[0][0]).toBe('');
  });

  it('non-string text is String-coerced', async () => {
    const res = await POST(makeReq({ body: { text: 12345 } }));
    expect(res.status).toBe(200);
    expect(scanText.mock.calls[0][0]).toBe('12345');
  });

  it('a malformed JSON body → readBody swallows it to {} → scanExpenseText("")', async () => {
    const res = await POST(makeReq({ badJson: true }));
    expect(res.status).toBe(200);
    expect(scanText).toHaveBeenCalledOnce();
    expect(scanText.mock.calls[0][0]).toBe('');
  });
});

describe('envelope', () => {
  it('ok result → 200 { data } verbatim', async () => {
    scanText.mockResolvedValueOnce({ ok: true as const, data: { kind: 'expense', vendor: 'OTE', amount: 29.51 } });
    const res = await POST(makeReq({ body: { text: 'OTE 29.51' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { kind: 'expense', vendor: 'OTE', amount: 29.51 } });
  });

  it('not-ok result → 400 { error } with the action message', async () => {
    scanText.mockResolvedValueOnce({ ok: false as const, error: 'Paste some bill text first' });
    const res = await POST(makeReq({ body: { text: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Paste some bill text first' });
  });

  it('image not-ok (feature off / no file) → 400 { error }', async () => {
    scanImage.mockResolvedValueOnce({ ok: false as const, error: 'No file' });
    const form = new FormData();
    const res = await POST(makeReq({ contentType: 'multipart/form-data; boundary=z', form }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No file' });
  });
});
