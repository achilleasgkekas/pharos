import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'];

type SubLean = {
  _id: unknown; name: string; provider?: string; category?: string; amount?: number; currency?: string;
  billingCycle?: string; startDate?: Date; nextRenewal?: Date | null; active?: boolean; paymentMethod?: string;
  url?: string; notes?: string; updatedAt?: Date; deletedAt?: Date | null;
};

function trim(s: SubLean) {
  return {
    id: String(s._id),
    name: s.name,
    provider: s.provider ?? '',
    category: s.category ?? 'other',
    amount: s.amount ?? 0,
    currency: s.currency ?? 'EUR',
    billingCycle: s.billingCycle ?? 'monthly',
    startDate: iso(s.startDate),
    nextRenewal: iso(s.nextRenewal),
    active: s.active !== false,
    paymentMethod: s.paymentMethod ?? '',
    url: s.url ?? '',
    notes: s.notes ?? '',
    updatedAt: iso(s.updatedAt),
    deleted: !!s.deletedAt,
  };
}

/** GET /api/v1/subscriptions?active=1&limit&offset&updatedSince */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('active') === '1') base.active = true;
    const filter = withSince(base, p);
    const find = Subscription.find(filter).sort({ nextRenewal: 1 }).skip(p.offset).limit(p.limit);
    const count = Subscription.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<SubLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/subscriptions  { name, amount, billingCycle?, startDate?, nextRenewal?, category?, provider?, url? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(b.name || '').trim();
    const amount = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount));
    if (!name) return apiError('name required');
    if (!Number.isFinite(amount)) return apiError('amount must be a number');
    const startDate = b.startDate ? new Date(String(b.startDate)) : new Date();
    if (Number.isNaN(startDate.getTime())) return apiError('invalid startDate');
    await connectDB();
    const doc = await Subscription.create({
      name,
      provider: String(b.provider || ''),
      category: String(b.category || 'other'),
      amount,
      billingCycle: CYCLES.includes(String(b.billingCycle)) ? String(b.billingCycle) : 'monthly',
      startDate,
      nextRenewal: b.nextRenewal ? new Date(String(b.nextRenewal)) : startDate,
      paymentMethod: String(b.paymentMethod || ''),
      url: String(b.url || ''),
      notes: String(b.notes || ''),
    });
    return NextResponse.json({ subscription: trim(doc.toObject() as SubLean) }, { status: 201 });
  });
}
