// Run history telemetry recorder and queries (#362).
//
// Records duration, tokens, cost, and diagnostic metadata for every AI call across the app.
// Never throws: failures to log must never break user actions.

import { connectDB } from './db';
import { AiRun, type AiRunDoc } from '@/models/AiRun';
import { callCostMicros } from './aiPricing';
import { PRICE_VERSION } from './claudePricing';
import { redactKey } from './anthropic';
import { withRequestTenant } from './tenancy/request';
import { currentModel } from './tenancy/connection';
import type { AiFeatureKey } from './aiFeatures';

export type AiRunFeature = AiFeatureKey | 'scraperPrice' | 'test';

export type RecordAiRunParams = {
  feature: AiRunFeature | string;
  provider: string;
  model: string;
  status: 'ok' | 'error' | 'blocked';
  durationMs: number;
  error?: string | null;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
  };
  costMicros?: number;
  requestId?: string | null;
  stopReason?: string | null;
  trigger?: 'user' | 'job' | 'cron' | 'email' | 'api';
  userId?: string | null;
  jobId?: string | null;
  record?: { type: string; id: string } | null;
  conversationId?: string | null;
  turn?: number | null;
  at?: Date;
};

export type SerializedAiRun = {
  _id: string;
  at: string;
  durationMs: number;
  feature: string;
  provider: string;
  model: string;
  status: 'ok' | 'error' | 'blocked';
  error?: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  };
  costMicros: number;
  currency: string;
  priceVersion?: string | null;
  requestId?: string | null;
  stopReason?: string | null;
  trigger: string;
  userId?: string | null;
  jobId?: string | null;
  record?: { type: string; id: string } | null;
  conversationId?: string | null;
  turn?: number | null;
};

export type AiRunFilter = {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  feature?: string;
  model?: string;
  status?: string;
  limit?: number;
  skip?: number;
};

