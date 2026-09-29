import { fetchRawHtml, parsePriceNum } from '@/lib/scrape';
import { canonicalProductUrl } from '@/lib/shoppingRegion';
import type { StoreTarget } from '@/lib/storeIntelligence';

export type StoreCandidateLink = {
  title: string;
  url: string;
  store: string;
  domain: string;
  price?: number;
};

export type StoreSearchOutcome = {
  store: string;
  domain: string;
  status: 'searched' | 'no_match' | 'failed' | 'excluded' | 'not_attempted';
  matchCount?: number;
  error?: string;
  reason?: string;
};

export type StoreCandidatesWithOutcomes = StoreCandidateLink[] & {
  outcomes?: StoreSearchOutcome[];
};

/**
 * Clean and normalize a store product URL, stripping tracking parameters.
 */
function cleanProductUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const u = new URL(rawUrl, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = u.pathname;

    // Filter out common non-product pages
    if (
      /\/(category|categories|list|collection|search|help|contact|account|cart|checkout|terms|privacy|blog|login|register)\b/i.test(
        pathname
      )
    ) {
      return null;
    }

    // Amazon: normalize to clean canonical /dp/ASIN
    if (host.includes('amazon.')) {
      const asinMatch = pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      if (asinMatch) {
        return `https://${u.hostname}/dp/${asinMatch[1].toUpperCase()}`;
      }
      return null;
    }

    // Skroutz: only product pages /s/
    if (host.includes('skroutz.gr')) {
      if (!pathname.startsWith('/s/')) return null;
      return `https://${u.hostname}${pathname.replace(/\/+$/, '')}`;
    }

    // BestPrice: only product pages /item/
    if (host.includes('bestprice.gr')) {
      if (!pathname.startsWith('/item/')) return null;
      return `https://${u.hostname}${pathname.replace(/\/+$/, '')}`;
    }

    // Plaisio: product pages
    if (host.includes('plaisio.gr')) {
      if (!pathname.startsWith('/product/')) return null;
      return `https://${u.hostname}${pathname.replace(/\/+$/, '')}`;
    }

    // e-shop: keep clean path
    if (host.includes('e-shop.gr')) {
      if (!/p-PER\.\d+|\/product\?/i.test(pathname + u.search)) return null;
      return u.toString();
    }

    // Strip tracking parameters using canonical policy
    const canon = canonicalProductUrl(u.toString());
    const canonUrl = new URL(canon);
    return `https://${u.hostname}${canonUrl.pathname}${canonUrl.search}`;
  } catch {
    return null;
  }
}

/**
 * Extract candidate product URLs from rendered search page HTML.
 */
