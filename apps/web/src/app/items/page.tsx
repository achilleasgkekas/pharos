import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { Statement } from '@/models/Statement';
import { Receipt } from '@/models/Receipt';
import { ItemsClient, type ReceiptRef } from './ItemsClient';
import { OWNED_STATUSES } from '@/lib/itemStatus';
import { computeInstallmentPlans, type InstallmentPlan } from '@/lib/installments';
import { getAppSettings } from '@/lib/appSettings';
import type { SerializedItem, SerializedStatement } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{
  items: SerializedItem[];
  plans: InstallmentPlan[];
  unlinkedPlans: InstallmentPlan[];
  receipts: ReceiptRef[];
}> {
  await connectDB();
  const [items, statements, receipts] = await Promise.all([
    Item.find({ status: { $in: OWNED_STATUSES } }).sort({ purchasedAt: -1, createdAt: -1 }).lean(),
    Statement.find().lean(),
    Receipt.find().select('store date total filePath fileType').lean(),
  ]);
  const serialized: SerializedStatement[] = JSON.parse(JSON.stringify(statements));
  const all = computeInstallmentPlans(serialized);
  // Linked plans show on the matching product; unlinked active plans can be attached.
  return {
    items: JSON.parse(JSON.stringify(items)),
    plans: all.filter((p) => p.itemIds.length > 0),
    unlinkedPlans: all.filter((p) => p.itemIds.length === 0 && !p.done),
    receipts: JSON.parse(JSON.stringify(receipts)),
  };
}

export default async function ItemsPage() {
  const [{ items, plans, unlinkedPlans, receipts }, settings] = await Promise.all([getData(), getAppSettings()]);
  return <ItemsClient items={items} view="inventory" plans={plans} unlinkedPlans={unlinkedPlans} receipts={receipts} defaultView={settings.defaultItemView} categoryList={settings.itemCategories} />;
}
