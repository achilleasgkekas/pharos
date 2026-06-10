import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { ItemsClient } from '../items/ItemsClient';
import { SHOPPING_STATUSES } from '@/lib/itemStatus';
import { getAppSettings } from '@/lib/appSettings';
import type { SerializedItem } from '@/types';

export const dynamic = 'force-dynamic';

async function getItems(): Promise<SerializedItem[]> {
  await connectDB();
  const items = await Item.find({ status: { $in: SHOPPING_STATUSES } })
    .sort({ num: 1, createdAt: -1 })
    .lean();
  return JSON.parse(JSON.stringify(items));
}

export default async function ShoppingPage() {
  const [items, settings] = await Promise.all([getItems(), getAppSettings()]);
  return <ItemsClient items={items} view="shopping" defaultView={settings.defaultItemView} categoryList={settings.itemCategories} />;
}
