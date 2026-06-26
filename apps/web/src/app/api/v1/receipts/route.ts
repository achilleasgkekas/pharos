import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Receipt } from '@/models/Receipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReceiptLean = {
  _id: unknown; store: string; date?: Date; total?: number; subtotal?: number; vatAmount?: number;
  currency?: string; paymentMethod?: string; warrantyMonths?: number; verified?: boolean; archived?: boolean;
  lineItems?: unknown[]; filePath?: string; thumbPath?: string; updatedAt?: Date; deletedAt?: Date | null;
};

export function trimReceipt(r: ReceiptLean) {
  return {
    id: String(r._id),
    store: r.store,
    date: iso(r.date),
    total: r.total ?? 0,
    subtotal: r.subtotal ?? 0,
    vatAmount: r.vatAmount ?? 0,
    currency: r.currency ?? 'EUR',
    paymentMethod: r.paymentMethod ?? '',
    warrantyMonths: r.warrantyMonths ?? 0,
    itemCount: r.lineItems?.length ?? 0,
    verified: !!r.verified,
    archived: !!r.archived,
    file: r.filePath || null, // fetch via GET /api/files/<file> with the same Bearer token
    thumb: r.thumbPath || null,
    updatedAt: iso(r.updatedAt),
    deleted: !!r.deletedAt,
  };
}

/** GET /api/v1/receipts?store&archived=1&limit&offset&updatedSince */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    const store = p.sp.get('store');
    if (store) base.store = store;
    if (p.sp.get('archived') !== '1') base.archived = { $ne: true };
    const filter = withSince(base, p);
    const find = Receipt.find(filter).select('-rawAiResponse').sort({ date: -1 }).skip(p.offset).limit(p.limit);
    const count = Receipt.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<ReceiptLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trimReceipt), total, p));
  });
}
