import { NextRequest, NextResponse } from 'next/server';
import { RECURRING_CYCLES } from '@/lib/billingCycle';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { readBody, strField, numField, enumField, boolField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Expense as ExpenseModel } from '@/models/Expense';
import { currentModel } from '@/lib/tenancy/connection';
import { vendorKey } from '@/app/expenses/lib';
import { getAppSettings } from '@/lib/appSettings';
import { matchCategoryRule } from '@/lib/categoryRules';
import { resolveFx } from '@/lib/fx';
import { trimExpense, computeAnomalies, parseSplitField, type ExpenseLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/expenses?kind=income|expense&limit&offset&updatedSince */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const Expense = await currentModel(ExpenseModel);
    const p = listParams(req);
    const kind = p.sp.get('kind');
    const filter = withSince(kind === 'income' || kind === 'expense' ? { kind } : {}, p);
    const find = Expense.find(filter).sort({ date: -1 }).skip(p.offset).limit(p.limit);
    const count = Expense.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<ExpenseLean[]>, count]);
    // Anomaly ±% needs the vendor series; only meaningful on a full-list read
    // (API clients typically fetch limit=200/offset=0). Skip on incremental sync
    // (updatedSince returns a partial slice → medians would be wrong).
    const anomalies = p.updatedSince ? [] : computeAnomalies(docs);
    return NextResponse.json(listEnvelope(docs.map((d, i) => trimExpense(d, anomalies[i])), total, p));
  });
}

/** POST /api/v1/expenses  { kind?, vendor, amount, date?, category?, space?, period?, recurring?, recurringCycle?, notes?, split?, taxDeductible?, taxCategory?, currency?, fxRate? }
 *
 *  P9: `amount` is read as the PRINTED figure. When `currency` differs from the deployment's
 *  base one it is converted with `fxRate` before storage, so what lands in `amount` is always
 *  base currency (every report/budget/anomaly sum reads it directly). Omitting both keeps the
 *  previous single-currency behaviour byte-for-byte, and a foreign amount with no rate is
 *  stored as printed and flagged (fxRate 0) rather than guessed at 1:1 — same rule as the web
 *  addExpense action and the bills/subscriptions routes. */
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
    const Expense = await currentModel(ExpenseModel);
    // Vendor→category auto-rule (P15): the web actions apply this on every creation
    // path (see app/expenses/actions.ts addExpense/uploadExpense) — this route was the
    // one gap, so the same vendor got a different category depending on whether the
    // expense was entered from the web app or the API. An explicit category from the client
    // still always wins; the rule only fills in the default 'other'.
    const settings = await getAppSettings();
    const explicitCategory = strField(b, 'category', '');
    const category = explicitCategory
      ? explicitCategory
      : matchCategoryRule(settings.categoryRules, { vendor, description: strField(b, 'notes', '') })?.category || 'other';
    // P9: `amount` above is the printed figure; this is where it becomes base currency.
    const fx = resolveFx({ amount, currency: strField(b, 'currency'), fxRate: numField(b, 'fxRate') ?? 0 }, settings.currency);
    const doc = await Expense.create({
      kind: enumField(b, 'kind', ['income', 'expense'], 'expense'),
      vendor,
      vendorKey: vendorKey(vendor),
      category,
      space: strField(b, 'space').trim().slice(0, 40),
      amount: fx.amount,
      currency: fx.currency,
      origAmount: fx.origAmount,
      fxRate: fx.fxRate,
      date,
      period: strField(b, 'period'),
      recurring: boolField(b, 'recurring'),
      recurringCycle: enumField(b, 'recurringCycle', [...RECURRING_CYCLES], ''),
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
