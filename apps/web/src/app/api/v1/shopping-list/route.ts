import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { getListItems, addListItem } from '@/app/shopping-list/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/shopping-list → { items } */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => NextResponse.json({ items: await getListItems() }));
}

/** POST /api/v1/shopping-list  { name, quantity?, category?, brand?, note? } → { items } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, string>;
    const r = await addListItem({ name: b.name, quantity: b.quantity, category: b.category, brand: b.brand, note: b.note });
    if (!r.ok) return apiError(r.error || 'Bad request');
    return NextResponse.json({ ok: true, items: await getListItems() }, { status: 201 });
  });
}
