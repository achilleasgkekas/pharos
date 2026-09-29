import { searchWeb, type WebResult } from '@/lib/search';
import { marketRank, rankByMarket, type ShoppingMarket } from '@/lib/shoppingRegion';
import { resolveStoresForProduct } from '@/lib/storeIntelligence';
import { searchStoreCandidates, type StoreSearchOutcome } from '@/lib/storeSearch';

export type WebResultWithOutcomes = WebResult[] & {
  outcomes?: StoreSearchOutcome[];
};

/**
 * Balance candidate results so that foreign shops explicitly configured by the user
 * (extraShops) are not completely starved out by local aggregators.
 */
function balanceMarketResults<T extends { url: string }>(
  results: T[],
  market: ShoppingMarket,
  max: number
): T[] {
  const ranked = rankByMarket(results, market);
  if (ranked.length <= max || market.extraShops.length === 0) {
    return ranked.slice(0, max);
  }

  // Separate into local and abroad hits
  const local: T[] = [];
  const abroad: T[] = [];
  for (const r of ranked) {
    const rank = marketRank(r.url, market);
    if (rank === 0) local.push(r);
    else if (rank === 1) abroad.push(r);
  }

  // If no abroad hits or no local hits, plain slice
  if (abroad.length === 0 || local.length === 0) {
    return ranked.slice(0, max);
  }

  // Reserve up to 2 slots (or up to 40% of max) for abroad hits from configured shops
  const abroadQuota = Math.min(abroad.length, Math.max(1, Math.min(2, Math.floor(max * 0.4))));
  const localQuota = max - abroadQuota;

  const balancedLocal = local.slice(0, localQuota);
  const balancedAbroad = abroad.slice(0, abroadQuota);

  return [...balancedLocal, ...balancedAbroad];
}

/**
 * Search for shops selling `query`, prioritizing AI-selected store search via the
 * headless sandbox (direct store queries) with graceful web search fallback.
 */
export async function searchShops(
  query: string,
  market: ShoppingMarket | null,
  max = 8,
  opts?: { userStores?: { name: string; url?: string; domain?: string }[]; category?: string }
): Promise<WebResultWithOutcomes> {
  if (!market) {
    const res = await searchWeb(query, max);
    return res as WebResultWithOutcomes;
  }

  let directCandidates: WebResult[] = [];
  let outcomes: StoreSearchOutcome[] = [];

  // 1. Direct Store Search via AI Store Intelligence + Headless Sandbox
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

      if (candidates.outcomes) {
        outcomes = candidates.outcomes;
      }

      directCandidates = candidates.map((c) => ({
        title: c.title,
        url: c.url,
        content: `${c.store} ${c.price ? `· ${c.price}€` : ''}`.trim(),
      }));
    }
  } catch {
    // If direct store search fails or is mocked in tests, continue to web fallback
  }

  // Check which extraShops already have direct candidates
  const extraShopsWithHits = new Set<string>();
  for (const shop of market.extraShops) {
    if (directCandidates.some((c) => c.url.toLowerCase().includes(shop.toLowerCase()))) {
      extraShopsWithHits.add(shop);
    }
  }

  // 2. Web search fallback:
  // Run if directCandidates < max, OR if any configured extraShops have no direct hits yet
  const missingExtraShops = market.extraShops.filter((shop) => !extraShopsWithHits.has(shop));
  const needsWebSearch = directCandidates.length < max || missingExtraShops.length > 0;

  if (!needsWebSearch) {
    const res = balanceMarketResults(directCandidates, market, max) as WebResultWithOutcomes;
    res.outcomes = outcomes;
    return res;
  }

  const searchOpts = { language: market.language };
  try {
    const batches = await Promise.all([
      directCandidates.length < max ? searchWeb(query, max, searchOpts) : Promise.resolve([]),
      ...missingExtraShops.map((shop) => searchWeb(`${query} site:${shop}`, 3, searchOpts)),
    ]);
    const webHits = batches.flat();
    const res = balanceMarketResults([...directCandidates, ...webHits], market, max) as WebResultWithOutcomes;
    res.outcomes = outcomes;
    return res;
  } catch {
    const res = balanceMarketResults(directCandidates, market, max) as WebResultWithOutcomes;
    res.outcomes = outcomes;
    return res;
  }
}


