import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { Card } from '@/models/Card';
import { SubscriptionsClient } from './SubscriptionsClient';
import { getAppSettings } from '@/lib/appSettings';
import { discoverUntrackedRecurring } from './actions';
import type { SerializedSubscription, SerializedCard } from '@/types';
import type { RecurringCandidate } from '@/lib/recurringDiscovery';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{
  subscriptions: SerializedSubscription[];
  cards: SerializedCard[];
  candidates: RecurringCandidate[];
}> {
  await connectDB();
  const [subs, cards, candidates] = await Promise.all([
    Subscription.find().sort({ active: -1, nextRenewal: 1 }).lean(),
    Card.find({ active: true }).sort({ name: 1 }).lean(),
    discoverUntrackedRecurring(),
  ]);
  return {
    subscriptions: JSON.parse(JSON.stringify(subs)),
    cards: JSON.parse(JSON.stringify(cards)),
    candidates,
  };
}

export default async function SubscriptionsPage() {
  const [{ subscriptions, cards, candidates }, settings] = await Promise.all([getData(), getAppSettings()]);
  return (
    <SubscriptionsClient
      subscriptions={subscriptions}
      cards={cards}
      categoryList={settings.subscriptionCategories}
      candidates={candidates}
      baseCurrency={settings.currency}
      multiCurrency={settings.multiCurrency} // P9: off = no per-subscription currency controls at all
    />
  );
}
