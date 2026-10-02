import { runTextJSON } from '@/lib/ollama';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { SHOPPING_PRESETS } from '@/lib/shoppingRegion';

export type StoreTarget = {
  name: string;
  domain: string;
  searchUrl: string;
  reason?: string;
  source?: 'user_configured' | 'user_store' | 'market_default' | 'ai_suggested';
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
export function buildSearchUrl(domain: string, query: string): string {
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
 * Bilingual (EN / EL) category heuristic classification from query string and hint.
 */
export function detectCategoryFromQuery(query: string, hintCategory?: string): string {
  const q = query.toLowerCase();

  if (hintCategory && hintCategory !== 'other' && hintCategory !== 'general') {
    return hintCategory;
  }

  const isPersonalCare = /toothpaste|toothbrush|shampoo|soap|cream|skincare|serum|vitamin|supplement|frezyderm|korres|oral-b|colgate|sensodyne|parodontax|pharmacy|cosmetic|deodorant|perfume|οδοντοκρεμα|οδοντοβουρτσα|σαμπουαν|σαπουνι|κρεμα|βιταμινη|φαρμακειο|καλλυντικα|αρωμα|αποσμητικο/i.test(q);
  const isElectronics = /ssd|nvme|ram|gpu|cpu|rtx|geforce|radeon|motherboard|ddr\d|intel|amd|ryzen|laptop|monitor|screen|display|keyboard|mouse|headphone|headset|earbud|airpod|iphone|samsung|galaxy|xiaomi|pixel|router|switch|cable|ps5|playstation|xbox|nintendo|δισκος|οθονη|καρτα|επεξεργαστης|πληκτρολογιο|ποντικι|ακουστικα|κινητο|τηλεφωνο/i.test(q);
  const isTools = /drill|saw|wrench|plier|hammer|bosch|makita|dewalt|stanley|screw|screwdriver|tool|hardware|lawn|mower|δραπανο|τρυπανι|κατσαβιδι|εργαλειο/i.test(q);
  const isAuto = /tire|tyre|oil|engine|brake|wiper|car|motorcycle|filter|battery|ελαστικα|λαδι|μπαταρια|αυτοκινητο|μηχανη/i.test(q);
  const isBooks = /book|novel|paperback|hardcover|author|edition|βιβλιο|μυθιστορημα/i.test(q);

  if (isPersonalCare) return 'personal_care';
  if (isElectronics) return 'electronics';
  if (isTools) return 'tools';
  if (isAuto) return 'automotive';
  if (isBooks) return 'books';
  return 'general';
}

/**
 * Deterministic Store Selection Policy:
 * Ensures user-configured manual shops and registered stores are authoritative and
 * deterministically preserved alongside AI category discoveries and market aggregators.
 */
export function selectCandidateStores(opts: {
  query: string;
  country?: string;
  detectedCategory: string;
  aiStores?: StoreTarget[];
  extraShops?: string[];
  userStores?: { name: string; url?: string; domain?: string }[];
}): StoreTarget[] {
  const query = (opts.query || '').trim();
  const c = (opts.country || 'GR').toUpperCase();
  const stores: StoreTarget[] = [];
  const seenDomains = new Set<string>();

  const add = (
    name: string,
    domain: string,
    reason?: string,
    source: StoreTarget['source'] = 'market_default',
    customSearchUrl?: string
  ) => {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    if (!cleanDomain || seenDomains.has(cleanDomain)) return;
    seenDomains.add(cleanDomain);
    stores.push({
      name,
      domain: cleanDomain,
      searchUrl: customSearchUrl && /^https?:\/\//i.test(customSearchUrl)
        ? customSearchUrl
        : buildSearchUrl(cleanDomain, query),
      reason,
      source,
    });
  };

  // 1. Authoritative: user-configured extra shops (Settings -> Defaults)
  if (opts.extraShops && Array.isArray(opts.extraShops)) {
    for (const shop of opts.extraShops) {
      if (shop && typeof shop === 'string') {
        const clean = shop.trim().toLowerCase().replace(/^www\./, '');
        if (clean) add(clean, clean, 'Configured custom shop in Settings', 'user_configured');
      }
    }
  }

  // 2. Authoritative: registered user stores from database
  if (opts.userStores && Array.isArray(opts.userStores)) {
    for (const st of opts.userStores) {
      if (st.name) {
        let d = st.domain;
        if (!d && st.url) {
          try {
            d = new URL(st.url).hostname.replace(/^www\./, '');
          } catch {
            // ignore malformed store URL
          }
        }
        if (d) add(st.name, d, 'User registered store in Pharos', 'user_store');
      }
    }
  }

  // 3. AI recommendations (if provided)
  const hasAiStores = opts.aiStores && Array.isArray(opts.aiStores) && opts.aiStores.length > 0;
  if (hasAiStores) {
    for (const s of opts.aiStores!) {
      if (s.domain) {
        add(
          s.name || s.domain,
          s.domain,
          s.reason || 'AI category intelligence suggestion',
          'ai_suggested',
          s.searchUrl
        );
      }
    }
  }

  // 4. Country market defaults & category-specific aggregators (when AI is not providing stores)
  if (!hasAiStores) {
    if (c === 'GR') {
      // Primary aggregators for Greece
      add('Skroutz', 'skroutz.gr', 'General Greek price comparison aggregator', 'market_default');
      add('BestPrice', 'bestprice.gr', 'Greek price comparison portal', 'market_default');

      // Category-specific stores
      const cat = opts.detectedCategory;
      if (cat === 'personal_care') {
        add('OFarmakopoiosmou', 'ofarmakopoiosmou.gr', 'Major Greek online pharmacy', 'market_default');
        add('Pharmacy295', 'pharmacy295.gr', 'Greek online health & beauty pharmacy', 'market_default');
      } else if (cat === 'electronics') {
        add('Plaisio', 'plaisio.gr', 'Leading Greek technology and computer store', 'market_default');
        add('e-shop.gr', 'e-shop.gr', 'Greek electronics & hardware retailer', 'market_default');
        add('Amazon.de', 'amazon.de', 'Ships electronics and PC hardware to Greece', 'market_default');
      } else if (cat === 'tools') {
        add('Praktiker', 'praktiker.gr', 'Home improvement and DIY tools', 'market_default');
        add('Leroy Merlin', 'leroymerlin.gr', 'Hardware, building and tools', 'market_default');
      } else if (cat === 'automotive') {
        add('Autodoc', 'autodoc.gr', 'Automotive parts and accessories', 'market_default');
      } else if (cat === 'books') {
        add('Politeia', 'politeianet.gr', 'Major Greek book store', 'market_default');
        add('Public', 'public.gr', 'Books, stationery and media', 'market_default');
      } else {
        add('Amazon.de', 'amazon.de', 'International marketplace shipping to Greece', 'market_default');
      }
    } else {
      // Other country presets / defaults
      const preset = SHOPPING_PRESETS[c];
      if (preset?.extraShops?.length) {
        for (const shop of preset.extraShops) {
          add(shop, shop, `Default regional marketplace for ${c}`, 'market_default');
        }
      } else {
        add('Amazon', 'amazon.de', 'Regional marketplace', 'market_default');
        add('eBay', 'ebay.com', 'Online marketplace', 'market_default');
      }
    }
  }

  return stores;
}

/**
 * Robust category-aware fallback when AI is unavailable or offline.
 */
export function fallbackStoresForQuery(
  query: string,
  country = 'GR',
  opts: StoreContextOptions = {}
): StoreRecommendation {
  const detectedCategory = detectCategoryFromQuery(query, opts.category);
  const stores = selectCandidateStores({
    query,
    country,
    detectedCategory,
    extraShops: opts.extraShops,
    userStores: opts.userStores,
  });

  return { detectedCategory, stores };
}

/**
 * Resolve the best candidate stores for a product in a country using AI,
 * deterministically preserving user-configured manual shops and registered stores,
 * and falling back gracefully to category heuristics if AI is offline or disabled.
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
    // The product AI switch covers this too: with it off, the category fallback below answers.
    if (!(await isFeatureEnabled('itemsImport'))) throw new Error('Product AI is turned off');
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

      const aiStores: StoreTarget[] = [];
      if (Array.isArray(parsed.stores)) {
        for (const s of parsed.stores) {
          if (!s.domain) continue;
          const cleanDomain = s.domain.toLowerCase().replace(/^www\./, '');
          aiStores.push({
            name: s.name || cleanDomain,
            domain: cleanDomain,
            searchUrl: s.searchUrl && /^https?:\/\//i.test(s.searchUrl)
              ? s.searchUrl
              : buildSearchUrl(cleanDomain, query),
            reason: s.reason,
            source: 'ai_suggested',
          });
        }
      }

      const detectedCategory = parsed.detectedCategory || detectCategoryFromQuery(query, opts.category);
      const stores = selectCandidateStores({
        query,
        country,
        detectedCategory,
        aiStores,
        extraShops: opts.extraShops,
        userStores: opts.userStores,
      });

      if (stores.length > 0) {
        return { detectedCategory, stores };
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

