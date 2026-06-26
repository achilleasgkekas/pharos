import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { vendorKey } from '@/app/expenses/lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExpenseLean = {
  _id: unknown; kind?: string; vendor?: string; category?: string; amount?: number; currency?: string;
  date?: Date; period?: string; recurring?: boolean; recurringCycle?: string; paymentMethod?: string;
  notes?: string; filePath?: string; thumbPath?: string; verified?: boolean; updatedAt?: Date; deletedAt?: Date | null;
};

function trim(e: ExpenseLean) {
  return {
    id: String(e._id),
    kind: e.kind ?? 'expense',
    vendor: e.vendor ?? '',
    category: e.category ?? 'other',
    amount: e.amount ?? 0,
    currency: e.currency ?? 'EUR',
    date: iso(e.date),
    period: e.period ?? '',
    recurring: !!e.recurring,
    recurringCycle: e.recurringCycle ?? '',
    paymentMethod: e.paymentMethod ?? '',
    notes: e.notes ?? '',
    file: e.filePath || null,
    thumb: e.thumbPath || null,
    verified: !!e.verified,
    updatedAt: iso(e.updatedAt),
    deleted: !!e.deletedAt,
  };
}

/** GET /api/v1/expenses?kind=income|expense&limit&offset&updatedSince */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const p = listParams(req);
    const kind = p.sp.get('kind');
    const filter = withSince(kind === 'income' || kind === 'expense' ? { kind } : {}, p);
    const find = Expense.find(filter).sort({ date: -1 }).skip(p.offset).limit(p.limit);
    const count = Expense.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<ExpenseLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/expenses  { kind?, vendor, amount, date?, category?, period?, recurring?, recurringCycle?, notes? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const vendor = String(b.vendor || '').trim();
    const amount = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount));
    if (!vendor) return apiError('vendor required');
    if (!Number.isFinite(amount)) return apiError('amount must be a number');
    const date = b.date ? new Date(String(b.date)) : new Date();
    if (Number.isNaN(date.getTime())) return apiError('invalid date');
    await connectDB();
    const doc = await Expense.create({
      kind: b.kind === 'income' ? 'income' : 'expense',
      vendor,
      vendorKey: vendorKey(vendor),
      category: String(b.category || 'other'),
      amount,
      date,
      period: String(b.period || ''),
      recurring: !!b.recurring,
      recurringCycle: ['monthly', 'quarterly', 'yearly', 'weekly'].includes(String(b.recurringCycle)) ? String(b.recurringCycle) : '',
      paymentMethod: String(b.paymentMethod || ''),
      notes: String(b.notes || ''),
      verified: true, // manually entered → trusted
    });
    return NextResponse.json({ expense: trim(doc.toObject() as ExpenseLean) }, { status: 201 });
  });
}
