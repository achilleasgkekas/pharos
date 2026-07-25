import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { lookupBarcode } from '@/lib/barcodeLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/lookup/barcode?code=<gtin> → { product: {...} | null, code }
 *
 *  P17's product-lookup helper: the mobile camera scans an EAN/UPC and this
 *  turns it into a prefilled suggestion the user confirms before saving. The
 *  `product` shape matches `POST /api/v1/scan/product` (name/brand/category/
 *  quantity/notes), so the same confirm-then-add screen serves both, and it
 *  drops straight into `POST /api/v1/shopping-list` or an item.
 *
 *  Nothing is saved here — a lookup is a read. `product: null` with 200 means
 *  the databases simply do not know this barcode (type it in by hand, or use
 *  the AI photo scan); 400 means the code itself is not a valid GTIN; 502 means
 *  no product database could be reached. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const code = new URL(req.url).searchParams.get('code') || '';
    if (!code.trim()) return apiError('code required');
    const r = await lookupBarcode(code);
    if (!r.ok) return apiError(r.error, /unreachable/i.test(r.error) ? 502 : 400);
    return NextResponse.json({ product: r.product, code: r.code });
  });
}
