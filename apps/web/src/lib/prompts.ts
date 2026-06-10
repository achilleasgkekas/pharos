import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';

export type PromptKey = 'receipt' | 'statement' | 'product' | 'card' | 'subscription' | 'category' | 'expense' | 'voucher' | 'scraperPrice';

/** Default scraper price-extraction prompt. KEEP IN SYNC with the scraper's own copy at
 *  services/scraper/src/extract.ts (PROMPT). Shown here so Settings can display/reset it;
 *  the scraper reads any override from AppConfig.prompts.scraperPrice at runtime. */
export const DEFAULT_SCRAPER_PRICE_PROMPT = `You extract the CURRENT selling price of a product from a shop page.
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

/** Metadata for the Settings → AI Prompts editor. The DEFAULT text lives at each
 *  call site (lib/ollama.ts + the scraper); an override here replaces it wholesale. */
export const PROMPT_META: { key: PromptKey; label: string; where: string }[] = [
  { key: 'receipt', label: 'Receipt parsing', where: 'Receipts: upload, re-scan, email import' },
  { key: 'statement', label: 'Statement parsing', where: 'Statements: PDF import + re-scan' },
  { key: 'product', label: 'Product page', where: 'Items: URL import + AI fill from web' },
  { key: 'card', label: 'Card scan', where: 'Settings → cards: scan with camera' },
  { key: 'subscription', label: 'Subscription suggest', where: 'Subscriptions: AI fill from name' },
  { key: 'category', label: 'Transaction category', where: 'Statements: categorize transactions' },
  { key: 'expense', label: 'Expense / income', where: 'Expenses & Income: scan a bill / payslip' },
  { key: 'voucher', label: 'Voucher / coupon', where: 'Vouchers: scan a coupon' },
  { key: 'scraperPrice', label: 'Scraper price', where: 'Price scraper service: extract current price' },
];

let cache: { v: Record<string, string>; t: number } | null = null;
const TTL = 5000;

async function getOverrides(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.t < TTL) return cache.v;
  const v: Record<string, string> = {};
  try {
    await connectDB();
    const doc = await AppConfig.findOne({ key: 'singleton' }).select('prompts').lean();
    const p = (doc as { prompts?: Record<string, unknown> } | null)?.prompts;
    if (p && typeof p === 'object') {
      for (const [k, val] of Object.entries(p)) if (typeof val === 'string') v[k] = val;
    }
  } catch {
    /* DB unreachable → no overrides, fall back to built-in defaults */
  }
  cache = { v, t: Date.now() };
  return v;
}

/** A user's override for a prompt, or null → use the built-in default at the call site. */
export async function getPromptOverride(key: PromptKey): Promise<string | null> {
  const o = await getOverrides();
  const s = o[key];
  return typeof s === 'string' && s.trim().length > 0 ? s : null;
}

/** All overrides at once (for the Settings editor to show current values). */
export async function getAllPromptOverrides(): Promise<Record<string, string>> {
  return { ...(await getOverrides()) };
}

export function invalidatePromptsCache(): void {
  cache = null;
}
