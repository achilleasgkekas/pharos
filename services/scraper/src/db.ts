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
  },
  { timestamps: true, collection: 'items' }
);

export type ScraperItem = InferSchemaType<typeof ItemSchema> & { _id: mongoose.Types.ObjectId };

export const Item = model('Item', ItemSchema);

export async function connect(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(config.mongoUri);
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}
