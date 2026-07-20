import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { readBody, strField, numField, enumField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { Expense } from '@/models/Expense';
import { vendorKey } from '@/app/expenses/lib';
import { discoverRecurringCandidates, type RecurringCandidate } from '@/lib/recurringDiscovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'];

export type SubLean = {
  _id: unknown; name: string; provider?: string; category?: string; amount?: number; currency?: string;
  billingCycle?: string; startDate?: Date; nextRenewal?: Date | null; active?: boolean; paymentMethod?: string;
  url?: string; notes?: string; trialEndsAt?: Date | null; firstChargeAmount?: number; updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Subscription JSON shape (list, POST, PATCH). */
export function trim(s: SubLean) {
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
    trialEndsAt: iso(s.trialEndsAt),
    firstChargeAmount: s.firstChargeAmount ?? 0,
    updatedAt: iso(s.updatedAt),
    deleted: !!s.deletedAt,
  };
}

/**
 * Deterministic auto-discovery of untracked recurring charges (P7), mirrors the
 * web `discoverUntrackedRecurring()` server action (apps/web/src/app/subscriptions/actions.ts).
 * Zero AI: groups priced Expense rows by vendorKey, excludes vendors already tracked
 * by an existing Subscription (by name or provider), flags regular-cadence series.
 */
async function discoverSuggestions(): Promise<RecurringCandidate[]> {
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

/** POST /api/v1/subscriptions  { name, amount, billingCycle?, startDate?, nextRenewal?, category?, provider?, url?, trialEndsAt?, firstChargeAmount? } */
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
    const doc = await Subscription.create({
      name,
      provider: strField(b, 'provider'),
      category: strField(b, 'category', 'other'),
      amount,
      billingCycle: enumField(b, 'billingCycle', CYCLES, 'monthly'),
      startDate,
      nextRenewal: b.nextRenewal ? new Date(String(b.nextRenewal)) : startDate,
      paymentMethod: strField(b, 'paymentMethod'),
      url: strField(b, 'url'),
      notes: strField(b, 'notes'),
      trialEndsAt,
      firstChargeAmount: numField(b, 'firstChargeAmount') ?? 0,
    });
    return NextResponse.json({ subscription: trim(doc.toObject() as SubLean) }, { status: 201 });
  });
}
