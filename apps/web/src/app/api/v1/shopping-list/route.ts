import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody, strField } from '@/lib/apiBody';
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
    const b = await readBody(req);
    const restockIntervalDays = typeof b.restockIntervalDays === 'number' ? b.restockIntervalDays : undefined;
    const r = await addListItem({ name: strField(b, 'name'), quantity: strField(b, 'quantity'), category: strField(b, 'category'), brand: strField(b, 'brand'), note: strField(b, 'note'), restockIntervalDays });
    if (!r.ok) return apiError(r.error || 'Bad request');
    return NextResponse.json({ ok: true, items: await getListItems() }, { status: 201 });
  });
}
