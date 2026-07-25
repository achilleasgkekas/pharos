import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Statement } from '@/models/Statement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StatementLean = {
  _id: unknown; card: string; last4?: string; period: string; statementDate?: Date; dueDate?: Date | null;
  totalAmount?: number; minimumPayment?: number; paidAmount?: number; currency?: string; transactions?: unknown[];
  origAmount?: number; fxRate?: number;
  updatedAt?: Date; deletedAt?: Date | null;
};
function trim(s: StatementLean) {
  return {
    id: String(s._id), card: s.card, last4: s.last4 ?? '', period: s.period,
    statementDate: iso(s.statementDate), dueDate: iso(s.dueDate),
    // P9: every amount here is base currency; `currency`/`origAmount`/`fxRate` describe
    // what the statement printed (rate 0 = not foreign, or no rate entered yet).
    totalAmount: s.totalAmount ?? 0, minimumPayment: s.minimumPayment ?? 0, paidAmount: s.paidAmount ?? 0,
    currency: s.currency ?? 'EUR', origAmount: s.origAmount ?? 0, fxRate: s.fxRate ?? 0,
    txnCount: s.transactions?.length ?? 0,
    updatedAt: iso(s.updatedAt), deleted: !!s.deletedAt,
  };
}

/** GET /api/v1/statements?card=&limit&offset&updatedSince — newest period first. */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const p = listParams(req);
    const card = p.sp.get('card');
    const filter = withSince(card ? { card } : {}, p);
    const find = Statement.find(filter).sort({ period: -1 }).skip(p.offset).limit(p.limit);
    const count = Statement.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<StatementLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}
