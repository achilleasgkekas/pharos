import { connectDB } from '@/lib/db';
import { Subscription } from '@/models/Subscription';
import { Card } from '@/models/Card';
import { SubscriptionsClient } from './SubscriptionsClient';
import { getAppSettings } from '@/lib/appSettings';
import type { SerializedSubscription, SerializedCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ subscriptions: SerializedSubscription[]; cards: SerializedCard[] }> {
  await connectDB();
  const [subs, cards] = await Promise.all([
    Subscription.find().sort({ active: -1, nextRenewal: 1 }).lean(),
    Card.find({ active: true }).sort({ name: 1 }).lean(),
  ]);
  return {
    subscriptions: JSON.parse(JSON.stringify(subs)),
    cards: JSON.parse(JSON.stringify(cards)),
  };
}

export default async function SubscriptionsPage() {
  const [{ subscriptions, cards }, settings] = await Promise.all([getData(), getAppSettings()]);
  return <SubscriptionsClient subscriptions={subscriptions} cards={cards} categoryList={settings.subscriptionCategories} />;
}
