import mongoose, { Schema, model, type InferSchemaType } from 'mongoose';
import { config } from './config.js';

// Minimal Item schema — only the fields the scraper reads/writes. It points at the
// SAME `items` collection the web app uses, so updates show up immediately.
const PriceEntrySchema = new Schema(
  {
    price: Number,
    store: String,
    url: String,
    currency: { type: String, default: 'EUR' },
    date: { type: Date, default: Date.now },
    inStock: { type: Boolean, default: true },
  },
  { _id: true }
);

const ItemSchema = new Schema(
  {
    title: String,
    currentPrice: { type: Number, default: 0 },
    targetPrice: { type: Number, default: null }, // price-tracker target → "deal" alert
    priceHistory: { type: [PriceEntrySchema], default: [] },
    links: { type: [{ label: String, url: String, price: { type: Number, default: null } }], default: [] },
    status: String,
    deletedAt: { type: Date, default: null }, // soft delete (Trash): never scraped
    lastPriceCheckAt: { type: Date, default: null }, // #330: see lib/scrapeOrder in the web app
    lastPriceCheckNote: { type: String, default: '' },
  },
  { timestamps: true, collection: 'items' }
);

export type ScraperItem = InferSchemaType<typeof ItemSchema> & { _id: mongoose.Types.ObjectId };

export const Item = model('Item', ItemSchema);

const AiRunSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    durationMs: { type: Number, default: 0 },
    feature: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    model: { type: String, required: true, index: true },
    status: { type: String, enum: ['ok', 'error', 'blocked'], required: true, index: true },
    error: { type: String },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheWriteTokens: { type: Number, default: 0 },
      cacheReadTokens: { type: Number, default: 0 },
    },
    costMicros: { type: Number, default: 0, index: true },
    currency: { type: String, default: 'USD' },
    priceVersion: { type: Number, default: 1 },
    requestId: { type: String },
    stopReason: { type: String },
    trigger: { type: String, enum: ['user', 'job', 'cron', 'email', 'api'], default: 'cron', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    jobId: { type: String, default: null, index: true },
    record: {
      type: { type: String },
      id: { type: String },
    },
    conversationId: { type: String, default: null, index: true },
    turn: { type: Number },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'ai_runs' }
);

export const AiRun = model('AiRun', AiRunSchema);

export async function connect(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(config.mongoUri);
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}
