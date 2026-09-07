import { connectDB } from '@/lib/db';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Card as CardModel } from '@/models/Card';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { SubscriptionsClient } from './SubscriptionsClient';
import { getAppSettings } from '@/lib/appSettings';
import { discoverUntrackedRecurring } from './actions';
import type { SerializedSubscription, SerializedCard } from '@/types';
import type { RecurringCandidate } from '@/lib/recurringDiscovery';
import { effectiveNextRenewalISO } from '@/lib/subscriptionRenewal';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{
  subscriptions: SerializedSubscription[];
  cards: SerializedCard[];
  candidates: RecurringCandidate[];
}> {
  return withRequestTenant(async () => {
  await connectDB();
  const Subscription = await currentModel(SubscriptionModel);
  const Card = await currentModel(CardModel);
  const [subs, cards, candidates] = await Promise.all([
    Subscription.find().sort({ active: -1, nextRenewal: 1 }).lean(),
    Card.find({ active: true }).sort({ name: 1 }).lean(),
    discoverUntrackedRecurring(),
  ]);
  // `nextRenewal` is a snapshot written at save time and never advanced, so once a
  // renewal date goes by the card reads "Renews overdue" for good and re-saving the
  // subscription was the only way to move it on. Derive the date the subscription is
  // actually next charged on instead — see lib/subscriptionRenewal.ts.
  const now = Date.now();
  const subscriptions = (JSON.parse(JSON.stringify(subs)) as SerializedSubscription[]).map((s) => ({
    ...s,
    nextRenewal: effectiveNextRenewalISO(s.nextRenewal, s.billingCycle, now),
  }));
  return {
    subscriptions,
    cards: JSON.parse(JSON.stringify(cards)),
    candidates,
  };
  });
}

export default async function SubscriptionsPage() {
  const [{ subscriptions, cards, candidates }, settings] = await Promise.all([getData(), getAppSettings()]);
  return (
    <SubscriptionsClient
      subscriptions={subscriptions}
      cards={cards}
      categoryList={settings.subscriptionCategories}
      spaces={settings.spaces} // P68: ίδια per-property tags που χρησιμοποιεί η φόρμα των Expenses
      candidates={candidates}
      baseCurrency={settings.currency}
      multiCurrency={settings.multiCurrency} // P9: off = no per-subscription currency controls at all
    />
  );
}
