// Asset depreciation model (P29). Owned-inventory value drifts away from the
// purchase price over time, so net worth (PA2) and any insurance export (P13)
// overestimate if they keep valuing gear at what it cost. This module estimates
// a current value from the purchase price, the purchase date, and a per-category
// annual depreciation rate, using a declining-balance curve floored at a salvage
// fraction of the purchase price. Pure + framework-free (computed-on-read, like
// the expense `anomaly`) so it unit-tests without a DB and stores nothing.

export type DepreciationConfig = {
  /** Master toggle. When off, callers fall back to the pre-P29 valuation exactly. */
  enabled: boolean;
  /** Salvage floor as a percent of the purchase price (0..100). Value never drops below this. */
  floorPct: number;
  /** Fallback annual depreciation percent for categories without an explicit rate. */
  defaultRate: number;
  /** Per item-category annual depreciation percent (0..100). Merged over the defaults. */
  rates: Record<string, number>;
};

/** Sensible per-category annual depreciation (% of remaining value lost each year).
 *  Keyed by the default item categories (lib/taxonomies DEFAULT_ITEM_CATEGORIES).
 *  Consumables drop fastest, passive/audio gear slowest. Editable in Settings. */
export const DEFAULT_DEPRECIATION_RATES: Record<string, number> = {
  network: 15,
  storage: 20,
  compute: 25,
  audio: 12,
  video: 20,
  mobile: 25,
  peripheral: 18,
  consumable: 50,
  other: 15,
};

export const DEFAULT_DEPRECIATION: DepreciationConfig = {
  enabled: true,
  floorPct: 10,
  defaultRate: 15,
  rates: {},
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function clampPct(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, v));
}

/** Coerce a raw (Mixed) stored config into an effective DepreciationConfig, merging
 *  stored per-category rate overrides over DEFAULT_DEPRECIATION_RATES. DB-free. */
export function resolveDepreciation(raw: unknown): DepreciationConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rates: Record<string, number> = { ...DEFAULT_DEPRECIATION_RATES };
  const stored = r.rates && typeof r.rates === 'object' ? (r.rates as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(stored)) {
    const key = k.trim();
    const n = Number(v);
    if (key && Number.isFinite(n) && n >= 0) rates[key] = Math.min(100, n);
  }
  return {
    // Default ON; only an explicit `false` disables it.
    enabled: r.enabled !== false,
    floorPct: clampPct(r.floorPct, DEFAULT_DEPRECIATION.floorPct),
    defaultRate: clampPct(r.defaultRate, DEFAULT_DEPRECIATION.defaultRate),
    rates,
  };
}

/** Annual depreciation percent for a category (explicit rate → defaultRate). */
export function rateForCategory(cfg: DepreciationConfig, category?: string | null): number {
  const c = (category || 'other').trim() || 'other';
  const r = cfg.rates[c];
  return Number.isFinite(r) ? r : cfg.defaultRate;
}

/**
 * Declining-balance estimate of an asset's current value.
 *
 *   value = purchasePrice * (1 - rate)^years,  floored at purchasePrice * floor
 *
 * `years` may be fractional; a future purchase date (years < 0) is clamped to 0
 * (no appreciation). Returns the purchase price unchanged when the rate is 0.
 * Rounded to cents.
 */
export function depreciatedValue(
  purchasePrice: number,
  purchasedAt: string | Date | null | undefined,
  category: string | null | undefined,
  cfg: DepreciationConfig,
  now: Date = new Date(),
): number {
  if (!(purchasePrice > 0)) return 0;
  if (purchasedAt == null) return round2(purchasePrice);
  const bought = purchasedAt instanceof Date ? purchasedAt : new Date(purchasedAt);
  if (isNaN(bought.getTime())) return round2(purchasePrice);

  const years = Math.max(0, (now.getTime() - bought.getTime()) / MS_PER_YEAR);
  const rate = rateForCategory(cfg, category) / 100;
  const floor = purchasePrice * (cfg.floorPct / 100);
  const value = purchasePrice * Math.pow(1 - rate, years);
  return round2(Math.max(floor, value));
}

export type DepreciableItem = {
  category?: string | null;
  purchasedPrice?: number | null;
  purchasedAt?: string | Date | null;
  currentPrice?: number | null;
};

/**
 * Estimated current value of an owned item, computed on read.
 *
 * When depreciation is disabled the result is byte-for-byte the pre-P29 formula
 * (`purchasedPrice ?? currentPrice ?? 0`). When enabled:
 *   1. A manual current-value override wins — but only when `currentPrice` was
 *      actually set by the user, i.e. it is positive AND differs from the purchase
 *      price. (Receipt-imported items seed `currentPrice === purchasedPrice`; that
 *      seed is NOT treated as an override, so those items still depreciate.)
 *   2. Otherwise, if there is a purchase price, depreciate it from the purchase date.
 *   3. Otherwise fall back to whatever price we have.
 */
export function estimatedItemValue(
  item: DepreciableItem,
  cfg: DepreciationConfig,
  now: Date = new Date(),
): number {
  const pp = numOrNull(item.purchasedPrice);
  const cp = numOrNull(item.currentPrice);
  if (!cfg.enabled) return pp ?? cp ?? 0;

  // (1) genuine manual override: positive and moved away from the purchase seed.
  if (cp != null && cp > 0 && (pp == null || Math.abs(cp - pp) > 0.005)) return round2(cp);

  // (2) depreciate the purchase price.
  if (pp != null && pp > 0) return depreciatedValue(pp, item.purchasedAt ?? null, item.category ?? null, cfg, now);

  // (3) nothing to depreciate.
  return pp ?? cp ?? 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
