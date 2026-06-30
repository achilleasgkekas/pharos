import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { readBody, strField, numField, enumField, boolField } from '@/lib/apiBody';
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
    const b = await readBody(req);
    const vendor = strField(b, 'vendor', '', true);
    const amount = numField(b, 'amount');
    if (!vendor) return apiError('vendor required');
    if (amount === null) return apiError('amount must be a number');
    const date = b.date ? new Date(String(b.date)) : new Date();
    if (Number.isNaN(date.getTime())) return apiError('invalid date');
    await connectDB();
    const doc = await Expense.create({
      kind: enumField(b, 'kind', ['income', 'expense'], 'expense'),
      vendor,
      vendorKey: vendorKey(vendor),
      category: strField(b, 'category', 'other'),
      amount,
      date,
      period: strField(b, 'period'),
      recurring: boolField(b, 'recurring'),
      recurringCycle: enumField(b, 'recurringCycle', ['monthly', 'quarterly', 'yearly', 'weekly'], ''),
      paymentMethod: strField(b, 'paymentMethod'),
      notes: strField(b, 'notes'),
      verified: true, // manually entered → trusted
    });
    return NextResponse.json({ expense: trim(doc.toObject() as ExpenseLean) }, { status: 201 });
  });
}
