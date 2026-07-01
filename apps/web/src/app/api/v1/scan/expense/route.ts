import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { scanExpenseText, scanExpenseImage } from '@/app/expenses/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/scan/expense
 *  - JSON { text } → parse pasted bill/payslip text, or
 *  - multipart (field "file") → OCR/vision a bill/payslip photo or PDF
 *  → { data: { kind, vendor, category, amount, currency, date, period, paymentMethod, recurringCycle } }.
 *  Does NOT persist — the client prefills an expense form and POSTs to /api/v1/expenses to save.
 *  Needs the 'expenses' AI feature. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const ct = req.headers.get('content-type') || '';
    const r = ct.includes('multipart/form-data')
      ? await scanExpenseImage(await req.formData())
      : await scanExpenseText(String((await readBody(req)).text || ''));
    if (!r.ok) return apiError(r.error, 400);
    return NextResponse.json({ data: r.data });
  });
}
