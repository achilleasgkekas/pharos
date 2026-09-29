import { runTextJSON } from '@/lib/ollama';

export type StoreTarget = {
  name: string;
  domain: string;
  searchUrl: string;
  reason?: string;
};

export type StoreRecommendation = {
  detectedCategory: string;
  stores: StoreTarget[];
};

export type StoreContextOptions = {
  category?: string;
  extraShops?: string[];
  userStores?: { name: string; url?: string; domain?: string }[];
};

/**
 * Standard search URL templates for popular merchants when query is given.
 */
function buildSearchUrl(domain: string, query: string): string {
  const enc = encodeURIComponent(query.trim());
  const d = domain.toLowerCase().replace(/^www\./, '');

  if (d.includes('skroutz.gr')) return `https://www.skroutz.gr/search?keyphrase=${enc}`;
  if (d.includes('bestprice.gr')) return `https://www.bestprice.gr/search?q=${enc}`;
  if (d.includes('plaisio.gr')) return `https://www.plaisio.gr/search?q=${enc}`;
  if (d.includes('e-shop.gr')) return `https://www.e-shop.gr/search?q=${enc}`;
  if (d.includes('public.gr')) return `https://www.public.gr/search?q=${enc}`;
  if (d.includes('you.gr')) return `https://www.you.gr/search?q=${enc}`;
  if (d.includes('kotsovolos.gr')) return `https://www.kotsovolos.gr/search?q=${enc}`;
  if (d.includes('ofarmakopoiosmou.gr')) return `https://www.ofarmakopoiosmou.gr/search?q=${enc}`;
  if (d.includes('pharmacy295.gr')) return `https://www.pharmacy295.gr/search?q=${enc}`;
  if (d.includes('praktiker.gr')) return `https://www.praktiker.gr/search?q=${enc}`;
  if (d.includes('leroymerlin.gr')) return `https://www.leroymerlin.gr/gr/search?q=${enc}`;
  if (d.includes('autodoc.gr')) return `https://www.autodoc.gr/search?keyword=${enc}`;
  if (d.includes('politeianet.gr')) return `https://www.politeianet.gr/search?q=${enc}`;
  if (d.includes('amazon.')) return `https://www.${d}/s?k=${enc}`;
  if (d.includes('ebay.')) return `https://www.${d}/sch/i.html?_nkw=${enc}`;

  return `https://www.${d}/search?q=${enc}`;
}

/**
 * Robust category-aware fallback when AI is unavailable or offline.
 */
export function fallbackStoresForQuery(
  query: string,
  country = 'GR',
  opts: StoreContextOptions = {}
): StoreRecommendation {
  const q = query.toLowerCase();
  const c = country.toUpperCase();
  const stores: StoreTarget[] = [];
  const seenDomains = new Set<string>();

  const add = (name: string, domain: string, reason?: string) => {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    if (seenDomains.has(cleanDomain)) return;
    seenDomains.add(cleanDomain);
    stores.push({
      name,
      domain: cleanDomain,
      searchUrl: buildSearchUrl(cleanDomain, query),
      reason,
    });
  };

  let detectedCategory = 'general';

  // Keyword-based category classification
  const isPersonalCare = /toothpaste|toothbrush|shampoo|soap|cream|skincare|serum|vitamin|supplement|frezyderm|korres|oral-b|colgate|sensodyne|parodontax|pharmacy|cosmetic|deodorant|perfume/i.test(q);
  const isElectronics = /ssd|nvme|ram|gpu|cpu|rtx|geforce|radeon|motherboard|ddr\d|intel|amd|ryzen|laptop|monitor|screen|display|keyboard|mouse|headphone|headset|earbud|airpod|iphone|samsung|galaxy|xiaomi|pixel|router|switch|cable|ps5|playstation|xbox|nintendo/i.test(q);
  const isTools = /drill|saw|wrench|plier|hammer|bosch|makita|dewalt|stanley|screw|screwdriver|tool|hardware|lawn|mower/i.test(q);
  const isAuto = /tire|tyre|oil|engine|brake|wiper|car|motorcycle|filter|battery/i.test(q);
  const isBooks = /book|novel|paperback|hardcover|author|edition/i.test(q);

  if (isPersonalCare) detectedCategory = 'personal_care';
  else if (isElectronics) detectedCategory = 'electronics';
  else if (isTools) detectedCategory = 'tools';
  else if (isAuto) detectedCategory = 'automotive';
  else if (isBooks) detectedCategory = 'books';

  // Include user extraShops with high priority
  if (opts.extraShops && Array.isArray(opts.extraShops)) {
    for (const shop of opts.extraShops) {
      if (shop && typeof shop === 'string') {
        const clean = shop.trim().toLowerCase().replace(/^www\./, '');
        if (clean) add(clean, clean, 'Configured custom shop in Settings');
      }
    }
  }

  // Include user registered stores from DB if any
  if (opts.userStores && Array.isArray(opts.userStores)) {
    for (const st of opts.userStores) {
      if (st.name) {
        const d = st.domain || (st.url ? new URL(st.url).hostname.replace(/^www\./, '') : '');
        if (d) add(st.name, d, 'User registered store in Pharos');
      }
    }
  }

  if (c === 'GR') {
    // Skroutz & BestPrice are primary Greek price aggregators covering most retail
    add('Skroutz', 'skroutz.gr', 'General Greek price comparison aggregator');
    add('BestPrice', 'bestprice.gr', 'Greek price comparison portal');

    if (detectedCategory === 'personal_care') {
      add('OFarmakopoiosmou', 'ofarmakopoiosmou.gr', 'Major Greek online pharmacy');
      add('Pharmacy295', 'pharmacy295.gr', 'Greek online health & beauty pharmacy');
    } else if (detectedCategory === 'electronics') {
      add('Plaisio', 'plaisio.gr', 'Leading Greek technology and computer store');
      add('e-shop.gr', 'e-shop.gr', 'Greek electronics & hardware retailer');
      add('Amazon.de', 'amazon.de', 'Ships electronics and PC hardware to Greece');
    } else if (detectedCategory === 'tools') {
      add('Praktiker', 'praktiker.gr', 'Home improvement and DIY tools');
      add('Leroy Merlin', 'leroymerlin.gr', 'Hardware, building and tools');
    } else if (detectedCategory === 'automotive') {
      add('Autodoc', 'autodoc.gr', 'Automotive parts and accessories');
    } else if (detectedCategory === 'books') {
      add('Politeia', 'politeianet.gr', 'Major Greek book store');
      add('Public', 'public.gr', 'Books, stationery and media');
    } else {
      // General fallbacks
      add('Amazon.de', 'amazon.de', 'International marketplace shipping to Greece');
    }
  } else {
    // International / other country fallbacks
    add('Amazon', 'amazon.de', 'Regional marketplace');
    add('eBay', 'ebay.com', 'Online marketplace');
  }

  return { detectedCategory, stores: stores.slice(0, 6) };
}

