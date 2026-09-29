import { searchWeb, type WebResult } from '@/lib/search';
import { rankByMarket, type ShoppingMarket } from '@/lib/shoppingRegion';
import { resolveStoresForProduct } from '@/lib/storeIntelligence';
import { searchStoreCandidates } from '@/lib/storeSearch';

/**
 * Search for shops selling `query`, prioritizing AI-selected store search via the
 * headless sandbox (direct store queries) with graceful web search fallback.
 */
export async function searchShops(
  query: string,
  market: ShoppingMarket | null,
  max = 8,
  opts?: { userStores?: { name: string; url?: string; domain?: string }[]; category?: string }
): Promise<WebResult[]> {
  if (!market) return searchWeb(query, max);

  // 1. Direct Store Search via AI Store Intelligence + Headless Sandbox
  let directCandidates: WebResult[] = [];
  try {
    const recommendation = await resolveStoresForProduct({
      query,
      category: opts?.category,
      country: market.country,
      extraShops: market.extraShops,
      userStores: opts?.userStores,
    });

    if (recommendation.stores.length > 0) {
      const candidates = await searchStoreCandidates(recommendation.stores, query, {
        limitPerStore: 2,
        maxTotal: max,
      });

      directCandidates = candidates.map((c) => ({
        title: c.title,
        url: c.url,
        content: `${c.store} ${c.price ? `· ${c.price}€` : ''}`.trim(),
      }));
    }
  } catch {
    // If direct store search fails or is mocked in tests, continue to web fallback
  }

  if (directCandidates.length >= max) {
    return rankByMarket(directCandidates, market).slice(0, max);
  }

  // 2. Fallback to web search if fewer than max direct candidates found
  const searchOpts = { language: market.language };
  try {
    const batches = await Promise.all([
      searchWeb(query, max, searchOpts),
      ...market.extraShops.map((shop) => searchWeb(`${query} site:${shop}`, 3, searchOpts)),
    ]);
    const webHits = batches.flat();
    return rankByMarket([...directCandidates, ...webHits], market).slice(0, max);
  } catch {
    return rankByMarket(directCandidates, market).slice(0, max);
  }
}

