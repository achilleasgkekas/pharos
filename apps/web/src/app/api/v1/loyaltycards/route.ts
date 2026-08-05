import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { readBody, strField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { LoyaltyCard as LoyaltyCardModel } from '@/models/LoyaltyCard';
import { currentModel } from '@/lib/tenancy/connection';
import { resolveBarcodeFormat } from '@/lib/loyaltyCard';
import { trim, type LoyaltyCardLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/loyaltycards?archived=1&limit&offset&updatedSince
 *  Default excludes archived cards (mirrors the web LoyaltyCardsClient default view). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('archived') !== '1') base.archived = { $ne: true };
    const filter = withSince(base, p);
    const find = LoyaltyCard.find(filter).sort({ archived: 1, title: 1 }).skip(p.offset).limit(p.limit);
    const count = LoyaltyCard.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<LoyaltyCardLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/loyaltycards  { title, cardNumber, store?, barcodeFormat?, notes? }
 *  barcodeFormat falls back to a shape-based guess from cardNumber when missing/unsupported
 *  (mirrors the web createLoyaltyCard action → lib/loyaltyCard.ts resolveBarcodeFormat). */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const title = strField(b, 'title', '', true);
    if (!title) return apiError('title required');
    const cardNumber = strField(b, 'cardNumber', '', true);
    if (!cardNumber) return apiError('cardNumber required');
    await connectDB();
    const LoyaltyCard = await currentModel(LoyaltyCardModel);
    const doc = await LoyaltyCard.create({
      title,
      cardNumber,
      store: strField(b, 'store', '', true),
      barcodeFormat: resolveBarcodeFormat(strField(b, 'barcodeFormat', '', true), cardNumber),
      notes: strField(b, 'notes', '', true),
      archived: false,
    });
    return NextResponse.json({ loyaltyCard: trim(doc.toObject() as LoyaltyCardLean) }, { status: 201 });
  });
}
