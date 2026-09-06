import { Ollama } from 'ollama';
import { BILLING_CYCLE_VALUES, RECURRING_CYCLE_VALUES } from '@/lib/billingCycle';
import { z } from 'zod';
import { STORE_NAMES } from './stores';
import { resolveStore } from './storeService';
import { getAiConfig, scraperConfig } from './aiConfig';
import { anthropicJSON } from './anthropic';
import { openaiCompatJSON, geminiJSON } from './aiProviders';
import { getPromptOverride } from './prompts';
import { assertAiQuota, meterAiResult } from './billing/aiMeter';
import { assertAiBudget, recordAiSpend } from './aiBudget';

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5vl:7b';
// Keep the model resident in (V)RAM so the 2nd+ request skips the ~15s cold load.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? '30m';
// Context window. Ollama's default (often 2-4k tokens) truncates large product/receipt
// pages, and the model then emits broken/half JSON. 8k comfortably fits our prompts.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);

export const ollama = new Ollama({ host: OLLAMA_HOST });

/** Ollama client for the configured host (same machine or anywhere on the network). */
function clientFor(host?: string): Ollama {
  return host && host !== OLLAMA_HOST ? new Ollama({ host }) : ollama;
}

export function getOllamaModel() {
  return OLLAMA_MODEL;
}

// ─── Generic helpers (reused by receipts, statements, categorization) ───────

/**
 * Strip markdown code fences before `JSON.parse`. Removes any `` ```json `` opener
 * (anywhere, not just at the start) and a trailing `` ``` `` at end-of-string, then
 * trims. NOTE: unlike anthropic/aiProviders `stripFences`, this does NOT remove a
 * bare leading `` ``` `` (one without the `json` tag) — only the `json`-tagged form.
 * Exported for tests.
 */
export function stripFences(raw: string): string {
  return raw.replace(/```json\s*|```\s*$/g, '').trim();
}

/**
 * Run a vision+text prompt and return parsed JSON. Throws with a clear message
 * on transport / model / JSON errors so callers can surface it to the user.
 */
/** Route a JSON task to the configured CLOUD provider, or null → caller uses Ollama. */
async function cloudJSON(
  cfg: Awaited<ReturnType<typeof getAiConfig>>,
  system: string,
  user: string,
  imagesBase64?: string[]
): Promise<{ json: unknown; raw: string; model: string; usage?: { inputTokens: number; outputTokens: number } } | null> {
  switch (cfg.provider) {
    case 'anthropic':
      return anthropicJSON({ apiKey: cfg.anthropicApiKey, workspaceId: cfg.anthropicWorkspaceId, model: cfg.anthropicModel, system, user, imagesBase64 });
    case 'openai':
      return openaiCompatJSON({ baseUrl: 'https://api.openai.com/v1', apiKey: cfg.openaiApiKey, model: cfg.openaiModel, system, user, imagesBase64 });
    case 'openrouter':
      return openaiCompatJSON({ baseUrl: 'https://openrouter.ai/api/v1', apiKey: cfg.openrouterApiKey, model: cfg.openrouterModel, system, user, imagesBase64 });
    case 'custom':
      return openaiCompatJSON({ baseUrl: cfg.customBaseUrl, apiKey: cfg.customApiKey, model: cfg.customModel, system, user, imagesBase64 });
    case 'gemini':
      return geminiJSON({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel, system, user, imagesBase64 });
    default:
      return null; // ollama
  }
}

export async function runVisionJSON(
  systemPrompt: string,
  userPrompt: string,
  imagesBase64: string[]
): Promise<{ json: unknown; raw: string; model: string }> {
  const cfg = await getAiConfig();
  // Master switch off → never hit a provider. Call sites gate per-feature first and
  // give friendly messages; this is the last-resort guard so nothing slips through.
  if (!cfg.aiEnabled) throw new Error('AI is turned off');
  // SaaS metering: block an over-quota tenant before any provider cost is incurred.
  // No-op for the self-hosted default tenant / SAAS_MODE off / BYO-key tenants.
  await assertAiQuota();
  // Self-hosted spend cap: block a CLOUD call once this month's estimated AI spend reaches the
  // configured budget. No-op in SaaS mode and for local Ollama (free).
  if (cfg.provider !== 'ollama') await assertAiBudget();
  const cloud = await cloudJSON(cfg, systemPrompt, userPrompt, imagesBase64);
  if (cloud) {
    await recordAiSpend(cloud.model, cloud.usage?.inputTokens ?? 0, cloud.usage?.outputTokens ?? 0);
    await meterAiResult({ inputTokens: cloud.usage?.inputTokens, outputTokens: cloud.usage?.outputTokens });
    return cloud;
  }
  // Vision tasks must run on a vision-capable model, not the active text model.
  const visionModel = cfg.ollamaVisionModel;
  const response = await clientFor(cfg.ollamaHost).chat({
    model: visionModel,
    keep_alive: KEEP_ALIVE,
    format: 'json',
    options: { temperature: 0.1, num_ctx: NUM_CTX },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt, images: imagesBase64 },
    ],
  });
  const raw = response.message.content;
  const result = { json: JSON.parse(stripFences(raw)), raw, model: visionModel };
  await meterAiResult();
  return result;
}

