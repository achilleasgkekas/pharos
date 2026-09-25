import mongoose, { Schema } from 'mongoose';
import { normalizeScrapeScope, DEFAULT_OWNED_INTERVAL_DAYS, type ScrapeScope } from './scrapeOrder.js';
import { marketFor, normalizeShoppingCountry, normalizeShopList, type ShoppingMarket } from './shoppingRegion.js';

// Read-only view of the web app's AppConfig singleton (collection `appconfigs`).
// We only need the scraper-relevant fields, so the schema is loose (strict:false)
// and we never write to it — Settings in the web app owns these values.
const AppConfigSchema = new Schema({ key: String }, { collection: 'appconfigs', strict: false });
const AppConfigModel = mongoose.models.AppConfig || mongoose.model('AppConfig', AppConfigSchema);

export type ScraperAiResolved = {
  provider: 'ollama' | 'anthropic';
  model: string; // resolved, never empty
  anthropicApiKey: string;
  pricePrompt: string | null; // override text, or null → use the built-in default
};

let cache: { v: ScraperAiResolved; t: number } | null = null;
const TTL = 60_000; // refresh each minute so Settings changes apply between passes

/** Resolve which AI the scraper should use, from the shared AppConfig (falling back
 *  to env defaults if the doc/fields are missing or the DB read fails). */
export async function getScraperAiConfig(defaults: { ollamaModel: string }): Promise<ScraperAiResolved> {
  if (cache && Date.now() - cache.t < TTL) return cache.v;

  let v: ScraperAiResolved = {
    provider: 'ollama',
    model: defaults.ollamaModel,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    pricePrompt: null,
  };

  try {
    const doc = (await AppConfigModel.findOne({ key: 'singleton' }).lean()) as Record<string, unknown> | null;
    if (doc) {
      const provider = doc.scraperProvider === 'anthropic' ? 'anthropic' : 'ollama';
      const scraperModel = typeof doc.scraperModel === 'string' ? doc.scraperModel.trim() : '';
      const anthropicModel = typeof doc.anthropicModel === 'string' ? doc.anthropicModel.trim() : '';
      const prompts = (doc.prompts && typeof doc.prompts === 'object' ? doc.prompts : {}) as Record<string, unknown>;
      const override = prompts.scraperPrice;
      v = {
        provider,
        model:
          provider === 'anthropic'
            ? scraperModel || anthropicModel || 'claude-3-5-haiku-latest'
            : scraperModel || defaults.ollamaModel,
        anthropicApiKey:
          (typeof doc.anthropicApiKey === 'string' && doc.anthropicApiKey) || process.env.ANTHROPIC_API_KEY || '',
        pricePrompt: typeof override === 'string' && override.trim() ? override : null,
      };
    }
  } catch {
    // DB unreachable or doc missing → env defaults above
  }

  cache = { v, t: Date.now() };
  return v;
}

/**
 * The shopping market saved in Settings (#319), or null when no country is chosen. Deal and
 * price-drop alerts only count shops inside it, like the web app's bell and push. Read fresh each
 * pass (one small query) so a Settings change applies on the next run.
 */
export async function getShoppingMarket(): Promise<ShoppingMarket | null> {
  try {
    const doc = (await AppConfigModel.findOne({ key: 'singleton' }).select('shoppingCountry shoppingExtraShops').lean()) as Record<string, unknown> | null;
    return marketFor(normalizeShoppingCountry(doc?.shoppingCountry), normalizeShopList(doc?.shoppingExtraShops));
  } catch {
    return null; // DB unreachable → no filter, the pre-#319 behaviour
  }
}

/**
 * Which items to scrape (#330): the scope and how often owned items are re-checked, from
 * Settings → Scraper. Read fresh each pass; defaults (both, 7 days) if the DB is unreachable.
 */
export async function getScrapeScope(): Promise<{ scope: ScrapeScope; ownedIntervalDays: number }> {
  try {
    const doc = (await AppConfigModel.findOne({ key: 'singleton' }).select('scraperScope scraperOwnedIntervalDays').lean()) as Record<string, unknown> | null;
    const days = Number(doc?.scraperOwnedIntervalDays);
    return { scope: normalizeScrapeScope(doc?.scraperScope), ownedIntervalDays: Number.isFinite(days) ? days : DEFAULT_OWNED_INTERVAL_DAYS };
  } catch {
    return { scope: 'both', ownedIntervalDays: DEFAULT_OWNED_INTERVAL_DAYS };
  }
}
