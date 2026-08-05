import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { readBody, strField, numField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { GiftCard as GiftCardModel } from '@/models/GiftCard';
import { currentModel } from '@/lib/tenancy/connection';
import { safeDateOrNull } from '@/lib/dates';
import { trim, type GiftCardLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/giftcards?archived=1&limit&offset&updatedSince
 *  Default excludes archived cards (mirrors the web GiftCardsClient default view). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('archived') !== '1') base.archived = { $ne: true };
    const filter = withSince(base, p);
    const find = GiftCard.find(filter).sort({ archived: 1, expiresAt: 1, createdAt: -1 }).skip(p.offset).limit(p.limit);
    const count = GiftCard.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<GiftCardLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/giftcards  { title, store?, code?, initialAmount?, expiresAt?, notes? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const title = strField(b, 'title', '', true);
    if (!title) return apiError('title required');
    const initRaw = numField(b, 'initialAmount');
    await connectDB();
    const GiftCard = await currentModel(GiftCardModel);
    const doc = await GiftCard.create({
      title,
      store: strField(b, 'store', '', true),
      code: strField(b, 'code', '', true),
      initialAmount: initRaw !== null ? Math.max(0, initRaw) : 0,
      expiresAt: safeDateOrNull(strField(b, 'expiresAt', '', true)),
      notes: strField(b, 'notes', '', true),
      uses: [],
      archived: false,
    });
    return NextResponse.json({ giftCard: trim(doc.toObject() as GiftCardLean) }, { status: 201 });
  });
}
