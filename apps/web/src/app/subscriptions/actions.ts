'use server';
import { connectDB } from '@/lib/db';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Expense as ExpenseModel } from '@/models/Expense';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { suggestSubscription, type ParsedSubscription } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { vendorKey } from '@/app/expenses/lib';
import { discoverRecurringCandidates, type RecurringCandidate } from '@/lib/recurringDiscovery';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx, convertToBase, normalizeCurrency } from '@/lib/fx';
import { assertCanWrite } from '@/lib/auth';
import { cleanSplit } from '@/lib/split';
import { BILLING_CYCLE_VALUES, nextOccurrence } from '@/lib/billingCycle';
import { groupSubscriptionDupes } from '@/lib/subscriptionDupes';
import type { SubscriptionDupeGroup } from '@/lib/subscriptionDupes';

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

const CYCLES = BILLING_CYCLE_VALUES;

/**
 * A real YYYY-MM-DD calendar day, which is all the native date input ever sends. `new Date(v)`
 * alone is not enough: it silently rolls `2021-02-29` over to 1 March and would save a renewal
 * date the user never typed, so the parsed UTC parts must round-trip to the same day.
 */
function isCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const SubFormSchema = z.object({
  name: z.string().min(1, 'Name required'),
  provider: z.string().default(''),
  // #29: a free string, not the old fixed enum. The model was relaxed long ago so Settings → Lists
  // can add custom categories and the form offers them; an enum here rejected every custom one at
  // save time. 30 chars is the same cap `normalizeList` (lib/taxonomies.ts) puts on list entries.
  category: z
    .string()
    .trim()
    .max(30)
    .transform((v) => v || 'other')
    .default('other'),
  amount: z.coerce.number().min(0),
  currency: z.string().default('EUR'),
  // P9: base units per 1 unit of `currency`; 0/absent = single-currency form (or rate unknown).
  fxRate: z.coerce.number().min(0).default(0),
  billingCycle: z.enum(CYCLES).default('monthly'),
  // #30: the date input is clearable, and new Date('') is Invalid Date, which then reached the
  // write as both startDate and nextRenewal. Reject it here, before any DB work.
  startDate: z.string().refine(isCalendarDate, 'Valid start date required'),
  trialEndsAt: z.string().optional().default(''), // '' = no trial
  firstChargeAmount: z.coerce.number().min(0).default(0),
  paymentMethod: z.string().default(''),
  url: z.string().default(''),
  notes: z.string().default(''),
  // P68: per-property ledger tag, ίδιο taxonomy και ίδιο ταβάνι 40 χαρακτήρων με το
  // `Expense.space` (P34) και το `Receipt.space` (φάση 1).
  space: z.string().max(40).default(''),
  // Household cost-split (P73): the form serializes the SplitEntry[] as JSON into one
  // FormData field (the rest of this schema is flat strings). Malformed/absent JSON
  // degrades to no split rather than a validation error.
  split: z
    .string()
    .default('[]')
    .transform((s) => {
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }),
});

/**
 * Roll a start date forward by the billing cycle until it lands in the future.
 * Returns null for lifetime subscriptions (no renewal).
 */
function computeNextRenewal(startDate: Date, cycle: string): Date | null {
  // The stepping itself lives in lib/billingCycle.ts so every cycle (biennial included)
  // rolls forward the same way here, in the calendar and in the money agenda.
  return nextOccurrence(startDate, cycle);
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
  await assertCanWrite();
  const parsed = SubFormSchema.parse(Object.fromEntries(formData));
  const startDate = new Date(parsed.startDate);
  const money = await resolveSubFx(parsed);
  return withRequestTenant(async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    await Subscription.create({
      ...parsed,
      ...money,
      space: parsed.space.trim(),
      split: cleanSplit(parsed.split),
      startDate,
      trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
      nextRenewal: computeNextRenewal(startDate, parsed.billingCycle),
      active: true,
    });
    revalidatePath('/subscriptions');
  });
}

export async function updateSubscription(id: string, formData: FormData) {
  await assertCanWrite();
  const parsed = SubFormSchema.parse(Object.fromEntries(formData));
  const startDate = new Date(parsed.startDate);
  const money = await resolveSubFx(parsed);
  return withRequestTenant(async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    await Subscription.findByIdAndUpdate(id, {
      ...parsed,
      ...money,
      space: parsed.space.trim(),
      split: cleanSplit(parsed.split),
      startDate,
      trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
      nextRenewal: computeNextRenewal(startDate, parsed.billingCycle),
    });
    revalidatePath('/subscriptions');
  });
}

export async function toggleSubscriptionActive(id: string, active: boolean) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    await Subscription.findByIdAndUpdate(id, {
      active,
      cancelledAt: active ? null : new Date(),
    });
    revalidatePath('/subscriptions');
  });
}

/** Confirm continued use without changing billing, renewal, pause, or active state. */
export async function reviewSubscription(id: string) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    await Subscription.findByIdAndUpdate(id, { lastReviewedAt: new Date() });
    revalidatePath('/subscriptions');
  });
}

export async function deleteSubscription(id: string) {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
    await Subscription.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/subscriptions');
  });
}

/**
 * Scan Expense series for a regular cadence (P7) that has no matching Subscription
 * yet, so the Subscriptions page can offer a one-click "Track this". Heuristic-only
 * (zero AI): a vendor is excluded once ANY existing subscription's name or provider
 * normalizes to the same vendorKey.
 */
export async function discoverUntrackedRecurring(): Promise<RecurringCandidate[]> {
  return withRequestTenant(async () => {
    await connectDB();
    // Both models are resolved inside the SAME wrap: the exclude set is only meaningful when the
    // expenses and the subscriptions it filters against come from one tenant's db.
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
  });
}

