import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Receipt } from '@/models/Receipt';
import { uploadReceipt } from '@/app/receipts/actions';
import { trimReceipt, type ReceiptLean } from '../../receipts/serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/scan/receipt  (multipart form, field "file" = receipt image/PDF)
 *  Mirrors the web receipts dropzone: saves the file, runs the AI parse, creates the
 *  receipt, and returns it (with line items). Unlike scan/product this DOES persist —
 *  a snapped receipt is worth keeping; the user can verify/fix fields later.
 *  → 201 { receipt: { …, lineItems, aiUsed, aiError } } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const form = await req.formData();
    const r = await uploadReceipt(form);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await connectDB();
    const doc = await Receipt.findById(r.id).select('-rawAiResponse').lean();
    if (!doc) return NextResponse.json({ receipt: { id: r.id, aiUsed: r.aiUsed } }, { status: 201 });
    const d = doc as ReceiptLean;
    const lines = (d.lineItems ?? []) as { name?: string; refinedName?: string; qty?: number; price?: number; vatRate?: number }[];
    return NextResponse.json(
      {
        receipt: {
          ...trimReceipt(d),
          lineItems: lines.map((l) => ({ name: l.refinedName || l.name || '', qty: l.qty ?? 1, price: l.price ?? 0, vatRate: l.vatRate ?? 0 })),
          aiUsed: r.aiUsed,
          aiError: r.aiError ?? null,
        },
      },
      { status: 201 }
    );
  });
}
