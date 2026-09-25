/**
 * Which items a scheduled price scrape checks, and in what order (#330).
 *
 * Shopping items (the things you still want to buy) are where a fresh price matters: deal alerts
 * and target-price hits only mean something there. Owned items only need a price for
 * depreciation and net worth, so they are checked less often and always after Shopping. Without
 * this order the scrape walked items oldest first, mostly Inventory, and a per-run link cap ran
 * out before it ever reached a Shopping item.
 *
 * Pure and dependency-free: services/scraper/src/scrapeOrder.ts is a byte-for-byte copy (a test
 * in the web app fails if they differ), so both scrapers pick the same items in the same order.
 */

export type ScrapeScope = 'shopping' | 'inventory' | 'both';

export const SCRAPE_SCOPES: readonly ScrapeScope[] = ['both', 'shopping', 'inventory'];

/** Days between price checks of an owned item. Shopping items are checked on every run. */
export const DEFAULT_OWNED_INTERVAL_DAYS = 7;

export function normalizeScrapeScope(raw: unknown): ScrapeScope {
  return raw === 'shopping' || raw === 'inventory' ? raw : 'both';
}

export type ScrapeCandidate = {
  status?: string | null;
  links?: { url?: string | null }[] | null;
  lastPriceCheckAt?: Date | string | null;
};

// Lower runs first. Absent means never scraped (sold, broken, or unknown status).
const PRIORITY: Record<string, number> = {
  researching: 0,
  decided: 0,
  ordered: 0,
  deferred: 1,
  received: 2,
  installed: 2,
};

const SHOPPING = new Set(['researching', 'decided', 'ordered', 'deferred']);

export function isShoppingStatus(status: string | null | undefined): boolean {
  return SHOPPING.has(String(status || ''));
}

function hasHttpLink(item: ScrapeCandidate): boolean {
  return (item.links ?? []).some((l) => !!l?.url && /^https?:\/\//i.test(l.url));
}

function checkedAt(item: ScrapeCandidate): number {
  const t = item.lastPriceCheckAt ? new Date(item.lastPriceCheckAt).getTime() : NaN;
  return Number.isFinite(t) ? t : 0; // never checked sorts first
}

/**
 * The items to price-check this run, in order: Shopping first (never-checked, then the longest
 * ago), then owned items whose last check is older than `ownedIntervalDays`. Items without an
 * http(s) link, sold or broken items, and items outside `scope` are left out.
 */
export function selectForScrape<T extends ScrapeCandidate>(
  items: readonly T[],
  opts: { scope?: ScrapeScope; now?: number; ownedIntervalDays?: number } = {}
): T[] {
  const scope = opts.scope ?? 'both';
  const now = opts.now ?? Date.now();
  const intervalMs = Math.max(0, opts.ownedIntervalDays ?? DEFAULT_OWNED_INTERVAL_DAYS) * 86_400_000;
  const picked: { item: T; priority: number; at: number }[] = [];
  for (const item of items) {
    const priority = PRIORITY[String(item.status || '')];
    if (priority === undefined || !hasHttpLink(item)) continue;
    const shopping = isShoppingStatus(item.status);
    if (scope === 'shopping' && !shopping) continue;
    if (scope === 'inventory' && shopping) continue;
    const at = checkedAt(item);
    if (!shopping && at > 0 && now - at < intervalMs) continue; // owned and checked recently
    picked.push({ item, priority, at });
  }
  picked.sort((a, b) => a.priority - b.priority || a.at - b.at);
  return picked.map((p) => p.item);
}

/**
 * Shopping items that have no store link yet, the ones a scrape cannot price at all. Link
 * searches are costly (a web search plus a page fetch and an AI call per shop), so an item is
 * searched at most once per `retryDays` and only `max` items per run, longest-waiting first.
 */
export function selectForLinkSearch<T extends ScrapeCandidate & { linkSearchAt?: Date | string | null }>(
  items: readonly T[],
  opts: { now?: number; retryDays?: number; max?: number } = {}
): T[] {
  const now = opts.now ?? Date.now();
  const retryMs = Math.max(0, opts.retryDays ?? 7) * 86_400_000;
  const max = Math.max(0, opts.max ?? 3);
  const at = (i: T) => {
    const t = i.linkSearchAt ? new Date(i.linkSearchAt).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  return items
    .filter((i) => isShoppingStatus(i.status) && i.status !== 'deferred' && !hasHttpLink(i))
    .filter((i) => at(i) === 0 || now - at(i) >= retryMs)
    .sort((a, b) => at(a) - at(b))
    .slice(0, max);
}
