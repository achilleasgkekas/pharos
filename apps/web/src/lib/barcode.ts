// P17 (server half) — pure, DB-free, network-free helpers for GTIN/barcode
// product lookup. Kept isolated from the fetching side (`lib/barcodeLookup.ts`)
// so the validation + response mapping stay unit-testable without a network
// seam, exactly like `lib/loyaltyCard.ts` does for the wallet's barcodes.
//
// Distinct from `lib/loyaltyCard.ts`: that one describes how to RENDER a card's
// barcode at the checkout; this one reads a barcode a camera just scanned and
// turns it into a product suggestion.

/** A product resolved from a barcode. Deliberately the same shape the AI
 *  product-photo scan returns (`ParsedProductPhoto`: name/brand/category/
 *  quantity/notes) so a client can feed either into the very same
 *  confirm-then-add flow, plus lookup-only extras (code/image/source). */
export type BarcodeProduct = {
  name: string;
  brand: string;
  category: string;
  quantity: string;
  notes: string;
  code: string;
  image: string;
  source: string;
};

/** Barcode lengths we accept: EAN-8, UPC-A, EAN-13, GTIN-14. */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** Standard GTIN mod-10 check digit computed over the payload (every digit but
 *  the last). Weights alternate 3/1 from the RIGHTMOST payload digit, which is
 *  what makes the same routine work for EAN-8/UPC-A/EAN-13/GTIN-14 alike. */
export function gtinCheckDigit(payload: string): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    const digit = payload.charCodeAt(payload.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Whether `code` is a syntactically valid GTIN (right length AND check digit).
 *  A mis-scan usually fails the check digit, so this catches most garbage
 *  before we spend a network round-trip on it. */
export function isValidGtin(code: string): boolean {
  if (!GTIN_LENGTHS.has(code.length) || !/^\d+$/.test(code)) return false;
  const payload = code.slice(0, -1);
  return gtinCheckDigit(payload) === code.charCodeAt(code.length - 1) - 48;
}

/** Clean a scanned/typed barcode into a canonical GTIN, or null when it isn't
 *  one. Tolerates the separators people type (spaces, hyphens) and the
 *  scanner-added whitespace; rejects anything that fails the check digit. */
export function normalizeBarcode(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/[\s-]/g, '');
  if (!digits) return null;
  return isValidGtin(digits) ? digits : null;
}

/** The forms of one GTIN worth asking a database for, most-likely first.
 *  Catalogues are inconsistent about zero-padding: the same US product may be
 *  stored as a 12-digit UPC-A in one and as the zero-padded 13-digit EAN in
 *  another, so we try both rather than reporting a false "not found". Capped at
 *  `max` forms because every extra one multiplies the requests a miss costs. */
export function barcodeCandidates(code: string, max = 2): string[] {
  const out = new Set<string>([code]);
  // Peel leading zeros down through the shorter GTIN forms (14 → 13 → 12).
  let shorter = code;
  while (shorter.length > 12 && shorter.startsWith('0')) {
    shorter = shorter.slice(1);
    out.add(shorter);
  }
  // The reverse: a 12-digit UPC-A is very often stored as a zero-padded EAN-13.
  if (code.length === 12) out.add('0' + code);
  return [...out].slice(0, max);
}

/** Humanize one Open*Facts category tag ("en:breakfast-cereals" → "Breakfast
 *  cereals"). Non-English tags keep their text minus the locale prefix. */
export function humanizeCategoryTag(tag: string): string {
  const text = String(tag || '').replace(/^[a-z]{2}:/, '').replace(/-+/g, ' ').trim();
  if (!text) return '';
  return (text[0].toUpperCase() + text.slice(1)).slice(0, 60);
}

/** A tag that is an actual entry in the Open*Facts taxonomy: lowercase and
 *  hyphenated ("en:sweet-spreads"). Crowd-sourced tags that never made it into
 *  the taxonomy are echoed back with the ORIGINAL language's text but still
 *  carry the requested locale's prefix (a real Nutella record ends with
 *  "en:Pâtes à tartiner"), so the prefix alone cannot be trusted for language. */
const CANONICAL_TAG = /^[a-z]{2}:[a-z0-9-]+$/;

/** Pick the most useful category from an Open*Facts `categories_tags` array.
 *  The list runs general → specific, so we take the LAST tag ("Food" is
 *  useless, "Sweet spreads" is not), preferring canonical English taxonomy
 *  entries so we do not hand the user a French label on an English lookup. */
export function pickCategory(tags: unknown): string {
  if (!Array.isArray(tags)) return '';
  const strings = tags.filter((t): t is string => typeof t === 'string' && !!t.trim());
  const pools = [
    strings.filter((t) => t.startsWith('en:') && CANONICAL_TAG.test(t)),
    strings.filter((t) => CANONICAL_TAG.test(t)),
    strings,
  ];
  const pool = pools.find((p) => p.length);
  return pool ? humanizeCategoryTag(pool[pool.length - 1]) : '';
}

/** First non-empty string among the candidate fields, trimmed and capped.
 *  Open*Facts records are crowd-sourced, so a given product may fill any one
 *  of several name fields and leave the rest blank. */
function firstText(obj: Record<string, unknown>, keys: string[], cap = 160): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, cap);
  }
  return '';
}

/** Map one Open*Facts `product` object onto our shape. Returns null when the
 *  record carries no usable name — a hit with nothing but a barcode in it is
 *  worse than a clean "not found", because the client would prefill an empty
 *  title and the user would not know the lookup actually failed. */
export function mapOpenFactsProduct(code: string, product: unknown, source: string): BarcodeProduct | null {
  if (!product || typeof product !== 'object') return null;
  const p = product as Record<string, unknown>;
  const name = firstText(p, ['product_name', 'product_name_en', 'generic_name', 'generic_name_en', 'abbreviated_product_name']);
  if (!name) return null;
  return {
    name,
    brand: firstText(p, ['brands'], 80).split(',')[0].trim(),
    category: pickCategory(p.categories_tags),
    quantity: firstText(p, ['quantity'], 40),
    notes: '',
    code,
    image: firstText(p, ['image_front_small_url', 'image_front_url', 'image_small_url', 'image_url'], 300),
    source,
  };
}
