import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/items/import backs the mobile/web "paste a product URL" import flow — it
// fetches the page, AI-parses it, and either creates a new shopping/inventory Item or merges
// the price/link into an existing matching one. Thin wrapper around the proven
// `importItemFromUrl` action (items/actions.ts) — its own fetch/AI-parse/dedup-matching logic
// is NOT re-tested here. Unlike the `[id]/*` sub-routes, this one has no dynamic segment (no
// ObjectId guard) — its own guard is the `url` field shape.
//
// Route-only behaviour pinned here:
//   1. url validation runs BEFORE the action is ever called: `String(b.url || '').trim()` must
//      match `/^https?:\/\//i`, else 400 'valid http(s) url required' (covers a missing field,
//      an unparsable body, a non-http(s) scheme, and a non-string value coerced via String()),
//   2. a valid url is trimmed of surrounding whitespace before being forwarded to the action,
//   3. view resolution: `b.view === 'inventory'` picks 'inventory'; ANY other value (missing,
//      'shopping' explicit, an unrelated string, a number) falls back to 'shopping',
//   4. failure remap: an action `{ ok:false, error }` becomes 400 with the action's error
//      message verbatim (the action's error field is a required string, so there is no
//      route-level fallback text to pin here, unlike some `[id]/*` siblings),
//   5. the happy path returns exactly `{ ok:true, id, title, price, store, updated }` — nothing
//      else from the action's result leaks through.
//
// We run the REAL apiAuth/apiBody helpers and mock only the DB + action seam.