/**
 * Resolve the best candidate stores for a product in a country using AI,
 * falling back gracefully to category heuristics if AI is offline or disabled.
 */
export async function resolveStoresForProduct(opts: {
  query: string;
  category?: string;
  country?: string;
  extraShops?: string[];
  userStores?: { name: string; url?: string; domain?: string }[];
}): Promise<StoreRecommendation> {
  const query = (opts.query || '').trim();
  const country = (opts.country || 'GR').toUpperCase();

  if (!query) {
    return { detectedCategory: 'unknown', stores: [] };
  }

  const prompt = `Analyze this product and select the top 3-4 most relevant online stores, marketplaces, or price aggregators in ${country} (plus foreign shops that reliably ship to ${country}) where this SPECIFIC product category is sold at competitive prices.

Product to find: "${query}"
Country: ${country}
${opts.category ? `Hint category: ${opts.category}` : ''}
${opts.extraShops?.length ? `User-configured stores: ${opts.extraShops.join(', ')}` : ''}

Rules:
1. Category Relevance: ONLY suggest stores that actually stock this item (e.g. cosmetics/toiletries belong in pharmacies or supermarkets or general marketplaces like Skroutz, NEVER in computer hardware stores; hardware/gadgets belong in tech stores like Plaisio/e-shop or Amazon).
2. For Greece (GR): Always consider Skroutz (skroutz.gr) and BestPrice (bestprice.gr) as strong general aggregators, alongside the best specialized stores for that category.
3. Return valid JSON only:
{
  "detectedCategory": "personal_care" | "electronics" | "tools" | "home" | "fashion" | "groceries" | "other",
  "stores": [
    {
      "name": "Store Name",
      "domain": "example.gr",
      "searchUrl": "https://www.example.gr/search?q=..."
    }
  ]
}`;

  try {
    const { json } = await runTextJSON(
      'You are an e-commerce price intelligence agent. Output ONLY JSON.',
      prompt,
      { feature: 'itemsImport' }
    );

    if (json && typeof json === 'object') {
      const parsed = json as {
        detectedCategory?: string;
        stores?: Array<{ name?: string; domain?: string; searchUrl?: string; reason?: string }>;
      };

      if (Array.isArray(parsed.stores) && parsed.stores.length > 0) {
        const stores: StoreTarget[] = [];
        const seen = new Set<string>();

        for (const s of parsed.stores) {
          if (!s.domain) continue;
          const cleanDomain = s.domain.toLowerCase().replace(/^www\./, '');
          if (seen.has(cleanDomain)) continue;
          seen.add(cleanDomain);

          const searchUrl = s.searchUrl && /^https?:\/\//i.test(s.searchUrl)
            ? s.searchUrl
            : buildSearchUrl(cleanDomain, query);

          stores.push({
            name: s.name || cleanDomain,
            domain: cleanDomain,
            searchUrl,
            reason: s.reason,
          });
        }

        if (stores.length > 0) {
          return {
            detectedCategory: parsed.detectedCategory || 'general',
            stores: stores.slice(0, 5),
          };
        }
      }
    }
  } catch {
    // AI offline / disabled / parsing failed -> graceful category-aware fallback
  }

  return fallbackStoresForQuery(query, country, {
    category: opts.category,
    extraShops: opts.extraShops,
    userStores: opts.userStores,
  });
}
