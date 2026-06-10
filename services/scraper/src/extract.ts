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

const PROMPT = `You extract the CURRENT selling price of a product from a shop page.
Return ONLY JSON: {"price": <number or null>, "currency": "EUR", "inStock": <bool>}.
Price priority (use the first that applies):
1. A "PRODUCT PRICE (from the page's price markup): …" line, if present, IS the price.
2. else the schema.org JSON-LD "offers" price — but if it is net/ex-VAT (valueAddedTaxIncluded:false), use the VAT-included price shown on the page instead.
3. else the price next to the MAIN product — IGNORE related/accessory products listed elsewhere.
Rules:
- The price the customer PAYS now, VAT/sales-tax included, after any discount (not list/strikethrough). Prefer the tax-included figure ("incl. VAT", "με ΦΠΑ", "inkl. MwSt", "TTC"); ignore the net/ex-tax price ("excl. VAT", "χωρίς ΦΠΑ", "HT").
- The decimal separator may be a comma (EU "1.234,56 €" = 1234.56) or a dot (US/UK "1,234.56"). Always output a dot decimal.
- If out of stock or no price is shown, price = null and inStock = false.
- Do not invent a price. JSON only, no markdown.`;

function stripFences(s: string): string {
  return s.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
}

/** Ask the configured model (Ollama or Anthropic) for the current price on a page.
 *  Provider, model and the prompt are read from the shared AppConfig (Settings). */
export async function extractPrice(page: ScrapedPage): Promise<ExtractedPrice> {
  const ai = await getScraperAiConfig({ ollamaModel: config.ollamaModel });
  const system = ai.pricePrompt ?? PROMPT;
  const content = [
    page.jsonLd ? `JSON-LD:\n${page.jsonLd}` : '',
    `TITLE: ${page.title}`,
    `PAGE TEXT:\n${page.text}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  if (ai.provider === 'anthropic' && ai.anthropicApiKey) {
    const json = await anthropicPriceJSON({ apiKey: ai.anthropicApiKey, model: ai.model, system, user: content });
    return PriceSchema.parse(json);
  }

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
  return PriceSchema.parse(JSON.parse(stripFences(raw)));
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
