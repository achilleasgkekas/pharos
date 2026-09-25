import { searchWeb, type WebResult } from '@/lib/search';
import { rankByMarket, type ShoppingMarket } from '@/lib/shoppingRegion';

/**
 * Web search for shops selling `query`, limited to the shopping market when one is set (#319).
 *
 * With no market this is exactly `searchWeb(query, max)`, so installs that never chose a
 * country behave as before. With one, it searches in the market's language, adds one
 * `site:` query per foreign shop that ships there (so Amazon.de is found even when it is not in
 * the general results), then keeps only in-market URLs: the country's own shops first. Callers
 * apply their own caps AFTER this, so an out-of-market hit never takes a slot or an AI call.
 */
export async function searchShops(query: string, market: ShoppingMarket | null, max = 8): Promise<WebResult[]> {
  if (!market) return searchWeb(query, max);
  const opts = { language: market.language };
  const batches = await Promise.all([
    searchWeb(query, max, opts),
    ...market.extraShops.map((shop) => searchWeb(`${query} site:${shop}`, 3, opts)),
  ]);
  return rankByMarket(batches.flat(), market);
}