const { connectDBMock, userFindOne, userState, importItemFromUrlMock, importState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const importState: {
    calls: { url: string; view: string }[];
    result: { ok: boolean; id?: string; title?: string; price?: number; store?: string; updated?: boolean; error?: string };
  } = {
    calls: [],
    result: { ok: true, id: 'i1', title: 'Ubiquiti U7 Pro', price: 199, store: 'xpatit.gr', updated: false },
  };
  const importItemFromUrlMock = vi.fn((url: string, view: string) => {
    importState.calls.push({ url, view });
    return Promise.resolve(importState.result);
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, importItemFromUrlMock, importState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/items/actions', () => ({ importItemFromUrl: importItemFromUrlMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/items/import';

/** Minimal NextRequest stand-in. `body: 'throw'` makes json() reject, like an unparsable body. */
function makeReq(opts: { auth?: string | null; body?: unknown | 'throw' } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => {
      if (opts.body === 'throw') throw new Error('Unexpected end of JSON input');
      return opts.body === undefined ? {} : opts.body;
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  importState.calls = [];
  importState.result = { ok: true, id: 'i1', title: 'Ubiquiti U7 Pro', price: 199, store: 'xpatit.gr', updated: false };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  importItemFromUrlMock.mockImplementation((url: string, view: string) => {
    importState.calls.push({ url, view });
    return Promise.resolve(importState.result);
  });
});

describe('auth gate', () => {
  it('without a token → 401, import never runs', async () => {
    const res = await POST(makeReq({ auth: null, body: { url: 'https://example.com' } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(importItemFromUrlMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, import never runs', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ auth: 'Bearer bad', body: { url: 'https://example.com' } }));
    expect(res.status).toBe(401);
    expect(importItemFromUrlMock).not.toHaveBeenCalled();
  });
});

describe('url validation', () => {
  it('a missing url field → 400, import never runs', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'valid http(s) url required' });
    expect(importItemFromUrlMock).not.toHaveBeenCalled();
  });

  it('an unparsable body (json() throws) → 400, import never runs', async () => {
    const res = await POST(makeReq({ body: 'throw' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'valid http(s) url required' });
    expect(importItemFromUrlMock).not.toHaveBeenCalled();
  });

  it('a non-http(s) scheme (ftp://) → 400, import never runs', async () => {
    const res = await POST(makeReq({ body: { url: 'ftp://example.com/file' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'valid http(s) url required' });
    expect(importItemFromUrlMock).not.toHaveBeenCalled();
  });

  it('a javascript: url → 400, import never runs', async () => {
    const res = await POST(makeReq({ body: { url: 'javascript:alert(1)' } }));
    expect(res.status).toBe(400);
    expect(importItemFromUrlMock).not.toHaveBeenCalled();
  });

  it('a non-string url (number), coerced via String(), fails the http(s) match → 400', async () => {
    const res = await POST(makeReq({ body: { url: 12345 } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'valid http(s) url required' });
    expect(importItemFromUrlMock).not.toHaveBeenCalled();
  });

  it('a valid url with surrounding whitespace is trimmed before being forwarded', async () => {
    const res = await POST(makeReq({ body: { url: '  https://xpatit.gr/product/u7-pro  ' } }));
    expect(res.status).toBe(200);
    expect(importState.calls[0].url).toBe('https://xpatit.gr/product/u7-pro');
  });

  it('an uppercase HTTPS:// scheme is accepted (case-insensitive match)', async () => {
    const res = await POST(makeReq({ body: { url: 'HTTPS://xpatit.gr/product/u7-pro' } }));
    expect(res.status).toBe(200);
    expect(importItemFromUrlMock).toHaveBeenCalled();
  });
});

describe('view resolution', () => {
  it('a missing view field defaults to "shopping"', async () => {
    await POST(makeReq({ body: { url: 'https://example.com/p' } }));
    expect(importState.calls[0].view).toBe('shopping');
  });

  it('view "inventory" is forwarded as-is', async () => {
    await POST(makeReq({ body: { url: 'https://example.com/p', view: 'inventory' } }));
    expect(importState.calls[0].view).toBe('inventory');
  });

  it('view "shopping" explicit is forwarded as-is', async () => {
    await POST(makeReq({ body: { url: 'https://example.com/p', view: 'shopping' } }));
    expect(importState.calls[0].view).toBe('shopping');
  });

  it('an unrelated string view falls back to "shopping"', async () => {
    await POST(makeReq({ body: { url: 'https://example.com/p', view: 'equipment' } }));
    expect(importState.calls[0].view).toBe('shopping');
  });

  it('a non-string view (number) falls back to "shopping"', async () => {
    await POST(makeReq({ body: { url: 'https://example.com/p', view: 1 } }));
    expect(importState.calls[0].view).toBe('shopping');
  });
});

describe('happy path', () => {
  it('returns exactly { ok, id, title, price, store, updated } for a new item', async () => {
    importState.result = { ok: true, id: 'i9', title: 'Fenvi AQC113', price: 64, store: 'AliExpress', updated: false };
    const res = await POST(makeReq({ body: { url: 'https://aliexpress.com/item/1' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'i9', title: 'Fenvi AQC113', price: 64, store: 'AliExpress', updated: false });
  });

  it('returns updated:true when the action merged into an existing item', async () => {
    importState.result = { ok: true, id: 'i2', title: 'U7 Pro XGS', price: 284, store: 'EU Store', updated: true };
    const res = await POST(makeReq({ body: { url: 'https://eu.store.ui.com/p/u7-pro-xgs' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'i2', title: 'U7 Pro XGS', price: 284, store: 'EU Store', updated: true });
  });
});

describe('failure remap', () => {
  it('an action { ok:false, error } becomes 400 with the action error message verbatim', async () => {
    importState.result = { ok: false, error: 'Page failed to load: fetch failed' };
    const res = await POST(makeReq({ body: { url: 'https://dead-site.example/p' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Page failed to load: fetch failed' });
  });

  it('a different action error message is also forwarded verbatim', async () => {
    importState.result = { ok: false, error: 'Product import (AI) is turned off.' };
    const res = await POST(makeReq({ body: { url: 'https://example.com/p' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Product import (AI) is turned off.' });
  });
});
