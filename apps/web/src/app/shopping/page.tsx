import { connectDB } from '@/lib/db';
import { Item as ItemModel } from '@/models/Item';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { ItemsClient } from '../items/ItemsClient';
import { SHOPPING_STATUSES } from '@/lib/itemStatus';
import { getAppSettings } from '@/lib/appSettings';
import type { SerializedItem } from '@/types';

export const dynamic = 'force-dynamic';

async function getItems(): Promise<SerializedItem[]> {
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const items = await Item.find({ status: { $in: SHOPPING_STATUSES } })
    .sort({ num: 1, createdAt: -1 })
    .lean();
  return JSON.parse(JSON.stringify(items));
  });
}

export default async function ShoppingPage() {
  const [items, settings] = await Promise.all([getItems(), getAppSettings()]);
  return (
    <ItemsClient
      items={items}
      view="shopping"
      defaultView={settings.defaultItemView}
      categoryList={settings.itemCategories}
      baseCurrency={settings.currency}
      multiCurrency={settings.multiCurrency} // P9: off = no per-item currency controls at all
    />
  );
}
