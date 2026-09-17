import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/share is what the iPhone Shortcut calls (#123): iOS has no Web Share Target, so the
// share sheet posts the file here with the user's API token. The route is thin, but three things
// live only here: the Bearer gate BEFORE any import, the target dispatch, and the { data } / 400
// envelope. Real withAuth; only the DB seam and the two module actions are mocked.

type ActionResult = { ok: boolean; error?: string };
const { userState, userFindOne, uploadReceipt, importStatementPdf } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  return {
    userState,
    userFindOne: vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) })),
    uploadReceipt: vi.fn<(f: FormData) => Promise<ActionResult>>(async () => ({ ok: true })),
    importStatementPdf: vi.fn<(f: FormData) => Promise<ActionResult>>(async () => ({ ok: true })),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/app/receipts/actions', () => ({ uploadReceipt }));
vi.mock('@/app/statements/actions', () => ({ importStatementPdf }));

import { POST } from './route';

function req(fields: Record<string, string | File> | null, auth = 'Bearer good-token'): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields ?? {})) form.set(k, v);
  return {
    method: 'POST',
    headers: new Headers({ authorization: auth, 'content-type': fields ? 'multipart/form-data; boundary=x' : 'application/json' }),
    formData: async () => form,
  } as unknown as NextRequest;
}
const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'bill.pdf', { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
});

describe('POST /api/v1/share — the iPhone Shortcut door (#123)', () => {
  it('refuses without a valid token and imports nothing', async () => {
    userState.doc = null;
    const res = await POST(req({ file: pdf(), target: 'receipt' }, 'Bearer nope'));
    expect(res.status).toBe(401);
    expect(uploadReceipt).not.toHaveBeenCalled();
  });

  it('sends a receipt through the normal receipt upload', async () => {
    const res = await POST(req({ file: pdf(), target: 'receipt' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { target: 'receipt', redirectTo: '/receipts' } });
    expect(uploadReceipt.mock.calls[0][0].get('file')).toBeInstanceOf(File);
    expect(importStatementPdf).not.toHaveBeenCalled();
  });

  it('sends a statement through the PDF statement import', async () => {
    const res = await POST(req({ file: pdf(), target: 'statement' }));
    expect(await res.json()).toEqual({ data: { target: 'statement', redirectTo: '/statements' } });
    expect(importStatementPdf).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown target, a missing file and a non-multipart body', async () => {
    expect((await POST(req({ file: pdf(), target: 'documents' }))).status).toBe(400);
    expect((await POST(req({ target: 'receipt' }))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
    expect(uploadReceipt).not.toHaveBeenCalled();
  });

  it('passes the module’s own error back to the Shortcut', async () => {
    importStatementPdf.mockResolvedValueOnce({ ok: false, error: 'A PDF file is required' });
    const res = await POST(req({ file: pdf(), target: 'statement' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A PDF file is required' });
  });
});