/** Run a text-only prompt and return parsed JSON. `numCtx` lets long inputs (e.g.
 *  multi-page statements) use a bigger local context window so transactions at the
 *  end aren't truncated away. */
async function runTextJSONWith(
  cfg: Awaited<ReturnType<typeof getAiConfig>>,
  systemPrompt: string,
  userPrompt: string,
  opts?: { numCtx?: number }
): Promise<{ json: unknown; raw: string; model: string }> {
  if (!cfg.aiEnabled) throw new Error('AI is turned off');
  // SaaS metering: block an over-quota tenant before any provider cost is incurred.
  // No-op for the self-hosted default tenant / SAAS_MODE off / BYO-key tenants.
  await assertAiQuota();
  // Self-hosted spend cap: block a CLOUD call once this month's estimated AI spend reaches the
  // configured budget. No-op in SaaS mode and for local Ollama (free).
  if (cfg.provider !== 'ollama') await assertAiBudget();
  const cloud = await cloudJSON(cfg, systemPrompt, userPrompt);
  if (cloud) {
    await recordAiSpend(cloud.model, cloud.usage?.inputTokens ?? 0, cloud.usage?.outputTokens ?? 0);
    await meterAiResult({ inputTokens: cloud.usage?.inputTokens, outputTokens: cloud.usage?.outputTokens });
    return cloud;
  }
  const response = await clientFor(cfg.ollamaHost).chat({
    model: cfg.ollamaModel,
    keep_alive: KEEP_ALIVE,
    format: 'json',
    options: { temperature: 0.1, num_ctx: opts?.numCtx ?? NUM_CTX },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const raw = response.message.content;
  const result = { json: JSON.parse(stripFences(raw)), raw, model: cfg.ollamaModel };
  await meterAiResult();
  return result;
}

export async function runTextJSON(
  systemPrompt: string,
  userPrompt: string,
  opts?: { numCtx?: number }
): Promise<{ json: unknown; raw: string; model: string }> {
  return runTextJSONWith(await getAiConfig(), systemPrompt, userPrompt, opts);
}

/** Like runTextJSON but on the SEPARATE 'scraper' model (Settings → Scraper AI): product/
 *  price extraction is a simple text task, so it runs on a lighter/cheaper model (or local
 *  Ollama) than the heavy receipt/statement parses. See scraperConfig() in aiConfig.ts. */
export async function runScraperTextJSON(
  systemPrompt: string,
  userPrompt: string,
  opts?: { numCtx?: number }
): Promise<{ json: unknown; raw: string; model: string }> {
  return runTextJSONWith(scraperConfig(await getAiConfig()), systemPrompt, userPrompt, opts);
}

// ─── Receipt parsing ────────────────────────────────────────────────────────

export const ParsedReceiptSchema = z.object({
  store: z.string(),
  date: z.string(),
  total: z.coerce.number(), // gross (with VAT)
  subtotal: z.coerce.number().default(0), // net (without VAT)
  vatAmount: z.coerce.number().default(0), // VAT amount
  warrantyMonths: z.coerce.number().default(0), // 0 = use default (24 in GR)
  currency: z.string().default('EUR'),
  paymentMethod: z.string().optional().default(''),
  lineItems: z
    .array(
      z.object({
        name: z.string(),
        refinedName: z.string().optional().default(''),
        qty: z.coerce.number().default(1),
        price: z.coerce.number().default(0),
        vatRate: z.coerce.number().default(24),
      })
    )
    .default([]),
});

export type ParsedReceipt = z.infer<typeof ParsedReceiptSchema>;

export const RECEIPT_SYSTEM_PROMPT = `You are a receipt parser. Extract structured data from receipt images.
Receipts may be in ANY language (English, Greek, German, French, Italian, Spanish, ...). Return ONLY valid JSON, no markdown, no explanation.

Schema:
{
  "store": "store/merchant name",
  "date": "YYYY-MM-DD",
  "total": <number, GROSS amount paid, with VAT>,
  "subtotal": <number, NET amount without VAT, 0 if not shown>,
  "vatAmount": <number, the VAT/ΦΠΑ amount, 0 if not shown>,
  "warrantyMonths": <number, warranty in months IF printed on the receipt, else 0>,
  "currency": "EUR" | "USD" | "GBP",
  "paymentMethod": "Mastercard 1234" | "Cash" | "VISA" etc,
  "lineItems": [
    {"name": "raw text exactly as printed", "refinedName": "proper full product name", "qty": <number>, "price": <NET unit price WITHOUT VAT>, "vatRate": <VAT % for this item>}
  ]
}

Rules:
- store: ALWAYS identify it — this is critical. Look at the logo, the largest text at the top, the website/domain, the tax id (VAT no. / ΑΦΜ / USt-IdNr / SIRET), the products' brand, and any footer URL. Prefer the commercial brand over the legal entity (drop suffixes like "Ltd"/"Inc"/"GmbH"/"SARL"/"SA"/"Srl"/"ΑΕ"/"ΕΠΕ"/"ΜΟΝ. ΙΚΕ").
- Return a name from this KNOWN list ONLY when that store's own brand, logo, or website domain is ACTUALLY printed on the receipt: ${STORE_NAMES.join(', ')}. (e.g. a kotsovolos.gr footer → "Κωτσόβολος".)
- CRITICAL — do NOT GUESS. If the printed company/legal name (often a Greek ΑΦΜ-registered name like "ΚΑΠΕΤΑΝΟΠΟΥΛΟΣ ΔΑΝΙΗΛΙΔΟΥ") is not one you can confidently tie to a brand above, return THAT printed name VERBATIM. Never substitute a different well-known store you were not actually shown — the app maps legal names to brands itself.
- Never leave store empty. If truly unknown, return the most prominent name printed at the top.
- warrantyMonths: only if the receipt explicitly states a warranty period (e.g. "2 years warranty", "Εγγύηση 24 μήνες", "24 Monate Garantie", "garantie 2 ans"); otherwise 0.
- date: CRITICAL — always find it. Scan the WHOLE image (usually top or top-right, near the document number) for a date label ("Date", "ΗΜΕΡΟΜΗΝΙΑ"/"ΗΜ. ΕΚΔΟΣΗΣ", "Datum", "Fecha", "Data") or a bare date pattern. Output it as YYYY-MM-DD. Read the YEAR digits carefully (e.g. 23/09/2025 → "2025-09-23", NOT 2018 or 2026). Only leave it empty if no date is printed anywhere.
- Date order: most of the world is DAY-FIRST (DD/MM/YYYY — all of Europe, including Greece); the US is MONTH-FIRST (MM/DD/YYYY). If the first group is >12 it must be the day. e.g. a European "03/04/2026" = 3 April → "2026-04-03".
- Numbers: the decimal separator may be a comma (most of Europe: "12,50" = 12.50) or a dot (US/UK). The thousands separator is the other one ("1.234,56" = 1234.56). Always output a dot decimal.
- total = grand total paid, VAT included ("Total", "ΣΥΝΟΛΟ"/"ΤΕΛΙΚΟ ΣΥΝΟΛΟ", "Gesamt", "Totale", "Total TTC"). subtotal = net / before tax ("Subtotal", "Net", "ΚΑΘΑΡΗ ΑΞΙΑ", "Netto", "HT"). vatAmount = the sales tax ("VAT"/"Tax", "ΦΠΑ", "MwSt"/"USt", "TVA", "IVA").
- If subtotal/vat not shown but a VAT rate is (e.g. 24%): subtotal = total/(1+rate), vatAmount = total - subtotal.
- vatRate: per-item VAT/sales-tax rate as a number. Rates vary by country (Greece 24/13/6, Germany 19/7, France 20/10/5.5, UK 20, US varies). A Greek receipt may print a VAT category letter (Α=24, Β=13, Γ=6). Use the rate shown; if none is shown, use 24.
- refinedName: expand the abbreviated receipt text into the FULL canonical product name as found on retail/manufacturer sites. Example: "WD BLUE SN570 250" → "WD Blue SN570 250GB NVMe SSD"; "RTX5080 GAM OC" → "NVIDIA GeForce RTX 5080 Gaming OC". Keep brand + model + key spec. If it is a generic item (coffee, milk), keep it simple.
- If a field is unreadable, use empty string or 0`;

export async function parseReceipt(imageBase64: string): Promise<{
  parsed: ParsedReceipt;
  raw: string;
  model: string;
}> {
  const { json, raw, model } = await runVisionJSON(
    (await getPromptOverride('receipt')) ?? RECEIPT_SYSTEM_PROMPT,
    'Extract the receipt data as JSON. Be sure to find the purchase DATE (search the top of the receipt for a date label like "Date" / "ΗΜΕΡΟΜΗΝΙΑ" / "Datum" or a DD/MM/YYYY pattern) and read its year digits exactly.',
    [imageBase64]
  );
  const parsed = ParsedReceiptSchema.parse(json);
  parsed.store = await resolveStore(parsed.store);
  return { parsed, raw, model };
}

/** Parse a receipt from extracted PDF text (digital / e-receipts). */
export async function parseReceiptText(text: string): Promise<{
  parsed: ParsedReceipt;
  raw: string;
  model: string;
}> {
  const { json, raw, model } = await runTextJSON(
    (await getPromptOverride('receipt')) ?? RECEIPT_SYSTEM_PROMPT,
    `Extract the receipt data as JSON from this text:\n\n${text}`
  );
  const parsed = ParsedReceiptSchema.parse(json);
  parsed.store = await resolveStore(parsed.store);
  return { parsed, raw, model };
}

// ─── Statement (credit card) parsing ────────────────────────────────────────

export const ParsedStatementSchema = z.object({
  card: z.string().default(''),
  last4: z.string().default(''),
  period: z.string().default(''), // YYYY-MM
  statementDate: z.string().default(''),
  dueDate: z.string().default(''),
  totalAmount: z.coerce.number().default(0),
  minimumPayment: z.coerce.number().default(0),
  transactions: z
    .array(
      z.object({
        date: z.string(),
        description: z.string(),
        amount: z.coerce.number(),
        currentInstallment: z.coerce.number().optional(),
        totalInstallments: z.coerce.number().optional(),
      })
    )
    .default([]),
});

export type ParsedStatement = z.infer<typeof ParsedStatementSchema>;

export const STATEMENT_SYSTEM_PROMPT = `You parse credit-card statements in ANY language (English, Greek, German, French, ...).
Return ONLY valid JSON, no markdown.

Schema:
{
  "card": "card name (bank + network)",
  "last4": "the last 4 digits of the card number",
  "period": "YYYY-MM that the statement covers",
  "statementDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD payment due date (Payment due / λήξη)",
  "totalAmount": <number, the CURRENT balance you owe now (New balance / ΝΕΟ ΥΠΟΛΟΙΠΟ / ΠΛΗΡΩΤΕΟ ΠΟΣΟ), NOT the previous balance>,
  "minimumPayment": <number, minimum payment due / ελάχιστη καταβολή>,
  "transactions": [
    {"date":"YYYY-MM-DD","description":"merchant","amount":<number>,"currentInstallment":<n?>,"totalInstallments":<n?>}
  ]
}

Rules:
- card: the BANK + card network only (e.g. "Chase Visa", "Barclays Mastercard", "Πειραιώς Mastercard", "Alpha Bank Visa"). NEVER use the cardholder's personal name (the ALL-CAPS holder name on the statement is the holder, not the card). If the bank is unclear, use just the network ("Mastercard"/"Visa").
- totalAmount: the CURRENT amount owed now — "New balance" / "Total amount due" / "ΝΕΟ ΥΠΟΛΟΙΠΟ" / "ΣΥΝΟΛΙΚΗ ΟΦΕΙΛΗ" / "ΠΛΗΡΩΤΕΟ ΠΟΣΟ" / "Neuer Saldo". NEVER the "Previous balance" / "ΠΡΟΗΓΟΥΜΕΝΟ ΥΠΟΛΟΙΠΟ". These appear close together — pick the NEW/current one.
- Date order: most countries are DAY-FIRST (DD/MM/YYYY — all of Europe, incl. Greece): "03/04/2026" = 3 April 2026 → "2026-04-03" (NOT 4 March). The US is MONTH-FIRST. If the first group is >12 it must be the day. Read the YEAR exactly; do NOT assume the previous year.
- statementDate: the issue date of THIS / the newest statement — "Statement date" / "ΗΜΕΡΟΜΗΝΙΑ ΕΚΔΟΣΗΣ". A statement header usually shows TWO dates side by side: the current issue date and, next to it, the PREVIOUS statement's date ("Previous statement" / "ΠΡΟΗΓΟΥΜΕΝΗ ΕΚΔΟΣΗ"). ALWAYS pick the LATER/more-recent of the two — that is the current issue date. NEVER the previous/earlier one.
- period: the month the statement covers, derived from the CURRENT statementDate (the later date). Same year as statementDate.
- last4: the final 4 digits of the card number (often shown as ****1234 or XXXX 1234).
- Decimals: a comma may be the decimal separator (EU: "1.234,56" = 1234.56) or a dot (US/UK). Always output a dot decimal.
- Installments — CRITICAL: the installment counter may appear as "Installment 3 of 12" / "Instalment 3/12" / "Rate 3/12" / "ΔΟΣΗ 3/12", OR (common in Greece) encoded INLINE in the merchant text as "NN/MM" right after the store name with NO keyword. Extract it. Examples:
    "PLAISIO 09/12   39,47"      → {"description":"PLAISIO","amount":39.47,"currentInstallment":9,"totalInstallments":12}
    "AMAZON 03/36   25,25"       → {"description":"AMAZON","amount":25.25,"currentInstallment":3,"totalInstallments":36}
    "STORE 03/04   48,33"        → {"description":"STORE","amount":48.33,"currentInstallment":3,"totalInstallments":4}
    "Installment 3 of 12"        → currentInstallment:3, totalInstallments:12
  Strip the "NN/MM" out of "description" (keep only the merchant). Do NOT confuse it with a date: a full DD/MM/YYYY (with a 4-digit year) at the START of the line is the transaction date; a short NN/MM (MM a small count like 04, 06, 12, 24, 36) at the END of the merchant text is the installment counter. Statement lines often start with two dates (purchase date, then posting date) — use the posting (second/later) date as "date".
- Purchases are POSITIVE amounts. Payments/credits ("Payment"/"Credit"/"Refund", "ΠΛΗΡΩΜΗ"/"ΠΙΣΤΩΣΗ") are NEGATIVE — a negative total means you overpaid (credit balance).
- Include every transaction line you can read`;

export async function parseStatementText(text: string): Promise<{
  parsed: ParsedStatement;
  raw: string;
  model: string;
}> {
  const { json, raw, model } = await runTextJSON(
    (await getPromptOverride('statement')) ?? STATEMENT_SYSTEM_PROMPT,
    `Parse this credit-card statement into JSON:\n\n${text}`,
    { numCtx: 16384 } // statements can be multi-page — don't truncate later installments
  );
  const parsed = ParsedStatementSchema.parse(json);
  return { parsed, raw, model };
}

// ─── Product extraction from a web page (URL import) ───────────────────────

export const ParsedProductSchema = z.object({
  title: z.string().default(''),
  price: z.coerce.number().default(0),
  // Multi-currency (P9): blank = the page showed no code, which the importer reads as the
  // deployment's base currency. Deliberately NOT defaulted to 'EUR': that would tell a
  // dollar-based deployment every product it imports is foreign.
  currency: z.string().default(''),
  store: z.string().default(''),
  category: z
    .enum(['network', 'storage', 'compute', 'audio', 'video', 'mobile', 'peripheral', 'consumable', 'other'])
    .catch('other'), // tolerate the model returning an invalid value
  specs: z.string().default(''),
  // Short keyword tags (brand / type / feature). Tolerate the model returning a
  // comma string instead of an array.
  tags: z
    .preprocess(
      (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : []),
      z.array(z.string())
    )
    .catch([]),
});

export type ParsedProduct = z.infer<typeof ParsedProductSchema>;

export const PRODUCT_PROMPT = `You extract structured product data from an e-commerce product page. Return ONLY JSON:
{
  "title": "full canonical product name (brand + model + key spec), WITHOUT the store/site suffix",
  "price": <current selling price as a number, no currency symbol>,
  "currency": "the ISO 4217 code the price is PRINTED in (EUR, USD, GBP, CHF, ...), or "" if the page shows none",
  "store": "the shop/site name",
  "category": one of: network, storage, compute, audio, video, mobile, peripheral, consumable, other,
  "specs": "the most important specs in 1-2 short lines",
  "tags": ["3-6 short lowercase keyword tags", "e.g. brand, product type, key feature: ubiquiti, switch, poe, 10gbe, managed"]
}
Price priority (use the first that applies):
1. A "PRODUCT PRICE (from the page's price markup): …" line, if present, IS this product's price — use it.
2. else the schema.org JSON-LD offers price — BUT if that figure is net/ex-VAT (valueAddedTaxIncluded:false), use the VAT-included price shown on the page instead.
3. else the price shown next to the MAIN product — IGNORE prices of related/accessory products listed elsewhere on the page.
Rules:
- Always the price the customer actually PAYS, VAT/sales-tax included. Prefer the tax-included figure ("incl. VAT", "με ΦΠΑ"/"Περιλαμβάνει ΦΠΑ", "inkl. MwSt", "TTC"); do NOT use the net/ex-tax price ("excl. VAT", "χωρίς ΦΠΑ", "HT", "Netto"). Never the list/strikethrough price.
- Decimals: a comma may be the decimal separator (EU: "1.234,56" = 1234.56) or a dot (US/UK). Always output a dot decimal.
- currency: report ONLY a code you can actually see next to the price (a symbol counts: "$" on a US shop = USD, "CA$"/"C$" = CAD, "A$" = AUD, "£" = GBP, "€" = EUR, "CHF" = CHF). Never guess it from the site's country or language. Output "" when the page shows no currency at all.
- title: clean product name only (brand + model + key spec). Strip store suffixes like " - Ubiquiti Store", " | Amazon", " - Newegg".
- category: output EXACTLY ONE word from the list (not a list). Pick the closest for a home-lab / networking / computing context.`;

export async function parseProductFromPage(page: {
  url: string;
  title: string;
  jsonLd: string;
  text: string;
}): Promise<{ parsed: ParsedProduct; raw: string; model: string }> {
  const host = (() => {
    try {
      return new URL(page.url).hostname;
    } catch {
      return '';
    }
  })();
  const content = `Site: ${host}\nPage title: ${page.title}\n\nJSON-LD:\n${page.jsonLd || '(none)'}\n\nVisible text:\n${page.text}`;
  // Product/price extraction uses the SEPARATE scraper model (cheaper/local), not the main
  // provider — so the 6h price cron and per-item price checks don't bill at the heavy model's rate.
  const { json, raw, model } = await runScraperTextJSON((await getPromptOverride('product')) ?? PRODUCT_PROMPT, content);
  const parsed = ParsedProductSchema.parse(json);
  if (!parsed.store && host) parsed.store = host.replace(/^www\./, '');
  return { parsed, raw, model };
}

// ─── Payment card OCR (scan a card photo) ──────────────────────────────────

export const ParsedCardSchema = z.object({
  name: z.string().default(''),
  last4: z.string().default(''),
  bank: z.string().default(''),
  type: z.enum(['mastercard', 'visa', 'amex', 'maestro', 'other']).catch('other'),
  kind: z.enum(['credit', 'debit']).catch('credit'),
});

export type ParsedCard = z.infer<typeof ParsedCardSchema>;

export const CARD_PROMPT = `You read a photo of a payment card. Return ONLY JSON:
{
  "name": "a short name like 'Mastercard' or bank + network if visible",
  "last4": "ONLY the LAST 4 digits of the card number",
  "bank": "issuing bank name if printed",
  "type": "mastercard" | "visa" | "amex" | "maestro" | "other",
  "kind": "credit" | "debit"
}
Rules:
- last4: NEVER output the full card number. Return only the final 4 digits.
- type: detect from the Visa / Mastercard / Amex / Maestro logo.
- kind: look for the word CREDIT or DEBIT on the card; if not visible, use "credit".`;

export async function parseCardImage(imageBase64: string): Promise<{
  parsed: ParsedCard;
  model: string;
}> {
  const { json, model } = await runVisionJSON(
    (await getPromptOverride('card')) ?? CARD_PROMPT,
    'Extract the card data as JSON.',
    [imageBase64]
  );
  return { parsed: ParsedCardSchema.parse(json), model };
}

// ─── Subscription autofill (name → details) ───────────────────────────────

export const ParsedSubscriptionSchema = z.object({
  provider: z.string().default(''),
  category: z
    .enum(['streaming', 'cloud', 'software', 'gaming', 'news', 'fitness', 'other'])
    .catch('other'),
  amount: z.coerce.number().default(0),
  currency: z.string().default('EUR'),
  billingCycle: z
    .enum(BILLING_CYCLE_VALUES)
    .catch('monthly'),
  url: z.string().default(''),
  notes: z.string().default(''),
});

export type ParsedSubscription = z.infer<typeof ParsedSubscriptionSchema>;

export const SUBSCRIPTION_PROMPT = `You know common subscription services (YouTube Premium, Netflix, Spotify, iCloud+, ChatGPT Plus, Xbox Game Pass, etc.).
Given a subscription name, return its typical details for an individual/personal plan. Return ONLY JSON:
{
  "provider": "the company behind it (e.g. Google, Apple, Netflix)",
  "category": "streaming" | "cloud" | "software" | "gaming" | "news" | "fitness" | "other",
  "amount": <typical price as a number>,
  "currency": "EUR",
  "billingCycle": "monthly" | "yearly" | "quarterly" | "weekly" | "lifetime",
  "url": "the official website URL",
  "notes": "short note, e.g. what the plan includes"
}
Rules:
- amount = the standard price of the most common personal plan (default to EUR pricing unless another currency is implied); pick the billingCycle that price refers to (usually monthly).
- If you are unsure of the exact price, give your best estimate and mention it in notes.
- category: pick exactly ONE from the list.`;

export async function suggestSubscription(name: string): Promise<{
  parsed: ParsedSubscription;
  model: string;
}> {
  const { json, model } = await runTextJSON(
    (await getPromptOverride('subscription')) ?? SUBSCRIPTION_PROMPT,
    `Subscription: ${name}`
  );
  return { parsed: ParsedSubscriptionSchema.parse(json), model };
}

// ─── Transaction auto-categorization ────────────────────────────────────────

export const CATEGORY_PROMPT = `Categorize each transaction into ONE of:
groceries, electronics, dining, transport, utilities, subscriptions, health, entertainment, travel, installment, other.
Return ONLY JSON: {"categories": ["<category>", ...]} in the SAME order as the input list.`;

export async function categorizeTransactions(
  descriptions: string[]
): Promise<string[]> {
  if (descriptions.length === 0) return [];
  const { json } = await runTextJSON(
    (await getPromptOverride('category')) ?? CATEGORY_PROMPT,
    JSON.stringify(descriptions)
  );
  const parsed = z.object({ categories: z.array(z.string()) }).safeParse(json);
  return parsed.success ? parsed.data.categories : [];
}

// ─── Expense / income parsing (bills, invoices, payslips) ───────────────────

export const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'fuel',
  'salary',
  'insurance',
  'telecom',
  'groceries',
  'transport',
  'health',
  'tax',
  'subscription',
  'other',
] as const;

export const ParsedExpenseSchema = z.object({
  kind: z.enum(['income', 'expense']).catch('expense'),
  vendor: z.string().default(''),
  category: z.enum(EXPENSE_CATEGORIES).catch('other'),
  amount: z.coerce.number().default(0),
  currency: z.string().default('EUR'),
  date: z.string().default(''),
  period: z.string().default(''),
  paymentMethod: z.string().default(''),
  recurringCycle: z.enum(RECURRING_CYCLE_VALUES).catch(''),
});

export type ParsedExpense = z.infer<typeof ParsedExpenseSchema>;

export const EXPENSE_PROMPT = `You parse a bill, invoice, utility statement, rent receipt, or payslip into ONE income/expense record. Documents may be in ANY language. Return ONLY JSON, no markdown:
{
  "kind": "income" | "expense",
  "vendor": "the issuing organization or payer",
  "category": one of: ${EXPENSE_CATEGORIES.join(', ')},
  "amount": <number, the total amount of THIS document, tax included>,
  "currency": "EUR" | "USD" | "GBP",
  "date": "YYYY-MM-DD (issue / payment date)",
  "period": "YYYY-MM the bill/payslip covers, if shown (else empty)",
  "paymentMethod": "card / cash / bank transfer / direct debit, if shown",
  "recurringCycle": "monthly" | "quarterly" | "yearly" | ""
}
Rules:
- vendor: the issuing company / payer. Utility bill → the provider (e.g. "ΔΕΗ"/"PPC", "EYDAP", "Vodafone", "British Gas"). Payslip → the employer. Rent → the landlord. Fuel → the station/brand. Be consistent so the SAME provider always gets the SAME name (this groups a recurring series).
- kind: a payslip / salary / wages / pension = "income"; everything else (bills, invoices, fuel, rent, taxes) = "expense".
- amount: the total payable / amount paid, tax included. Decimal comma or dot → output a dot decimal ("1.234,56" = 1234.56).
- date: DAY-FIRST in most of the world (DD/MM/YYYY — all of Europe), MONTH-FIRST in the US. If the first group is >12 it is the day. Output YYYY-MM-DD.
- recurringCycle: set it only if the document clearly is a periodic bill (monthly electricity, monthly rent, monthly salary); otherwise "".
- category: pick exactly ONE from the list.`;

export async function parseExpenseText(text: string): Promise<{ parsed: ParsedExpense; raw: string; model: string }> {
  const { json, raw, model } = await runTextJSON(
    (await getPromptOverride('expense')) ?? EXPENSE_PROMPT,
    `Extract the income/expense data as JSON from this document text:\n\n${text}`
  );
  return { parsed: ParsedExpenseSchema.parse(json), raw, model };
}

export async function parseExpenseImage(imageBase64: string): Promise<{ parsed: ParsedExpense; raw: string; model: string }> {
  const { json, raw, model } = await runVisionJSON(
    (await getPromptOverride('expense')) ?? EXPENSE_PROMPT,
    'Extract the income/expense data as JSON. Identify the vendor/payer, the total amount, and the date.',
    [imageBase64]
  );
  return { parsed: ParsedExpenseSchema.parse(json), raw, model };
}

// ─── Voucher / coupon parsing (from text or an image) ───────────────────────

export const ParsedVoucherSchema = z.object({
  title: z.string().default(''),
  code: z.string().default(''),
  store: z.string().default(''),
  discount: z.string().default(''),
  expiresAt: z.string().default(''),
  url: z.string().default(''),
  notes: z.string().default(''),
});
export type ParsedVoucher = z.infer<typeof ParsedVoucherSchema>;

export const VOUCHER_PROMPT = `You read a discount voucher / coupon / promo code (from pasted text or an image). Documents may be in ANY language. Return ONLY JSON, no markdown:
{
  "title": "short label, e.g. '10% off at Skroutz'",
  "code": "the promo/coupon code, e.g. SAVE10 (empty if the voucher has no code)",
  "store": "the shop/brand it applies to",
  "discount": "the value, e.g. '10%' / '€5' / 'free shipping' / 'buy 1 get 1'",
  "expiresAt": "YYYY-MM-DD expiry date if shown (empty otherwise)",
  "url": "the redemption URL if shown",
  "notes": "any conditions: minimum spend, one-time use, specific products, etc."
}
Rules:
- code: the EXACT alphanumeric coupon code (case-sensitive). If it's auto-applied with no code, leave empty.
- title: make a concise human label combining the discount + store.
- dates are DAY-FIRST in most of the world (Europe): "31/12/2026" → "2026-12-31". Output YYYY-MM-DD.
- discount: keep it short ("10%", "€5", "free shipping"); put any conditions in notes instead.`;

export async function parseVoucherText(text: string): Promise<{ parsed: ParsedVoucher; raw: string; model: string }> {
  const { json, raw, model } = await runTextJSON(
    (await getPromptOverride('voucher')) ?? VOUCHER_PROMPT,
    `Extract the voucher data as JSON from this text:\n\n${text}`
  );
  return { parsed: ParsedVoucherSchema.parse(json), raw, model };
}

export async function parseVoucherImage(imageBase64: string): Promise<{ parsed: ParsedVoucher; raw: string; model: string }> {
  const { json, raw, model } = await runVisionJSON(
    (await getPromptOverride('voucher')) ?? VOUCHER_PROMPT,
    'Extract the voucher/coupon data as JSON. Find the code, the store, the discount value and any expiry date.',
    [imageBase64]
  );
  return { parsed: ParsedVoucherSchema.parse(json), raw, model };
}

// ─── Product photo → shopping-list entry ────────────────────────────────────

export const ParsedProductPhotoSchema = z.object({
  name: z.string().default(''),
  brand: z.string().default(''),
  category: z.string().default(''),
  quantity: z.string().default(''),
  notes: z.string().default(''),
});
export type ParsedProductPhoto = z.infer<typeof ParsedProductPhotoSchema>;

export const PRODUCT_PHOTO_PROMPT = `You look at a PHOTO of a physical product — its packaging, label, box or the item on a shelf. The text may be in ANY language. Return ONLY JSON, no markdown:
{
  "name": "the concise product name a shopper would write on a list, e.g. 'Olive oil' / 'AA batteries' / 'Greek yoghurt'",
  "brand": "the brand if clearly printed (empty otherwise)",
  "category": "one of: groceries, household, electronics, health, pets, baby, drinks, other",
  "quantity": "the size/amount if visible, e.g. '1L' / '500g' / 'pack of 6' (empty otherwise)",
  "notes": "anything else useful, e.g. flavour/variant (empty otherwise)"
}
Rules:
- name: short and shopping-list friendly (a generic name + variant), NOT the full marketing text. Prefer the local language of the label.
- category: pick the single best fit from the list above.
- if you can't read a clear product, return empty strings.`;

export async function parseProductPhoto(imageBase64: string): Promise<{ parsed: ParsedProductPhoto; raw: string; model: string }> {
  const { json, raw, model } = await runVisionJSON(
    (await getPromptOverride('productPhoto')) ?? PRODUCT_PHOTO_PROMPT,
    'Identify the product in this photo for a shopping list. Return the name, brand, category, quantity and notes as JSON.',
    [imageBase64]
  );
  return { parsed: ParsedProductPhotoSchema.parse(json), raw, model };
}

// ─── Health / warmup ────────────────────────────────────────────────────────

// Cache the health result so every page navigation doesn't re-ping Ollama — the
// ping queues behind an in-flight generation when the model is busy, which is the
// main reason navigation felt slow. 20s freshness + a hard 2.5s cap per probe.
let healthCache: { v: boolean; t: number } | null = null;

/** Force the next health probe to hit Ollama (call after switching model/provider). */
export function invalidateOllamaHealth(): void {
  healthCache = null;
}

export async function isOllamaHealthy(): Promise<boolean> {
  if (healthCache && Date.now() - healthCache.t < 20000) return healthCache.v;
  try {
    const cfg = await getAiConfig();
    const client = clientFor(cfg.ollamaHost);
    const list = (await Promise.race([
      client.list(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ollama probe timeout')), 2500)),
    ])) as Awaited<ReturnType<typeof ollama.list>>;
    // "online" means the model we need is actually installed, not just that the API answers
    const v = list.models.some((m) => m.name === cfg.ollamaModel || m.model === cfg.ollamaModel);
    healthCache = { v, t: Date.now() };
    return v;
  } catch {
    // Busy/slow/down: reuse the last-known status and back off so we don't re-ping.
    const v = healthCache?.v ?? false;
    healthCache = { v, t: Date.now() };
    return v;
  }
}

/** Provider-aware "is the AI usable right now?" — used by the navbar dot and the
 *  dropzone hints. Anthropic just needs a key (no Ollama ping); Ollama does a real
 *  health probe. So with the cloud provider selected, the UI never says "AI offline"
 *  just because no local Ollama is running. */
export async function isAiReady(): Promise<boolean> {
  const cfg = await getAiConfig();
  // getAiConfig already falls back to 'ollama' when a cloud provider is
  // half-configured, so a non-ollama provider here is ready by definition.
  if (cfg.provider !== 'ollama') return true;
  return isOllamaHealthy();
}

/** Pre-load the model into memory (fire-and-forget) to avoid cold-start on first parse. */
export async function warmupModel(): Promise<void> {
  try {
    const cfg = await getAiConfig();
    await clientFor(cfg.ollamaHost).chat({
      model: cfg.ollamaModel,
      keep_alive: KEEP_ALIVE,
      messages: [{ role: 'user', content: 'ok' }],
    });
  } catch {
    /* ignore */
  }
}
