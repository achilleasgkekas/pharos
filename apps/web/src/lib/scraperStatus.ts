import { connectDB } from './db';
import mongoose, { Schema } from 'mongoose';

export type ScraperStatus = {
  key: string;
  schedule?: string;
  heartbeatAt?: string | null;
  lastStartAt?: string | null;
  lastCompleteAt?: string | null;
  lastRunAt?: string | null;
  lastError?: string | null;
  lastAiError?: { message: string; model: string; at: string } | null;
  lastStats?: { items?: number; checks?: number; updates?: number; alerts?: number } | null;
};

const ScraperStatusSchema = new Schema(
  { key: { type: String, unique: true, default: 'singleton' } },
  { collection: 'scraperstatus', strict: false }
);

export const ScraperStatusModel =
  mongoose.models.ScraperStatus || mongoose.model('ScraperStatus', ScraperStatusSchema);

export async function getScraperStatus(): Promise<ScraperStatus | null> {
  try {
    await connectDB();
    const doc = (await ScraperStatusModel.findOne({ key: 'singleton' }).lean()) as Record<string, unknown> | null;
    if (!doc) return null;
    const toIso = (v: unknown): string | null =>
      v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null;
    return {
      key: 'singleton',
      schedule: typeof doc.schedule === 'string' ? doc.schedule : undefined,
      heartbeatAt: toIso(doc.heartbeatAt),
      lastStartAt: toIso(doc.lastStartAt),
      lastCompleteAt: toIso(doc.lastCompleteAt),
      lastRunAt: toIso(doc.lastRunAt),
      lastError: typeof doc.lastError === 'string' ? doc.lastError : null,
      lastAiError: doc.lastAiError ? (doc.lastAiError as ScraperStatus['lastAiError']) : null,
      lastStats: doc.lastStats ? (doc.lastStats as ScraperStatus['lastStats']) : null,
    };
  } catch {
    return null;
  }
}

export async function recordScraperPass(params: {
  schedule?: string;
  stats?: { items: number; checks: number; updates: number; alerts: number };
  error?: string | null;
}): Promise<void> {
  try {
    await connectDB();
    const now = new Date();
    const update: Record<string, unknown> = {
      lastCompleteAt: now,
      lastRunAt: now,
      heartbeatAt: now,
      lastError: params.error ?? null,
    };
    if (params.schedule) update.schedule = params.schedule;
    if (params.stats) update.lastStats = params.stats;
    await ScraperStatusModel.updateOne({ key: 'singleton' }, { $set: update }, { upsert: true });
  } catch {
    /* informational status — never fail caller */
  }
}
