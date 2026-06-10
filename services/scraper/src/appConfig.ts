import mongoose, { Schema } from 'mongoose';

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
