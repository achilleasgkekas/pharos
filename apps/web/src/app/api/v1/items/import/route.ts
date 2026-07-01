import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { importItemFromUrl } from '@/app/items/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/items/import  { url, view? }
 *  Fetch a product page, AI-parse it, and add (or merge into an existing) item.
 *  view = 'shopping' (default, status researching) | 'inventory' (status received).
 *  → { ok, id, title, price, store, updated }. Needs the 'itemsImport' AI feature. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const url = String(b.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return apiError('valid http(s) url required');
    const view = b.view === 'inventory' ? 'inventory' : 'shopping';
    const r = await importItemFromUrl(url, view);
    if (!r.ok) return apiError(r.error, 400);
    return NextResponse.json({ ok: true, id: r.id, title: r.title, price: r.price, store: r.store, updated: r.updated });
  });
}
