import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Receipt } from '@/models/Receipt';
import { trimReceipt } from '../serialize';

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

/** PATCH /api/v1/receipts/:id  { store?, date?, total?, subtotal?, vatAmount?, paymentMethod?, notes?, verified?, archived?, lineItems? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    if (typeof b.store === 'string' && b.store.trim()) set.store = b.store.trim();
    if (b.date) { const d = new Date(String(b.date)); if (!Number.isNaN(d.getTime())) set.date = d; }
    for (const k of ['total', 'subtotal', 'vatAmount'] as const) {
      if (b[k] != null && Number.isFinite(Number(b[k]))) set[k] = Number(b[k]);
    }
    if (typeof b.paymentMethod === 'string') set.paymentMethod = b.paymentMethod;
    if (typeof b.notes === 'string') set.notes = b.notes;
    if (typeof b.verified === 'boolean') set.verified = b.verified;
    if (typeof b.archived === 'boolean') set.archived = b.archived;
    if (Array.isArray(b.lineItems)) {
      // Sanitize edited line items. `price` is the stored unit NET (excl. VAT).
      // refinedName is cleared so the edited `name` wins (GET returns refinedName||name).
      type LineIn = { name?: unknown; qty?: unknown; price?: unknown; vatRate?: unknown };
      const numOr = (v: unknown, d: number, min = 0) => { const n = Number(v); return Number.isFinite(n) && n >= min ? n : d; };
      set.lineItems = (b.lineItems as LineIn[])
        .map((l) => ({ name: String(l.name ?? '').trim(), refinedName: '', qty: numOr(l.qty, 1, 0.0001), price: numOr(l.price, 0), vatRate: numOr(l.vatRate, 0) }))
        .filter((l) => l.name || l.price > 0);
    }
    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    const doc = await Receipt.findByIdAndUpdate(id, { $set: set }, { new: true }).select('-rawAiResponse').lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, receipt: trimReceipt(doc as Parameters<typeof trimReceipt>[0]) });
  });
}
