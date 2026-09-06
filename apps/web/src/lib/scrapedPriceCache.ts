// Read-through cache for scraped product pages — the core of the shared-price scraper.
//
// getParsedProductForUrl() is a drop-in for the `fetchPageText(url)` + `parseProductFromPage()`
// pair that the price paths (runPriceScrape, refreshItemPrices, searchItemPriceCandidates) all
// used inline. A fresh entry (< TTL) skips BOTH the fetch and the AI parse — the whole cost of
// a price check — so the same URL is scraped once per TTL across items, across runs, and (since
// ScrapedPrice is a GLOBAL, non-tenant-scoped model) across tenants in SAAS_MODE. That is the
// lever that keeps a multi-customer deployment from re-scraping the same popular shops N times.
//
// Only SUCCESSFUL parses are cached. A fetch error (Cloudflare wall, timeout, dead link) throws
// out, exactly like the old inline code, so the caller counts the error and retries next run
// rather than caching a failure.
import { connectDB } from './db';
import { ScrapedPrice } from '@/models/ScrapedPrice';
import { fetchPageText } from './scrape';
import { parseProductFromPage, type ParsedProduct } from './ollama';

/** How long a scraped price stays fresh. One day matches the daily price-scrape cadence. */
export const SCRAPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Cache key: host (no www) + path, lowercased, no trailing slash. Mirrors items/actions normUrl
 *  so a link added there and one scraped here collapse to the same entry. */
export function normalizeScrapeUrl(u: string): string {
  try {
    const url = new URL(u);
    return (url.hostname.replace(/^www\./, '') + url.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return (u || '').toLowerCase().trim();
  }
}

/**
 * Return the parsed product for a URL, from the shared cache when fresh, else by scraping it
 * (and caching the result). `cached` says which path was taken. Throws only when the live scrape
 * throws (fetch failure) — never on a cache read/write hiccup, which just degrades to scraping.
 */
export async function getParsedProductForUrl(
  url: string,
  opts: { maxAgeMs?: number } = {}
): Promise<{ parsed: ParsedProduct; pageTitle: string; cached: boolean }> {
  const maxAge = opts.maxAgeMs ?? SCRAPE_CACHE_TTL_MS;
  const urlNorm = normalizeScrapeUrl(url);

  try {
    await connectDB();
    const hit = (await ScrapedPrice.findOne({ urlNorm }).lean()) as
      | { parsed?: ParsedProduct; pageTitle?: string; scrapedAt?: Date }
      | null;
    if (hit?.parsed && hit.scrapedAt && Date.now() - new Date(hit.scrapedAt).getTime() < maxAge) {
      return { parsed: hit.parsed, pageTitle: hit.pageTitle ?? '', cached: true };
    }
  } catch {
    /* cache read down → fall through and scrape live */
  }

  const page = await fetchPageText(url); // may throw (Cloudflare/timeout/dead link) — caller handles
  const parsed = (await parseProductFromPage(page)).parsed;
  const pageTitle = page.title ?? '';

  try {
    await connectDB();
    await ScrapedPrice.updateOne(
      { urlNorm },
      { $set: { urlNorm, parsed, pageTitle, scrapedAt: new Date() } },
      { upsert: true },
    );
  } catch {
    /* cache write is best-effort — the caller already has the fresh parse */
  }
  return { parsed, pageTitle, cached: false };
}
