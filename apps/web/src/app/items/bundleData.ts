import 'server-only';
import { Item as ItemModel } from '@/models/Item';
import { currentModel } from '@/lib/tenancy/connection';
import { summarizeBundles, type BundleSummary } from '@/lib/bundles';

/**
 * P39 — every build's roll-up, across BOTH item views. A build mixes owned parts (Inventory)
 * with ordered and wished-for ones (Shopping), and each page only loads its own half, so the
 * summary is read here from all items that name a bundle. Call inside withRequestTenant.
 */
export async function loadBundleSummaries(): Promise<BundleSummary[]> {
  const Item = await currentModel(ItemModel);
  const parts = await Item.find({ bundle: { $nin: ['', null] } })
    .select('bundle status currentPrice purchasedPrice')
    .lean();
  return summarizeBundles(parts);
}
