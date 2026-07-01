import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { readBody, strField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Voucher } from '@/models/Voucher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VoucherLean = {
  _id: unknown; title: string; code?: string; store?: string; discount?: string;
  expiresAt?: Date | null; used?: boolean; url?: string; notes?: string; updatedAt?: Date; deletedAt?: Date | null;
};
function trim(v: VoucherLean) {
  return {
    id: String(v._id), title: v.title, code: v.code ?? '', store: v.store ?? '', discount: v.discount ?? '',
    expiresAt: iso(v.expiresAt), used: !!v.used, url: v.url ?? '', notes: v.notes ?? '',
    updatedAt: iso(v.updatedAt), deleted: !!v.deletedAt,
  };
}

/** GET /api/v1/vouchers?used=0&limit&offset&updatedSince */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('used') === '0') base.used = { $ne: true };
    const filter = withSince(base, p);
    const find = Voucher.find(filter).sort({ expiresAt: 1 }).skip(p.offset).limit(p.limit);
    const count = Voucher.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<VoucherLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/vouchers  { title, code?, store?, discount?, expiresAt?, url?, notes? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const title = strField(b, 'title', '', true);
    if (!title) return apiError('title required');
    await connectDB();
    const doc = await Voucher.create({
      title,
      code: strField(b, 'code', '', true),
      store: strField(b, 'store', '', true),
      discount: strField(b, 'discount', '', true),
      expiresAt: b.expiresAt ? new Date(String(b.expiresAt)) : null,
      url: strField(b, 'url', '', true),
      notes: strField(b, 'notes', '', true),
    });
    return NextResponse.json({ voucher: trim(doc.toObject() as VoucherLean) }, { status: 201 });
  });
}
