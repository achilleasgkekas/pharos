// Canonical Anthropic Claude pricing (#360).
//
// Client-safe data, no server dependencies. Single source of truth for Claude model pricing
// replacing both PRICING in aiModels.ts and RATES in aiPricing.ts.
//
// Verified from https://platform.claude.com/docs/en/about-claude/pricing on 2026-09-27.
// Anthropic has no pricing API; the Models API returns available models, while this table
// supplies their token & cache rates.

export const PRICING_VERIFIED_AT = '2026-09-27';
export const PRICING_SOURCE_URL = 'https://platform.claude.com/docs/en/about-claude/pricing';
export const PRICE_VERSION = '2026-09-27';

export type ClaudeModelPrice = {
  id: string;
  name: string;
  inputPerMTok: number; // USD per 1M tokens ($)
  outputPerMTok: number; // USD per 1M tokens ($)
  cacheWrite5mPerMTok: number; // 5-minute cache write ($/1M)
  cacheWrite1hPerMTok: number; // 1-hour cache write ($/1M)
  cacheReadPerMTok: number; // Cache read ($/1M)
  batchMultiplier: number; // 0.5 (half standard in/out)
};

/** Exact rates per canonical Claude model family/tier */
const CLAUDE_PRICING_TABLE: ClaudeModelPrice[] = [
  // Fable / Mythos families
  {
    id: 'claude-fable-5-1',
    name: 'Fable 5.1',
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWrite5mPerMTok: 12.5,
    cacheWrite1hPerMTok: 20,
    cacheReadPerMTok: 0.25,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-fable-5',
    name: 'Fable 5',
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWrite5mPerMTok: 12.5,
    cacheWrite1hPerMTok: 20,
    cacheReadPerMTok: 1.0,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-mythos-5-1',
    name: 'Mythos 5.1',
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWrite5mPerMTok: 12.5,
    cacheWrite1hPerMTok: 20,
    cacheReadPerMTok: 0.25,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-mythos-5',
    name: 'Mythos 5',
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWrite5mPerMTok: 12.5,
    cacheWrite1hPerMTok: 20,
    cacheReadPerMTok: 1.0,
    batchMultiplier: 0.5,
  },
  // Opus family
  {
    id: 'claude-opus-5-5',
    name: 'Opus 5.5',
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheWrite5mPerMTok: 5.0,
    cacheWrite1hPerMTok: 8.0,
    cacheReadPerMTok: 0.2,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-opus-5',
    name: 'Opus 5',
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10.0,
    cacheReadPerMTok: 0.5,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-opus-4-8',
    name: 'Opus 4.8',
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10.0,
    cacheReadPerMTok: 0.5,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-opus-4-7',
    name: 'Opus 4.7',
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10.0,
    cacheReadPerMTok: 0.5,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6',
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10.0,
    cacheReadPerMTok: 0.5,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-opus-4-5',
    name: 'Opus 4.5',
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10.0,
    cacheReadPerMTok: 0.5,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-opus-4-1',
    name: 'Opus 4.1',
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWrite5mPerMTok: 18.75,
    cacheWrite1hPerMTok: 30.0,
    cacheReadPerMTok: 1.5,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-opus-4',
    name: 'Opus 4',
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWrite5mPerMTok: 18.75,
    cacheWrite1hPerMTok: 30.0,
    cacheReadPerMTok: 1.5,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWrite5mPerMTok: 18.75,
    cacheWrite1hPerMTok: 30.0,
    cacheReadPerMTok: 1.5,
    batchMultiplier: 0.5,
  },
  // Sonnet family
  {
    id: 'claude-sonnet-5',
    name: 'Sonnet 5',
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheWrite5mPerMTok: 2.5,
    cacheWrite1hPerMTok: 4.0,
    cacheReadPerMTok: 0.2,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6.0,
    cacheReadPerMTok: 0.3,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Sonnet 4.5',
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6.0,
    cacheReadPerMTok: 0.3,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-sonnet-4',
    name: 'Sonnet 4',
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6.0,
    cacheReadPerMTok: 0.3,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6.0,
    cacheReadPerMTok: 0.3,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6.0,
    cacheReadPerMTok: 0.3,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6.0,
    cacheReadPerMTok: 0.3,
    batchMultiplier: 0.5,
  },
  // Haiku family
  {
    id: 'claude-haiku-4-5',
    name: 'Haiku 4.5',
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheWrite5mPerMTok: 1.25,
    cacheWrite1hPerMTok: 2.0,
    cacheReadPerMTok: 0.1,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    inputPerMTok: 0.8,
    outputPerMTok: 4,
    cacheWrite5mPerMTok: 1.0,
    cacheWrite1hPerMTok: 1.6,
    cacheReadPerMTok: 0.08,
    batchMultiplier: 0.5,
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    inputPerMTok: 0.25,
    outputPerMTok: 1.25,
    cacheWrite5mPerMTok: 0.3,
    cacheWrite1hPerMTok: 0.5,
    cacheReadPerMTok: 0.03,
    batchMultiplier: 0.5,
  },
];

