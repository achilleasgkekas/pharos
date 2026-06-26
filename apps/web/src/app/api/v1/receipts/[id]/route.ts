import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Receipt } from '@/models/Receipt';
import { trimReceipt } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LineLean = { name?: string; refinedName?: string; qty?: number; price?: number; vatRate?: number };

/** GET /api/v1/receipts/:id → the receipt plus its line items. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
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
    });
  });
}