export function extractCandidateLinksFromHtml(
  html: string,
  searchUrl: string,
  query: string
): StoreCandidateLink[] {
  let baseUrl: URL;
  try {
    baseUrl = new URL(searchUrl);
  } catch {
    return [];
  }

  const host = baseUrl.hostname.toLowerCase().replace(/^www\./, '');
  const storeName = host.split('.')[0];
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const candidates: StoreCandidateLink[] = [];
  const seenUrls = new Set<string>();

  // Match all <a ... href="..." ...> elements and their inner text/title
  const anchorRegex = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const beforeHref = match[1];
    const rawHref = match[2];
    const afterHref = match[3];
    const innerHtml = match[4];

    const rawAttrs = `${beforeHref} ${afterHref}`;
    if (/rel=["'][^"']*nofollow[^"']*["']/i.test(rawAttrs)) continue;

    const cleanedUrl = cleanProductUrl(rawHref, searchUrl);
    if (!cleanedUrl || seenUrls.has(cleanedUrl)) continue;

    // Check domain match
    try {
      const u = new URL(cleanedUrl);
      if (u.hostname.toLowerCase().replace(/^www\./, '') !== host) continue;
    } catch {
      continue;
    }

    // Extract title text from title attribute or inner text (preserve original casing)
    const titleAttr = rawAttrs.match(/title=["']([^"']+)["']/i)?.[1] || '';
    const innerText = innerHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const linkTitle = titleAttr || innerText || '';

    // Filter out common non-product pages
    const lowerHref = cleanedUrl.toLowerCase();
    if (
      /\/(category|categories|list|collection|search|help|contact|account|cart|checkout|terms|privacy|blog|login|register)\b/i.test(
        lowerHref
      )
    ) {
      continue;
    }

    // Check if link matches domain product pattern or query tokens
    const isSkroutzProduct = host.includes('skroutz.gr') && /\/s\/\d+/i.test(lowerHref);
    const isBestPriceProduct = host.includes('bestprice.gr') && /\/item\/\d+/i.test(lowerHref);
    const isPlaisioProduct = host.includes('plaisio.gr') && /\/product\//i.test(lowerHref);
    const isAmazonProduct = host.includes('amazon.') && /\/dp\//i.test(lowerHref);
    const isEshopProduct = host.includes('e-shop.gr') && /PER\.\d+/i.test(lowerHref);

    const matchesKnownPattern =
      isSkroutzProduct || isBestPriceProduct || isPlaisioProduct || isAmazonProduct || isEshopProduct;

    // If not matching a known store pattern, check if the title or URL contains at least one query token
    if (!matchesKnownPattern) {
      const searchTarget = `${lowerHref} ${linkTitle.toLowerCase()}`;
      const matchesToken = queryTokens.some((tok) => searchTarget.includes(tok));
      if (!matchesToken) continue;
    }

    // Try to extract price from the inner text if present
    let price: number | undefined;
    const priceMatch = innerText.match(/(?:€|EUR|\$|£)\s*([\d.,]+)|([\d.,]+)\s*(?:€|EUR|\$|£)/i);
    if (priceMatch) {
      const p = parsePriceNum(priceMatch[1] || priceMatch[2]);
      if (p > 0) price = p;
    }

    seenUrls.add(cleanedUrl);
    candidates.push({
      title: linkTitle || `${storeName} product`,
      url: cleanedUrl,
      store: storeName.charAt(0).toUpperCase() + storeName.slice(1),
      domain: host,
      price,
    });
  }

  return candidates;
}

/**
 * Query multiple stores sequentially with a polite delay and collect top candidate links.
 * Returns candidate links with store search outcomes attached.
 */
export async function searchStoreCandidates(
  stores: StoreTarget[],
  query: string,
  opts: { limitPerStore?: number; maxTotal?: number } = {}
): Promise<StoreCandidatesWithOutcomes> {
  const limitPerStore = opts.limitPerStore ?? 2;
  const maxTotal = opts.maxTotal ?? 6;
  const allCandidates: StoreCandidateLink[] = [];
  const seenUrls = new Set<string>();
  const outcomes: StoreSearchOutcome[] = [];

  for (const store of stores) {
    if (!store.searchUrl || !/^https?:\/\//i.test(store.searchUrl)) {
      outcomes.push({
        store: store.name || store.domain,
        domain: store.domain,
        status: 'not_attempted',
        reason: store.reason || 'Missing search URL',
      });
      continue;
    }

    // If maxTotal reached and this store is NOT a user_configured shop or registered store, mark not attempted
    if (
      allCandidates.length >= maxTotal &&
      store.source !== 'user_configured' &&
      store.source !== 'user_store'
    ) {
      outcomes.push({
        store: store.name || store.domain,
        domain: store.domain,
        status: 'not_attempted',
        reason: 'Candidate cap reached by higher-priority stores',
      });
      continue;
    }

    try {
      const html = await fetchRawHtml(store.searchUrl);
      const links = extractCandidateLinksFromHtml(html, store.searchUrl, query);

      let addedForStore = 0;
      for (const link of links) {
        if (addedForStore >= limitPerStore) break;
        const canon = canonicalProductUrl(link.url);
        if (seenUrls.has(canon)) continue;
        seenUrls.add(canon);

        allCandidates.push({
          ...link,
          url: canon,
          store: store.name || link.store,
          domain: store.domain || link.domain,
        });
        addedForStore++;
      }

      outcomes.push({
        store: store.name || store.domain,
        domain: store.domain,
        status: addedForStore > 0 ? 'searched' : 'no_match',
        matchCount: addedForStore,
        reason: store.reason,
      });
    } catch (err) {
      outcomes.push({
        store: store.name || store.domain,
        domain: store.domain,
        status: 'failed',
        error: (err as Error).message || String(err),
        reason: store.reason,
      });
    }
  }

  const result = allCandidates as StoreCandidatesWithOutcomes;
  result.outcomes = outcomes;
  return result;
}

