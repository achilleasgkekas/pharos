import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Receipt } from '@/models/Receipt';
import { trimReceipt, type ReceiptLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