type MatchRule = { match: RegExp; targetId: string };

const ALIAS_RULES: MatchRule[] = [
  { match: /^claude-fable-5-1(-|$)/, targetId: 'claude-fable-5-1' },
  { match: /^claude-fable-5(-|$)/, targetId: 'claude-fable-5' },
  { match: /^claude-mythos-5-1(-|$)/, targetId: 'claude-mythos-5-1' },
  { match: /^claude-mythos-5(-|$)/, targetId: 'claude-mythos-5' },
  { match: /^claude-opus-5-5(-|$)/, targetId: 'claude-opus-5-5' },
  { match: /^claude-opus-5(-|$)/, targetId: 'claude-opus-5' },
  { match: /^claude-opus-4-8(-|$)/, targetId: 'claude-opus-4-8' },
  { match: /^claude-opus-4-7(-|$)/, targetId: 'claude-opus-4-7' },
  { match: /^claude-opus-4-6(-|$)/, targetId: 'claude-opus-4-6' },
  { match: /^claude-opus-4-5(-|$)/, targetId: 'claude-opus-4-5' },
  { match: /^claude-opus-4-1(-|$)/, targetId: 'claude-opus-4-1' },
  { match: /^claude-opus-4(-|$)/, targetId: 'claude-opus-4' },
  { match: /^claude-3-opus(-|$)/, targetId: 'claude-3-opus' },
  { match: /^claude-sonnet-5(-|$)/, targetId: 'claude-sonnet-5' },
  { match: /^claude-sonnet-4-6(-|$)/, targetId: 'claude-sonnet-4-6' },
  { match: /^claude-sonnet-4-5(-|$)/, targetId: 'claude-sonnet-4-5' },
  { match: /^claude-sonnet-4(-|$)/, targetId: 'claude-sonnet-4' },
  { match: /^claude-3-7-sonnet(-|$)/, targetId: 'claude-3-7-sonnet' },
  { match: /^claude-3-5-sonnet(-|$)/, targetId: 'claude-3-5-sonnet' },
  { match: /^claude-3-sonnet(-|$)/, targetId: 'claude-3-sonnet' },
  { match: /^claude-haiku-4-5(-|$)/, targetId: 'claude-haiku-4-5' },
  { match: /^claude-haiku-4(-|$)/, targetId: 'claude-haiku-4-5' },
  { match: /^claude-3-5-haiku(-|$)/, targetId: 'claude-3-5-haiku' },
  { match: /^claude-3-haiku(-|$)/, targetId: 'claude-3-haiku' },
];

/** Look up pricing for a Claude model. Returns null if unknown. */
export function claudePrice(id: string): ClaudeModelPrice | null {
  const norm = (id || '').trim().toLowerCase();
  if (!norm.startsWith('claude-')) return null;

  // Exact ID check first
  const exact = CLAUDE_PRICING_TABLE.find((p) => p.id === norm);
  if (exact) return exact;

  // Pattern / alias match
  const rule = ALIAS_RULES.find((r) => r.match.test(norm));
  if (!rule) return null;

  return CLAUDE_PRICING_TABLE.find((p) => p.id === rule.targetId) ?? null;
}

