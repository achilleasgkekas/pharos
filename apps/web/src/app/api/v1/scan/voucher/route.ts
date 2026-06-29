import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { scanVoucherText, scanVoucherImage } from '@/app/vouchers/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/scan/voucher
 *  - JSON { text } → parse pasted coupon text, or
 *  - multipart (field "file") → OCR/vision a coupon photo
 *  → { data: { title, code, store, discount, expiresAt, url, notes } }. Needs the 'vouchers' AI feature. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const ct = req.headers.get('content-type') || '';
    const r = ct.includes('multipart/form-data')
      ? await scanVoucherImage(await req.formData())
      : await scanVoucherText(String(((await req.json().catch(() => ({}))) as { text?: unknown }).text || ''));
    if (!r.ok) return apiError(r.error, 400);
    return NextResponse.json({ data: r.data });
  });
}
