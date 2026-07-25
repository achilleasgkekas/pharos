'use server';
import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { Expense } from '@/models/Expense';
import { suggestSubscription, type ParsedSubscription } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addDays, addMonths, addWeeks, addYears, isBefore } from 'date-fns';
import { vendorKey } from '@/app/expenses/lib';
import { discoverRecurringCandidates, type RecurringCandidate } from '@/lib/recurringDiscovery';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx, convertToBase, normalizeCurrency } from '@/lib/fx';

export type SuggestResult =
  | { ok: true; data: ParsedSubscription }
  | { ok: false; error: string };

/** Ask the local AI to fill in details for a known subscription by name. */
export async function suggestSubscriptionInfo(name: string): Promise<SuggestResult> {
  if (!(await isFeatureEnabled('subscriptions'))) return { ok: false, error: 'Subscription autofill (AI) is turned off.' };
  if (!name.trim()) return { ok: false, error: 'Type a name first' };
  try {
    const { parsed } = await suggestSubscription(name.trim());
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    return {
      ok: false,
      error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'Ollama is not reachable' : `AI failed: ${msg.slice(0, 100)}`,
    };
  }
}

const CATEGORIES = ['streaming', 'cloud', 'software', 'gaming', 'news', 'fitness', 'other'] as const;
const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'] as const;

const SubFormSchema = z.object({
  name: z.string().min(1, 'Name required'),
  provider: z.string().default(''),
  category: z.enum(CATEGORIES).default('other'),
  amount: z.coerce.number().min(0),
  currency: z.string().default('EUR'),
  // P9: base units per 1 unit of `currency`; 0/absent = single-currency form (or rate unknown).
  fxRate: z.coerce.number().min(0).default(0),
  billingCycle: z.enum(CYCLES).default('monthly'),
  startDate: z.string(),
  trialEndsAt: z.string().optional().default(''), // '' = no trial
  firstChargeAmount: z.coerce.number().min(0).default(0),
  paymentMethod: z.string().default(''),
  url: z.string().default(''),
  notes: z.string().default(''),
});

/**
 * Roll a start date forward by the billing cycle until it lands in the future.
 * Returns null for lifetime subscriptions (no renewal).
 */
function computeNextRenewal(startDate: Date, cycle: string): Date | null {
  if (cycle === 'lifetime') return null;

  const step = (d: Date): Date => {
    switch (cycle) {
      case 'weekly': return addWeeks(d, 1);
      case 'monthly': return addMonths(d, 1);
      case 'quarterly': return addMonths(d, 3);
      case 'yearly': return addYears(d, 1);
      default: return addMonths(d, 1);
    }
  };

  const now = new Date();
  let next = new Date(startDate);
  // Guard against pathological loops
  let guard = 0;
  while (isBefore(next, now) && guard < 1000) {
    next = step(next);
    guard++;
  }
  // If still in the past (future start date edge), nudge once
  if (isBefore(next, now)) next = addDays(now, 1);
  return next;
}

/**
 * P9: turn the PRINTED figures the form submitted into the stored ones. Every money field on a
 * subscription (the recurring `amount` and the post-trial `firstChargeAmount`) is converted with
 * THE SAME rate, because both are summed in base currency elsewhere (monthly/yearly totals, the
 * calendar agenda, the trial-charge digest); converting only one would mix two currencies inside
 * a single record. A base-currency subscription passes straight through, so a single-currency
 * deployment stores exactly what it stored before.
 */
async function resolveSubFx(parsed: { amount: number; currency: string; fxRate: number; firstChargeAmount: number }) {
  const fx = resolveFx(
    { amount: parsed.amount, currency: parsed.currency, fxRate: parsed.fxRate },
    (await getAppSettings()).currency
  );
  return {
    amount: fx.amount,
    currency: fx.currency,
    origAmount: fx.origAmount,
    fxRate: fx.fxRate,
    // Unknown rate: keep the printed number untouched, exactly as `amount` does above.
    firstChargeAmount: fx.fxRate > 0 ? convertToBase(parsed.firstChargeAmount, fx.fxRate) : parsed.firstChargeAmount,
  };
}

export async function createSubscription(formData: FormData) {
  const parsed = SubFormSchema.parse(Object.fromEntries(formData));
  const startDate = new Date(parsed.startDate);
  const money = await resolveSubFx(parsed);
  await connectDB();
  await Subscription.create({
    ...parsed,
    ...money,
    startDate,
    trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
    nextRenewal: computeNextRenewal(startDate, parsed.billingCycle),
    active: true,
  });
  revalidatePath('/subscriptions');
}

export async function updateSubscription(id: string, formData: FormData) {
  const parsed = SubFormSchema.parse(Object.fromEntries(formData));
  const startDate = new Date(parsed.startDate);
  const money = await resolveSubFx(parsed);
  await connectDB();
  await Subscription.findByIdAndUpdate(id, {
    ...parsed,
    ...money,
    startDate,
    trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
    nextRenewal: computeNextRenewal(startDate, parsed.billingCycle),
  });
  revalidatePath('/subscriptions');
}

export async function toggleSubscriptionActive(id: string, active: boolean) {
  await connectDB();
  await Subscription.findByIdAndUpdate(id, {
    active,
    cancelledAt: active ? null : new Date(),
  });
  revalidatePath('/subscriptions');
}

export async function deleteSubscription(id: string) {
  await connectDB();
  // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
  await Subscription.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath('/subscriptions');
}

/**
 * Scan Expense series for a regular cadence (P7) that has no matching Subscription
 * yet, so the Subscriptions page can offer a one-click "Track this". Heuristic-only
 * (zero AI): a vendor is excluded once ANY existing subscription's name or provider
 * normalizes to the same vendorKey.
 */
export async function discoverUntrackedRecurring(): Promise<RecurringCandidate[]> {
  await connectDB();
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

/** Create a Subscription from a discovered candidate (one-click "Track"). */
export async function trackDiscoveredSubscription(candidate: {
  vendor: string;
  amount: number;
  cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  firstDate: string;
}) {
  const name = (candidate.vendor || 'Untitled').trim() || 'Untitled';
  const startDate = candidate.firstDate ? new Date(candidate.firstDate) : new Date();
  // The candidate is derived from Expense.amount, which is already base currency (P9), so it is
  // stamped with the deployment's own code rather than a hardcoded 'EUR' — on a non-EUR
  // deployment the old literal made every tracked candidate look foreign.
  const currency = normalizeCurrency((await getAppSettings()).currency) || 'EUR';
  await connectDB();
  await Subscription.create({
    name,
    provider: name,
    category: 'other',
    amount: candidate.amount,
    currency,
    billingCycle: candidate.cycle,
    startDate,
    nextRenewal: computeNextRenewal(startDate, candidate.cycle),
    active: true,
  });
  revalidatePath('/subscriptions');
}
