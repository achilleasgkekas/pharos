import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Receipt } from '@/models/Receipt';
import { rescanReceipt } from '@/app/receipts/actions';
import { trimReceipt } from '../../serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LineLean = { name?: string; refinedName?: string; qty?: number; price?: number; vatRate?: number };

/**
 * POST /api/v1/receipts/:id/rescan  { ocr?: boolean }
 * Re-runs the AI parse on the receipt's stored file (mirror of the web `rescanReceipt`).
 * `ocr:true` forces the OCR path; otherwise embedded PDF text / vision model.
 * Returns the SAME shape as GET /api/v1/receipts/:id (receipt + notes + normalized
 * lineItems) so the mobile detail can re-prefill in place, plus aiUsed/model/aiError.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const useOcr = b.ocr === true;

    const result = await rescanReceipt(id, useOcr);
    if (!result.ok) {
      const msg = result.error || 'rescan failed';
      return apiError(msg, /not found|missing/i.test(msg) ? 404 : 500);
    }

    // Re-read with the exact normalization GET uses, so the mobile re-prefill matches the detail GET.
    await connectDB();
    const doc = await Receipt.findById(id).select('-rawAiResponse').lean();
    if (!doc) return apiError('not found', 404);
    const r = doc as Parameters<typeof trimReceipt>[0] & { notes?: string };
    const lines = (r.lineItems ?? []) as LineLean[];
    return NextResponse.json({
      receipt: {
        ...trimReceipt(r),
        notes: r.notes ?? '',
        lineItems: lines.map((l) => ({
          name: l.refinedName || l.name || '',
          qty: l.qty ?? 1,
          price: l.price ?? 0,
          vatRate: l.vatRate ?? 0,
        })),
      },
      aiUsed: result.aiUsed,
      model: result.model,
      aiError: result.aiError,
    });
  });
}