/** All known Claude models with their pricing */
export function allClaudePrices(): ClaudeModelPrice[] {
  return [...CLAUDE_PRICING_TABLE];
}

const M = 1_000_000;

export type ClaudeRateMicros = {
  inputPerMTok: number; // micros per 1M tokens
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheWrite1hPerMTok: number;
  cacheReadPerMTok: number;
  isApproximate: boolean;
};

/** Conservative Sonnet-class fallback for unknown Claude models */
const FALLBACK_CLAUDE_RATE: ClaudeRateMicros = {
  inputPerMTok: 3 * M,
  outputPerMTok: 15 * M,
  cacheWrite5mPerMTok: 3.75 * M,
  cacheWrite1hPerMTok: 6 * M,
  cacheReadPerMTok: 0.3 * M,
  isApproximate: true,
};

/** Rate in micros per 1M tokens for spend calculation. Falls back conservatively with isApproximate=true */
export function claudeRateMicros(id: string): ClaudeRateMicros {
  const p = claudePrice(id);
  if (!p) return FALLBACK_CLAUDE_RATE;
  return {
    inputPerMTok: Math.round(p.inputPerMTok * M),
    outputPerMTok: Math.round(p.outputPerMTok * M),
    cacheWrite5mPerMTok: Math.round(p.cacheWrite5mPerMTok * M),
    cacheWrite1hPerMTok: Math.round(p.cacheWrite1hPerMTok * M),
    cacheReadPerMTok: Math.round(p.cacheReadPerMTok * M),
    isApproximate: false,
  };
}

// ─── Per-task cost estimation ───────────────────────────────────────────────

export type TaskType = 'receipt' | 'statement' | 'priceSearch' | 'itemFill';

export const TASK_TOKENS: Record<TaskType, { inputTokens: number; outputTokens: number; label: string }> = {
  receipt: { inputTokens: 1600, outputTokens: 400, label: 'receipt photo' },
  statement: { inputTokens: 2500, outputTokens: 800, label: 'statement page' },
  priceSearch: { inputTokens: 1500, outputTokens: 50, label: 'price check' },
  itemFill: { inputTokens: 1200, outputTokens: 300, label: 'item fill' },
};

/**
 * Estimate cost of a typical task in USD for a given model.
 * If model pricing is unknown, falls back to Sonnet 5 ($2 / $10).
 */
export function estimateTaskCost(model: string, task: TaskType): number {
  const p = claudePrice(model);
  const inRate = p ? p.inputPerMTok : 2;
  const outRate = p ? p.outputPerMTok : 10;
  const t = TASK_TOKENS[task];
  const cost = (t.inputTokens * inRate + t.outputTokens * outRate) / 1_000_000;
  return cost;
}

/** Format USD cost for UI, e.g. "$0.007" or "$0.02" */
export function formatTaskCost(cost: number): string {
  if (cost <= 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/** User-facing string: "About $0.007 per receipt photo · $0.013 per statement page · $0.004 per price check" */
export function taskCostSummary(model: string): string {
  const r = formatTaskCost(estimateTaskCost(model, 'receipt'));
  const s = formatTaskCost(estimateTaskCost(model, 'statement'));
  const p = formatTaskCost(estimateTaskCost(model, 'priceSearch'));
  return `About ${r} per receipt photo · ${s} per statement page · ${p} per price check`;
}

/** User-facing string: "$2 input / $10 output per 1M tokens" */
export function formatModelPrice(price: ClaudeModelPrice): string {
  return `$${price.inputPerMTok} input / $${price.outputPerMTok} output per 1M tokens`;
}

/** Tooltip text with cache rates */
export function formatCacheTooltip(price: ClaudeModelPrice): string {
  return `Cache write: $${price.cacheWrite5mPerMTok} (5m) / $${price.cacheWrite1hPerMTok} (1h) · Cache read: $${price.cacheReadPerMTok} per 1M tokens`;
}
