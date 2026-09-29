import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

// An operational log of one AI API call (#362).
//
// Records duration, tokens, cost and diagnostic metadata across all entry points:
// documents, scraper, command bar, background jobs and tests.
// Retention is managed by a MongoDB TTL index (default 365 days / 12 months).

const UsageSchema = new Schema(
  {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
  },
  { _id: false }
);

const RecordRefSchema = new Schema(
  {
    type: { type: String, required: true }, // 'receipt' | 'expense' | 'statement' | 'item' | etc.
    id: { type: String, required: true },
  },
  { _id: false }
);

const AiRunSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    durationMs: { type: Number, required: true, default: 0 },
    feature: { type: String, required: true, index: true }, // AiFeatureKey | 'scraperPrice' | 'test'
    provider: { type: String, required: true },
    model: { type: String, required: true, index: true },
    status: { type: String, enum: ['ok', 'error', 'blocked'], required: true, index: true },
    error: { type: String, default: null }, // sanitized/redacted, max 300 chars
    usage: { type: UsageSchema, default: () => ({}) },
    costMicros: { type: Number, default: 0, index: true },
    currency: { type: String, default: 'USD' },
    priceVersion: { type: String, default: null },
    requestId: { type: String, default: null },
    stopReason: { type: String, default: null },
    prompt: { type: String, default: null },
    output: { type: String, default: null },
    trigger: {
      type: String,
      enum: ['user', 'job', 'cron', 'email', 'api'],
      default: 'user',
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    jobId: { type: String, default: null, index: true },
    record: { type: RecordRefSchema, default: null },
    conversationId: { type: String, default: null, index: true },
    turn: { type: Number, default: null },
    // TTL retention: documents expire automatically once expiresAt is reached.
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { collection: 'airuns', timestamps: false }
);

// Compound index for history filtering & totals
AiRunSchema.index({ at: -1, status: 1 });
AiRunSchema.index({ at: -1, feature: 1 });

export type AiRunDoc = InferSchemaType<typeof AiRunSchema> & { _id: string };

export const AiRun: Model<AiRunDoc> =
  (models.AiRun as Model<AiRunDoc>) || model<AiRunDoc>('AiRun', AiRunSchema);