/** Create a Subscription from a discovered candidate (one-click "Track"). */
export async function trackDiscoveredSubscription(candidate: {
  vendor: string;
  amount: number;
  cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  firstDate: string;
}) {
  // This call used to sit AFTER the closing brace of this function (a stray top-level statement
  // left by the P31 commit), so "Track this" was the one write path a viewer could still reach,
  // and the module ran the guard once at import time instead. See writeGuard.coverage.test.ts,
  // whose scanner was blind to it because the last function's body ran to end-of-file.
  await assertCanWrite();
  const name = (candidate.vendor || 'Untitled').trim() || 'Untitled';
  const startDate = candidate.firstDate ? new Date(candidate.firstDate) : new Date();
  // The candidate is derived from Expense.amount, which is already base currency (P9), so it is
  // stamped with the deployment's own code rather than a hardcoded 'EUR' — on a non-EUR
  // deployment the old literal made every tracked candidate look foreign.
  const currency = normalizeCurrency((await getAppSettings()).currency) || 'EUR';
  return withRequestTenant(async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
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
  });
}

// ── Duplicate detection & merge (P85) ────────────────────────────────────────
// The fifth module to get the review-before-merge flow (after Receipts/Stores/Items/
// Expenses). The grouping rule lives in lib/subscriptionDupes.ts (pure, tested); these
// two exports are only the database halves of it.

/** Candidate duplicate subscriptions, most valuable cluster first. */
export async function findDuplicateSubscriptions(): Promise<SubscriptionDupeGroup[]> {
  return withRequestTenant(async () => {
    await connectDB();
    const Subscription = await currentModel(SubscriptionModel);
    // amount > 0 mirrors the Expenses filter: a free/€0 subscription carries no cost
    // signal and would otherwise collapse every €0 row into one bogus cluster.
    const rows = await Subscription.find({ amount: { $gt: 0 } })
      .select('name provider category amount currency billingCycle active paymentMethod notes url split fxRate')
      .lean();

    return groupSubscriptionDupes(
      (rows as unknown as Array<Record<string, unknown>>).map((r) => {
        const name = String(r.name ?? '');
        // The provider is a strong extra signal, but the NAME is what the user typed and
        // what they re-type on a re-signup, so it stays the grouping key (vendorKey idiom).
        return {
          _id: String(r._id),
          name,
          nameKey: vendorKey(name),
          amount: Number(r.amount) || 0,
          billingCycle: String(r.billingCycle ?? 'monthly'),
          provider: String(r.provider ?? ''),
          category: String(r.category ?? ''),
          currency: String(r.currency ?? ''),
          active: r.active !== false,
          paymentMethod: String(r.paymentMethod ?? ''),
          notes: String(r.notes ?? ''),
          url: String(r.url ?? ''),
          splitCount: Array.isArray(r.split) ? r.split.length : 0,
          hasFx: Number(r.fxRate) > 0,
        };
      })
    );
  });
}

/**
 * Merge duplicate subscriptions into one survivor: backfill every field the survivor is
 * missing from the dropped records, union any cost-split, then soft-delete the drops to
 * Trash (undoable for 30 days, same as a manual delete).
 */
export async function mergeSubscriptions(
  keepId: string,
  dropIds: string[]
): Promise<{ ok: boolean; merged: number; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    try {
      await connectDB();
      const Subscription = await currentModel(SubscriptionModel);
      const keep = await Subscription.findById(keepId);
      if (!keep) return { ok: false, merged: 0, error: 'Record to keep not found' };

      const targets = dropIds.filter((id) => id && id !== keepId);
      if (targets.length === 0) return { ok: false, merged: 0, error: 'No records to merge' };
      // Already-trashed records are excluded by the soft-delete plugin.
      const drops = await Subscription.find({ _id: { $in: targets } });
      if (drops.length === 0) return { ok: false, merged: 0, error: 'No records to merge' };

      for (const d of drops) {
        if (!keep.provider && d.provider) keep.provider = d.provider;
        if ((!keep.category || keep.category === 'other') && d.category && d.category !== 'other') {
          keep.category = d.category;
        }
        if (!keep.paymentMethod && d.paymentMethod) keep.paymentMethod = d.paymentMethod;
        if (!keep.notes && d.notes) keep.notes = d.notes;
        if (!keep.url && d.url) keep.url = d.url;
        if (!keep.space && d.space) keep.space = d.space;
        if (!keep.trialEndsAt && d.trialEndsAt) keep.trialEndsAt = d.trialEndsAt;
        if (!keep.firstChargeAmount && d.firstChargeAmount) keep.firstChargeAmount = d.firstChargeAmount;
        // Foreign-currency provenance (P9): amount is already base and equal across the
        // group, but only one copy may carry what the invoice printed.
        if (!keep.fxRate && d.fxRate) {
          keep.currency = d.currency;
          keep.origAmount = d.origAmount;
          keep.fxRate = d.fxRate;
        }
        if ((!keep.split || keep.split.length === 0) && d.split?.length) {
          keep.split = d.split;
          keep.markModified('split');
        }
        // A dropped copy that is still active means the survivor should be live too
        // (never let a merge silently cancel a running subscription).
        if (!keep.active && d.active) {
          keep.active = true;
          keep.cancelledAt = null;
        }
      }
      await keep.save();

      const now = new Date();
      await Subscription.updateMany({ _id: { $in: drops.map((d) => d._id) } }, { $set: { deletedAt: now } });

      revalidatePath('/subscriptions');
      revalidatePath('/reports');
      return { ok: true, merged: drops.length };
    } catch (err) {
      return { ok: false, merged: 0, error: (err as Error).message };
    }
  });
}
