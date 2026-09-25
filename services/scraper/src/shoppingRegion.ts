/**
 * Shopping country (#319): which shops a price search should care about.
 *
 * A web search for "RTX 5080" returns shops from everywhere, and Newegg at 1000€ is useless to
 * someone in Greece who will never buy there. A market is the country's own shops (by domain
 * ending) plus the foreign shops that actually ship there (Amazon.de for most of the EU).
 * Everything else is dropped before the price picker or AI fill spends a page fetch and an AI
 * call on it.
 *
 * This is the ONE place that decides whether a URL is inside the market; the picker and both
 * AI-fill paths call it, so they cannot disagree (the same lesson as `lowestKnownPrice`, #254).
 *
 * The price scraper is a separate package, so services/scraper/src/shoppingRegion.ts is a
 * byte-for-byte copy of this file (the same arrangement as ssrf.ts). A test in the web app
 * fails if the two ever differ: edit here, then copy the file across.
 */

export type ShoppingMarket = {
  country: string; // ISO 3166-1 alpha-2, upper case
  language: string; // SearXNG `language` value, e.g. 'el-GR'
  domains: string[]; // the country's own domain endings, e.g. ['gr'] or ['co.uk', 'uk']
  extraShops: string[]; // foreign shops that ship here, as bare hosts, e.g. ['amazon.de']
};

type Preset = { language: string; domains: string[]; extraShops: string[] };

/**
 * Defaults per country. `extraShops` is only the starting point: the setting stores the user's
 * own list, prefilled from here when they pick the country.
 */
export const SHOPPING_PRESETS: Record<string, Preset> = {
  GR: { language: 'el-GR', domains: ['gr'], extraShops: ['amazon.de'] },
  CY: { language: 'el-CY', domains: ['cy', 'gr'], extraShops: ['amazon.de'] },
  DE: { language: 'de-DE', domains: ['de'], extraShops: [] },
  AT: { language: 'de-AT', domains: ['at', 'de'], extraShops: [] },
  FR: { language: 'fr-FR', domains: ['fr'], extraShops: [] },
  BE: { language: 'fr-BE', domains: ['be'], extraShops: ['amazon.fr', 'amazon.nl', 'amazon.de'] },
  NL: { language: 'nl-NL', domains: ['nl'], extraShops: ['amazon.de'] },
  IT: { language: 'it-IT', domains: ['it'], extraShops: ['amazon.de'] },
  ES: { language: 'es-ES', domains: ['es'], extraShops: [] },
  PT: { language: 'pt-PT', domains: ['pt'], extraShops: ['amazon.es'] },
  IE: { language: 'en-IE', domains: ['ie'], extraShops: ['amazon.de'] },
  PL: { language: 'pl-PL', domains: ['pl'], extraShops: ['amazon.de'] },
  CZ: { language: 'cs-CZ', domains: ['cz'], extraShops: ['amazon.de'] },
  SE: { language: 'sv-SE', domains: ['se'], extraShops: ['amazon.de'] },
  DK: { language: 'da-DK', domains: ['dk'], extraShops: ['amazon.de'] },
  FI: { language: 'fi-FI', domains: ['fi'], extraShops: ['amazon.de'] },
  RO: { language: 'ro-RO', domains: ['ro'], extraShops: ['amazon.de'] },
  BG: { language: 'bg-BG', domains: ['bg'], extraShops: ['amazon.de'] },
  HU: { language: 'hu-HU', domains: ['hu'], extraShops: ['amazon.de'] },
  GB: { language: 'en-GB', domains: ['uk'], extraShops: [] },
  US: { language: 'en-US', domains: ['us'], extraShops: ['amazon.com', 'bestbuy.com', 'newegg.com', 'walmart.com'] },
};

export const SHOPPING_COUNTRIES = Object.keys(SHOPPING_PRESETS);

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Normalise what the user typed into a bare host: "https://www.Amazon.de/foo" → "amazon.de".
 * Empty string for anything that is not a plausible domain.
 */
export function normalizeShopHost(raw: string): string {
  let s = String(raw ?? '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  s = s.split(/[/?#]/)[0]; // path, query, fragment
  s = s.replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
  return HOST_RE.test(s) ? s : '';
}

/** Clean a user-entered shop list: normalised, valid, unique, at most 20. */
export function normalizeShopList(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
  const out: string[] = [];
  for (const item of items) {
    const host = normalizeShopHost(String(item));
    if (host && !out.includes(host)) out.push(host);
    if (out.length >= 20) break;
  }
  return out;
}

/** A stored country code, or '' (off) for anything without a preset. */
export function normalizeShoppingCountry(raw: unknown): string {
  const c = String(raw ?? '').trim().toUpperCase();
  return SHOPPING_PRESETS[c] ? c : '';
}

/**
 * The preset country for a BCP 47 language tag's region ('el-GR' → 'GR'), or '' when the tag has
 * no region or the region has no preset. Used only to suggest a country in the setup wizard.
 */
export function countryFromLanguageTag(tag: string | undefined): string {
  const region = String(tag ?? '').split(/[-_]/)[1] ?? '';
  return normalizeShoppingCountry(region.length === 2 ? region : '');
}

/** The market for the saved settings, or null when the feature is off (no country chosen). */
export function marketFor(country: string, extraShops: string[]): ShoppingMarket | null {
  const preset = SHOPPING_PRESETS[normalizeShoppingCountry(country)];
  if (!preset) return null;
  return { country: country.toUpperCase(), language: preset.language, domains: preset.domains, extraShops };
}

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

/** `host` is `domain` itself or one of its subdomains. Never a substring match. */
function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Where a URL sits in the market: 0 = the country's own shop, 1 = a foreign shop that ships
 * here, null = outside the market. Host-based, so `amazon.de.example.com` is NOT Amazon.de and a
 * `.gr` string in the path proves nothing.
 */
export function marketRank(url: string, market: ShoppingMarket): 0 | 1 | null {
  const host = hostOf(url);
  if (!host) return null;
  if (market.extraShops.some((shop) => onDomain(host, shop))) return 1;
  // A domain ending is only a country when something precedes it ("shop.gr", not "gr").
  if (market.domains.some((d) => host.endsWith(`.${d}`))) return 0;
  return null;
}

/**
 * Keep only in-market results, the country's own shops first, then the foreign ones, each in
 * the order the search returned them. Duplicate URLs are dropped.
 */
export function rankByMarket<T extends { url: string }>(results: T[], market: ShoppingMarket): T[] {
  const seen = new Set<string>();
  const local: T[] = [];
  const abroad: T[] = [];
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    const rank = marketRank(r.url, market);
    if (rank === 0) local.push(r);
    else if (rank === 1) abroad.push(r);
  }
  return [...local, ...abroad];
}
