import { barcodeCandidates, mapOpenFactsProduct, normalizeBarcode, type BarcodeProduct } from '@/lib/barcode';

// P17 (server half) — resolve a scanned barcode to a product suggestion.
//
// Sources are the Open*Facts family: free, key-less, no quota to manage and no
// per-call cost, which is why they are the builder default here. They share one
// API shape (`/api/v2/product/<gtin>.json`), so all three are the same code path
// with a different host, listed in preference order for when more than one
// answers:
//   1. Open FOOD Facts     — groceries (by far the biggest catalogue)
//   2. Open PRODUCTS Facts — general merchandise (electronics, household)
//   3. Open BEAUTY Facts   — cosmetics / personal care
// The three are asked in PARALLEL per barcode form and the zero-padding variants
// sequentially with an early exit, which bounds a total miss at 2 round-trips of
// wall clock (a scan blocks someone standing in a shop) for at most 6 small,
// field-filtered requests.
//
// Deliberately NOT an AI fallback in v1: a lookup is deterministic and free,
// whereas every AI call is metered and costs real money. If a barcode misses,
// the client already has the AI product-PHOTO scan (`POST /api/v1/scan/product`)
// as the user-initiated, opt-in escalation.

type Source = { id: string; host: string };

export const BARCODE_SOURCES: readonly Source[] = [
  { id: 'openfoodfacts', host: 'https://world.openfoodfacts.org' },
  { id: 'openproductsfacts', host: 'https://world.openproductsfacts.org' },
  { id: 'openbeautyfacts', host: 'https://world.openbeautyfacts.org' },
];

/** Only the fields we map, so the response stays a couple of KB instead of the
 *  full (very large) crowd-sourced record. */
const FIELDS =
  'product_name,product_name_en,generic_name,generic_name_en,abbreviated_product_name,brands,categories_tags,quantity,image_front_small_url,image_front_url,image_small_url,image_url';

const TIMEOUT_MS = 6000;

/** Open*Facts asks callers to identify themselves in the User-Agent so they can
 *  contact an app whose client misbehaves. */
const USER_AGENT = 'Pharos/1.0 (self-hosted personal hub; https://github.com/AchilleasGekas/pharos)';

export type BarcodeLookup =
  | { ok: true; product: BarcodeProduct | null; code: string }
  | { ok: false; error: string };

/** One source × one GTIN form. Resolves to the mapped product, null when the
 *  source answered but has no such record, and throws only on a transport
 *  failure (so the caller can tell "nobody has it" from "we could not ask"). */
async function askSource(source: Source, code: string): Promise<BarcodeProduct | null> {
  const res = await fetch(`${source.host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // v2 answers 404 for an unknown barcode; anything else in the 4xx/5xx range is
  // the service having a bad day, which is a transport failure, not a miss.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${source.id} responded ${res.status}`);
  const body = (await res.json()) as { status?: number; product?: unknown };
  if (body?.status === 0) return null;
  return mapOpenFactsProduct(code, body?.product, source.id);
}

/** Look a scanned barcode up across the Open*Facts sources.
 *  - invalid GTIN            → { ok: false } (the caller answers 400)
 *  - found                   → { ok: true, product }
 *  - every source said "no"  → { ok: true, product: null }
 *  - every source unreachable→ { ok: false } (the caller answers 502)
 *  A source that errors never hides a later source's hit: we keep going and
 *  only report a transport failure when NO source managed to answer at all. */
export async function lookupBarcode(raw: unknown): Promise<BarcodeLookup> {
  const code = normalizeBarcode(raw);
  if (!code) return { ok: false, error: 'Invalid barcode — expected a valid 8, 12, 13 or 14 digit GTIN' };

  let answered = false;
  let lastError = '';

  for (const candidate of barcodeCandidates(code)) {
    const results = await Promise.allSettled(BARCODE_SOURCES.map((s) => askSource(s, candidate)));
    for (const r of results) {
      if (r.status === 'fulfilled') answered = true;
      else lastError = (r.reason as Error)?.message || String(r.reason);
    }
    // BARCODE_SOURCES order is the preference order, and allSettled preserves it.
    const hit = results.find((r) => r.status === 'fulfilled' && r.value);
    if (hit && hit.status === 'fulfilled' && hit.value) {
      // Report the barcode as scanned, not the padding variant that happened to hit.
      return { ok: true, product: { ...hit.value, code }, code };
    }
  }

  if (!answered) return { ok: false, error: `Product databases unreachable${lastError ? ` (${lastError})` : ''}` };
  return { ok: true, product: null, code };
}
