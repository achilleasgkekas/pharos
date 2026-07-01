import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { isObjectId } from '@/lib/apiBody';
import { logItemPrice } from '@/app/items/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/items/:id/price  { price, store? } → log an observed price.
 *  Wraps the proven web `logItemPrice` action (appends to priceHistory + updates currentPrice). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!isObjectId(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as { price?: unknown; store?: unknown };
    const price = Number(b.price);
    if (!(price > 0)) return apiError('price must be greater than 0');
    const store = typeof b.store === 'string' ? b.store : '';
    const r = await logItemPrice(id, price, store);
    if (!r.ok) return apiError(r.error || 'failed', 400);
    return NextResponse.json({ ok: true });
  });
}