export type AiRunSummary = {
  totalRuns: number;
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

/**
 * Record an AI run telemetry event. Never throws.
 */
export async function recordAiRun(params: RecordAiRunParams): Promise<void> {
  try {
    await connectDB();
    const Model = await withRequestTenant(() => currentModel(AiRun));

    const inTok = Math.max(0, Math.floor(Number(params.usage?.inputTokens) || 0));
    const outTok = Math.max(0, Math.floor(Number(params.usage?.outputTokens) || 0));
    const cwTok = Math.max(0, Math.floor(Number(params.usage?.cacheWriteTokens) || 0));
    const crTok = Math.max(0, Math.floor(Number(params.usage?.cacheReadTokens) || 0));

    let cost = params.costMicros;
    if (cost === undefined) {
      if (params.provider === 'ollama' || params.provider === 'custom-free') {
        cost = 0;
      } else {
        cost = callCostMicros(params.model, inTok, outTok, cwTok, crTok);
      }
    }

    let sanitizedError: string | null = null;
    if (params.error) {
      sanitizedError = redactKey(String(params.error), '').slice(0, 300);
    }

    await Model.create({
      at: params.at ?? new Date(),
      durationMs: Math.max(0, Math.floor(Number(params.durationMs) || 0)),
      feature: params.feature,
      provider: params.provider,
      model: params.model,
      status: params.status,
      error: sanitizedError,
      usage: {
        inputTokens: inTok,
        outputTokens: outTok,
        cacheWriteTokens: cwTok,
        cacheReadTokens: crTok,
      },
      costMicros: cost,
      currency: 'USD',
      priceVersion: PRICE_VERSION,
      requestId: params.requestId ?? null,
      stopReason: params.stopReason ?? null,
      trigger: params.trigger ?? 'user',
      userId: params.userId ?? null,
      jobId: params.jobId ?? null,
      record: params.record ?? null,
      conversationId: params.conversationId ?? null,
      turn: params.turn ?? null,
    });
  } catch (err) {
    // Non-fatal logging only — never throw to caller
    console.error('[aiRun] Failed to record AI run telemetry:', err);
  }
}

function serializeDoc(d: Record<string, unknown>): SerializedAiRun {
  const usage = (d.usage as Record<string, unknown>) || {};
  const record = (d.record as Record<string, unknown>) || null;
  return {
    _id: String(d._id),
    at: (d.at instanceof Date ? d.at : new Date(d.at as string)).toISOString(),
    durationMs: Number(d.durationMs) || 0,
    feature: String(d.feature || ''),
    provider: String(d.provider || ''),
    model: String(d.model || ''),
    status: (d.status as 'ok' | 'error' | 'blocked') || 'ok',
    error: d.error ? String(d.error) : null,
    usage: {
      inputTokens: Number(usage.inputTokens) || 0,
      outputTokens: Number(usage.outputTokens) || 0,
      cacheWriteTokens: Number(usage.cacheWriteTokens) || 0,
      cacheReadTokens: Number(usage.cacheReadTokens) || 0,
    },
    costMicros: Number(d.costMicros) || 0,
    currency: String(d.currency || 'USD'),
    priceVersion: d.priceVersion ? String(d.priceVersion) : null,
    requestId: d.requestId ? String(d.requestId) : null,
    stopReason: d.stopReason ? String(d.stopReason) : null,
    trigger: String(d.trigger || 'user'),
    userId: d.userId ? String(d.userId) : null,
    jobId: d.jobId ? String(d.jobId) : null,
    record: record && record.type && record.id ? { type: String(record.type), id: String(record.id) } : null,
    conversationId: d.conversationId ? String(d.conversationId) : null,
    turn: d.turn != null ? Number(d.turn) : null,
  };
}

export function buildRunQuery(filters: AiRunFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {};

  if (filters.feature && filters.feature !== 'all') {
    q.feature = filters.feature;
  }
  if (filters.model && filters.model !== 'all') {
    q.model = filters.model;
  }
  if (filters.status && filters.status !== 'all') {
    q.status = filters.status;
  }

  if (filters.dateFrom || filters.dateTo) {
    const atQuery: Record<string, unknown> = {};
    if (filters.dateFrom) {
      // Inclusive start of day in UTC
      atQuery.$gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    }
    if (filters.dateTo) {
      // Inclusive end of day in UTC
      atQuery.$lte = new Date(`${filters.dateTo}T23:59:59.999Z`);
    }
    q.at = atQuery;
  }

  return q;
}

/** Get filtered AI runs with totals and daily cost breakdown */
export async function getAiRuns(filters: AiRunFilter = {}): Promise<{
  runs: SerializedAiRun[];
  total: number;
  summary: AiRunSummary;
  dailyCosts: { date: string; costMicros: number; count: number }[];
}> {
  await connectDB();
  const Model = await withRequestTenant(() => currentModel(AiRun));
  const query = buildRunQuery(filters);

  const limit = Math.min(500, Math.max(1, filters.limit ?? 100));
  const skip = Math.max(0, filters.skip ?? 0);

  const [docs, total, stats] = await Promise.all([
    Model.find(query).sort({ at: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
    Model.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCostMicros: { $sum: '$costMicros' },
          totalInputTokens: { $sum: '$usage.inputTokens' },
          totalOutputTokens: { $sum: '$usage.outputTokens' },
        },
      },
    ]),
  ]);

  // Aggregate daily costs for the filtered results
  const dailyRaw = await Model.aggregate([
    { $match: query },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
        costMicros: { $sum: '$costMicros' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const dailyCosts = dailyRaw.map((d) => ({
    date: String(d._id),
    costMicros: Number(d.costMicros) || 0,
    count: Number(d.count) || 0,
  }));

  const stat = stats[0] || {};
  const summary: AiRunSummary = {
    totalRuns: total,
    totalCostMicros: Number(stat.totalCostMicros) || 0,
    totalInputTokens: Number(stat.totalInputTokens) || 0,
    totalOutputTokens: Number(stat.totalOutputTokens) || 0,
  };

  return {
    runs: docs.map((d) => serializeDoc(d as unknown as Record<string, unknown>)),
    total,
    summary,
    dailyCosts,
  };
}

/** Get the last N runs (e.g. for Settings → AI) */
export async function getRecentAiRuns(limit: number = 5): Promise<SerializedAiRun[]> {
  await connectDB();
  const Model = await withRequestTenant(() => currentModel(AiRun));
  const docs = await Model.find().sort({ at: -1 }).limit(limit).lean();
  return docs.map((d) => serializeDoc(d as unknown as Record<string, unknown>));
}

/** Get AI cost statistics for a background job */
export async function getJobAiStats(jobId: string): Promise<{
  costMicros: number;
  tokens: number;
  runs: number;
}> {
  if (!jobId) return { costMicros: 0, tokens: 0, runs: 0 };
  await connectDB();
  const Model = await withRequestTenant(() => currentModel(AiRun));
  const stats = await Model.aggregate([
    { $match: { jobId } },
    {
      $group: {
        _id: null,
        costMicros: { $sum: '$costMicros' },
        inputTokens: { $sum: '$usage.inputTokens' },
        outputTokens: { $sum: '$usage.outputTokens' },
        runs: { $sum: 1 },
      },
    },
  ]);
  const s = stats[0] || {};
  return {
    costMicros: Number(s.costMicros) || 0,
    tokens: (Number(s.inputTokens) || 0) + (Number(s.outputTokens) || 0),
    runs: Number(s.runs) || 0,
  };
}
