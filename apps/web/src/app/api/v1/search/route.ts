import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { searchAll } from '@/app/search-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/search?q=… → { hits: [{ type, id, title, subtitle }] } across all data. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const q = (new URL(req.url).searchParams.get('q') || '').trim();
    const hits = q.length >= 2 ? await searchAll(q) : [];
    return NextResponse.json({ hits: hits.map((h) => ({ type: h.type, id: h.id, title: h.title, subtitle: h.subtitle })) });
  });
}
