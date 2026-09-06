import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * GLOBAL scraped-price cache — deliberately NOT tenant-scoped.
 *
 * Product prices are public and identical for everyone, so the expensive part of a price
 * check (fetching the shop page + the AI parse) is scraped ONCE per URL and shared. This lives
 * on the base connection (the registry DB under SAAS_MODE, the single DB self-hosted), so N
 * tenants tracking the same popular URL scrape it once, not N times — cutting AI cost and the
 * IP-flagging risk of hammering a shop. See lib/scrapedPriceCache.ts (read-through + TTL).
 *
 * `parsed` is the full ParsedProduct blob from parseProductFromPage; the per-item price-history
 * write and the productMatchesItem check still run per item, against this cached parse.
 */
const ScrapedPriceSchema = new Schema(
  {
    // Normalized URL (host without www + path, lowercased, no trailing slash) — the cache key.
    urlNorm: { type: String, required: true, unique: true },
    // The AI-parsed product (store, price, currency, title, specs…). Opaque here on purpose.
    parsed: { type: Schema.Types.Mixed, default: {} },
    // The raw page <title>, kept as the same secondary fallback the inline scrape had.
    pageTitle: { type: String, default: '' },
    // When this URL was last scraped — read-through treats an entry older than the TTL as a miss.
    scrapedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type ScrapedPriceDoc = InferSchemaType<typeof ScrapedPriceSchema> & { _id: string };

export const ScrapedPrice: Model<ScrapedPriceDoc> =
  (models.ScrapedPrice as Model<ScrapedPriceDoc>) || model<ScrapedPriceDoc>('ScrapedPrice', ScrapedPriceSchema);
