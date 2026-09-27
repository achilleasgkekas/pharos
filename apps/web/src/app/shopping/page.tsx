import { connectDB } from '@/lib/db';
import { Item as ItemModel } from '@/models/Item';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { ItemsClient } from '../items/ItemsClient';
import { SHOPPING_STATUSES } from '@/lib/itemStatus';
import { getAppSettings } from '@/lib/appSettings';
import { marketFor } from '@/lib/shoppingRegion';
import type { SerializedItem } from '@/types';
import { loadBundleSummaries } from '../items/bundleData';
import type { BundleSummary } from '@/lib/bundles';

export const dynamic = 'force-dynamic';

async function getItems(): Promise<{ items: SerializedItem[]; bundles: BundleSummary[] }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const [items, bundles] = await Promise.all([
    Item.find({ status: { $in: SHOPPING_STATUSES } }).sort({ num: 1, createdAt: -1 }).lean(),
    loadBundleSummaries(),
  ]);
  return { items: JSON.parse(JSON.stringify(items)), bundles };
  });
}

export default async function ShoppingPage() {
  const [{ items, bundles }, settings] = await Promise.all([getItems(), getAppSettings()]);
  return (
    <ItemsClient
      items={items}
      view="shopping"
      bundles={bundles}
      defaultView={settings.defaultItemView}
      categoryList={settings.itemCategories}
      baseCurrency={settings.currency}
      multiCurrency={settings.multiCurrency} // P9: off = no per-item currency controls at all
      shoppingMarket={marketFor(settings.shoppingCountry, settings.shoppingExtraShops)}
    />
  );
}
