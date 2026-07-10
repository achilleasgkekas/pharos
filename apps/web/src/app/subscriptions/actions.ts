'use server';
import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { suggestSubscription, type ParsedSubscription } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addDays, addMonths, addWeeks, addYears, isBefore } from 'date-fns';

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

export async function createSubscription(formData: FormData) {
  const parsed = SubFormSchema.parse(Object.fromEntries(formData));
  const startDate = new Date(parsed.startDate);
  await connectDB();
  await Subscription.create({
    ...parsed,
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
  await connectDB();
  await Subscription.findByIdAndUpdate(id, {
    ...parsed,
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
