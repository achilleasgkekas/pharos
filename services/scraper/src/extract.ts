import { Ollama } from 'ollama';
import { z } from 'zod';
import { config } from './config.js';
import type { ScrapedPage } from './scrape.js';
import { getScraperAiConfig } from './appConfig.js';
import { anthropicPriceJSON } from './anthropic.js';

const ollama = new Ollama({ host: config.ollamaHost });

const PriceSchema = z.object({
  price: z.coerce.number().nonnegative().nullable().catch(null),
  currency: z.string().default('EUR'),
  inStock: z.boolean().default(true),
});
export type ExtractedPrice = z.infer<typeof PriceSchema>;

const PROMPT = `Language: write descriptive output in English. Preserve proper names, merchant/product names, URLs and codes.
You extract the CURRENT selling price of a product from a shop page.
Return ONLY JSON: {"price": <number or null>, "currency": "EUR", "inStock": <bool>}.
Price priority (use the first that applies):
1. A "PRODUCT PRICE (from the page's price markup): …" line, if present, IS the price.
2. else the schema.org JSON-LD "offers" price — but if it is net/ex-VAT (valueAddedTaxIncluded:false), use the VAT-included price shown on the page instead.
3. else the price next to the MAIN product — IGNORE related/accessory products listed elsewhere.
Rules:
- The price the customer PAYS now, VAT/sales-tax included, after any discount (not list/strikethrough). Prefer the tax-included figure ("incl. VAT", "tax included", "inkl. MwSt", "TTC"); ignore the net/ex-tax price ("excl. VAT", "tax excluded", "HT").
- The decimal separator may be a comma (EU "1.234,56 €" = 1234.56) or a dot (US/UK "1,234.56"). Always output a dot decimal.
- If out of stock or no price is shown, price = null and inStock = false.
- Do not invent a price. JSON only, no markdown.`;

function stripFences(s: string): string {
  return s.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
}

/** The AI call itself failed (as opposed to fetching the page); run.ts reports it to Settings. */
export class AiCallError extends Error {
  constructor(message: string, readonly model: string) {
    super(message);
    this.name = 'AiCallError';
  }
}

import { connect, AiRun } from './db.js';
import { rateForModel, PRICE_VERSION } from './claudePricing.js';

export type ExtractPriceMeta = {
  record?: { type: string; id: string };
  trigger?: 'user' | 'job' | 'cron' | 'email' | 'api';
};

async function recordAiRunSafe(run: {
  feature: string;
  provider: string;
  model: string;
  status: 'ok' | 'error' | 'blocked';
  durationMs: number;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
  };
  costMicros?: number;
  requestId?: string;
  stopReason?: string;
  trigger?: 'user' | 'job' | 'cron' | 'email' | 'api';
  record?: { type: string; id: string };
}): Promise<void> {
  try {
    await connect();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await AiRun.create({
      ...run,
      priceVersion: PRICE_VERSION,
      expiresAt,
    });
  } catch {
    /* never break scraper operations on run history write errors */
  }
}

/** Ask the configured model (Ollama or Anthropic) for the current price on a page.
 *  Provider, model and the prompt are read from the shared AppConfig (Settings). */
export async function extractPrice(page: ScrapedPage, meta?: ExtractPriceMeta): Promise<ExtractedPrice> {
  const ai = await getScraperAiConfig({ ollamaModel: config.ollamaModel });
  const system = ai.pricePrompt ?? PROMPT;
  const content = [
    page.jsonLd ? `JSON-LD:\n${page.jsonLd}` : '',
    `TITLE: ${page.title}`,
    `PAGE TEXT:\n${page.text}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const t0 = Date.now();
  const trigger = meta?.trigger ?? 'cron';

  if (ai.provider === 'anthropic' && ai.anthropicApiKey) {
    let res;
    try {
      res = await anthropicPriceJSON({ apiKey: ai.anthropicApiKey, model: ai.model, system, user: content });
    } catch (err) {
      void recordAiRunSafe({
        feature: 'scraperPrice',
        provider: 'anthropic',
        model: ai.model,
        status: 'error',
        durationMs: Date.now() - t0,
        error: (err as Error).message,
        trigger,
        record: meta?.record,
      });
      throw new AiCallError((err as Error).message, ai.model);
    }

    const rate = rateForModel(ai.model);
    const costMicros = Math.round(
      ((res.usage.inputTokens * rate.input +
        res.usage.outputTokens * rate.output +
        (res.usage.cacheWriteTokens ?? 0) * (rate.cacheWrite5m ?? 0) +
        (res.usage.cacheReadTokens ?? 0) * (rate.cacheRead ?? 0)) /
        1_000_000) *
        1_000_000
    );

    void recordAiRunSafe({
      feature: 'scraperPrice',
      provider: 'anthropic',
      model: ai.model,
      status: 'ok',
      durationMs: Date.now() - t0,
      usage: res.usage,
      costMicros,
      requestId: res.requestId,
      stopReason: res.stopReason,
      trigger,
      record: meta?.record,
    });

    return PriceSchema.parse(res.json);
  }

  try {
    const res = await ollama.chat({
      model: ai.model,
      format: 'json',
      keep_alive: '30m',
      options: { temperature: 0, num_ctx: config.numCtx },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
    });
    const raw = res.message.content;
    void recordAiRunSafe({
      feature: 'scraperPrice',
      provider: 'ollama',
      model: ai.model,
      status: 'ok',
      durationMs: Date.now() - t0,
      usage: {
        inputTokens: res.prompt_eval_count ?? 0,
        outputTokens: res.eval_count ?? 0,
      },
      costMicros: 0,
      trigger,
      record: meta?.record,
    });
    return PriceSchema.parse(JSON.parse(stripFences(raw)));
  } catch (err) {
    void recordAiRunSafe({
      feature: 'scraperPrice',
      provider: 'ollama',
      model: ai.model,
      status: 'error',
      durationMs: Date.now() - t0,
      error: (err as Error).message,
      trigger,
      record: meta?.record,
    });
    throw err;
  }
}

/** Is the given Ollama model installed and reachable? (model defaults to env config). */
export async function isOllamaHealthy(model: string = config.ollamaModel): Promise<boolean> {
  try {
    const list = await ollama.list();
    return list.models.some((m) => m.name === model || m.model === model);
  } catch {
    return false;
  }
}
