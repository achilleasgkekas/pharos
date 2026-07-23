import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { readBody, strField, numField, enumField, boolField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { vendorKey } from '@/app/expenses/lib';
import { getAppSettings } from '@/lib/appSettings';
import { matchCategoryRule } from '@/lib/categoryRules';
import { trimExpense, computeAnomalies, parseSplitField, type ExpenseLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    // Anomaly ±% needs the vendor series; only meaningful on a full-list read
    // (the mobile client fetches limit=200/offset=0). Skip on incremental sync
    // (updatedSince returns a partial slice → medians would be wrong).
    const anomalies = p.updatedSince ? [] : computeAnomalies(docs);
    return NextResponse.json(listEnvelope(docs.map((d, i) => trimExpense(d, anomalies[i])), total, p));
  });
}

/** POST /api/v1/expenses  { kind?, vendor, amount, date?, category?, space?, period?, recurring?, recurringCycle?, notes?, split?, taxDeductible?, taxCategory? } */
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
    // Vendor→category auto-rule (P15): the web actions apply this on every creation
    // path (see app/expenses/actions.ts addExpense/uploadExpense) — this route was the
    // one gap, so the same vendor got a different category depending on whether the
    // expense was entered from web or mobile. An explicit category from the client
    // still always wins; the rule only fills in the default 'other'.
    const explicitCategory = strField(b, 'category', '');
    const category = explicitCategory
      ? explicitCategory
      : matchCategoryRule((await getAppSettings()).categoryRules, { vendor, description: strField(b, 'notes', '') })?.category || 'other';
    const doc = await Expense.create({
      kind: enumField(b, 'kind', ['income', 'expense'], 'expense'),
      vendor,
      vendorKey: vendorKey(vendor),
      category,
      space: strField(b, 'space').trim().slice(0, 40),
      amount,
      date,
      period: strField(b, 'period'),
      recurring: boolField(b, 'recurring'),
      recurringCycle: enumField(b, 'recurringCycle', ['monthly', 'quarterly', 'yearly', 'weekly'], ''),
      paymentMethod: strField(b, 'paymentMethod'),
      notes: strField(b, 'notes'),
      split: parseSplitField(b.split),
      taxDeductible: boolField(b, 'taxDeductible'),
      taxCategory: strField(b, 'taxCategory').trim().slice(0, 60),
      verified: true, // manually entered → trusted
    });
    return NextResponse.json({ expense: trimExpense(doc.toObject() as ExpenseLean) }, { status: 201 });
  });
}
