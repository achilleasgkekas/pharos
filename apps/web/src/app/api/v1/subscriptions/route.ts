import { NextRequest, NextResponse } from 'next/server';
import { BILLING_CYCLES } from '@/lib/billingCycle';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope } from '@/lib/apiList';
import { readBody, strField, numField, enumField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx, convertToBase } from '@/lib/fx';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Expense as ExpenseModel } from '@/models/Expense';
import { currentModel } from '@/lib/tenancy/connection';
import { vendorKey } from '@/app/expenses/lib';
import { discoverRecurringCandidates, type RecurringCandidate } from '@/lib/recurringDiscovery';
import { trim, type SubLean } from './serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES: readonly string[] = BILLING_CYCLES;

/**
 * Deterministic auto-discovery of untracked recurring charges (P7), mirrors the
 * web `discoverUntrackedRecurring()` server action (apps/web/src/app/subscriptions/actions.ts).
 * Zero AI: groups priced Expense rows by vendorKey, excludes vendors already tracked
 * by an existing Subscription (by name or provider), flags regular-cadence series.
 */
async function discoverSuggestions(): Promise<RecurringCandidate[]> {
  // Called from inside withAuth, so the ambient workspace is already established.
  const [Expense, Subscription] = await Promise.all([
    currentModel(ExpenseModel),
    currentModel(SubscriptionModel),
  ]);
  const [expenses, subs] = await Promise.all([
    Expense.find({ kind: 'expense', amount: { $gt: 0 } })
      .select('vendor vendorKey amount date category kind')
      .lean(),
    Subscription.find().select('name provider').lean(),
  ]);
  const excludeVendorKeys = new Set<string>();
  for (const s of subs) {
    const nk = vendorKey(s.name || '');
    if (nk) excludeVendorKeys.add(nk);
    const pk = vendorKey(s.provider || '');
    if (pk) excludeVendorKeys.add(pk);
  }
  return discoverRecurringCandidates(expenses, { excludeVendorKeys });
}

/** GET /api/v1/subscriptions?active=1&limit&offset&updatedSince */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    const p = listParams(req);
    const base: Record<string, unknown> = {};
    if (p.sp.get('active') === '1') base.active = true;
    const filter = withSince(base, p);
    const find = Subscription.find(filter).sort({ nextRenewal: 1 }).skip(p.offset).limit(p.limit);
    const count = Subscription.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    // Suggestions are skipped on incremental (updatedSince) polls: they are not a
    // updatedAt-tracked resource, and re-including them on every delta poll would
    // just repeat the same discovery work for no benefit.
    const [docs, total, suggestions] = await Promise.all([
      find.lean() as Promise<SubLean[]>,
      count,
      p.updatedSince ? Promise.resolve([]) : discoverSuggestions(),
    ]);
    return NextResponse.json({ ...listEnvelope(docs.map(trim), total, p), suggestions });
  });
}

/** POST /api/v1/subscriptions  { name, amount, billingCycle?, startDate?, nextRenewal?, category?, provider?, url?, trialEndsAt?, firstChargeAmount?, currency?, fxRate? }
 *  P9: `amount`/`firstChargeAmount` are read as PRINTED figures; when `currency` differs from the
 *  deployment's base one they are converted with `fxRate` before storage, so what lands in the DB
 *  is always base currency. Omitting both keeps the previous single-currency behaviour exactly. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const name = strField(b, 'name', '', true);
    const amount = numField(b, 'amount');
    if (!name) return apiError('name required');
    if (amount === null) return apiError('amount must be a number');
    const startDate = b.startDate ? new Date(String(b.startDate)) : new Date();
    if (Number.isNaN(startDate.getTime())) return apiError('invalid startDate');
    let trialEndsAt: Date | null = null;
    if (b.trialEndsAt) {
      const d = new Date(String(b.trialEndsAt));
      if (Number.isNaN(d.getTime())) return apiError('invalid trialEndsAt');
      trialEndsAt = d;
    }
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    const fx = resolveFx(
      { amount, currency: strField(b, 'currency'), fxRate: numField(b, 'fxRate') ?? 0 },
      (await getAppSettings()).currency
    );
    const printedFirstCharge = numField(b, 'firstChargeAmount') ?? 0;
    const doc = await Subscription.create({
      name,
      provider: strField(b, 'provider'),
      category: strField(b, 'category', 'other'),
      amount: fx.amount,
      currency: fx.currency,
      origAmount: fx.origAmount,
      fxRate: fx.fxRate,
      billingCycle: enumField(b, 'billingCycle', CYCLES, 'monthly'),
      startDate,
      nextRenewal: b.nextRenewal ? new Date(String(b.nextRenewal)) : startDate,
      paymentMethod: strField(b, 'paymentMethod'),
      url: strField(b, 'url'),
      notes: strField(b, 'notes'),
      trialEndsAt,
      // Same rate as `amount` (see resolveSubFx in app/subscriptions/actions.ts for why both
      // money fields must move together); unknown rate leaves the printed number alone.
      firstChargeAmount: fx.fxRate > 0 ? convertToBase(printedFirstCharge, fx.fxRate) : printedFirstCharge,
    });
    return NextResponse.json({ subscription: trim(doc.toObject() as SubLean) }, { status: 201 });
  });
}
