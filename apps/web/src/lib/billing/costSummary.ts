import { formatCurrency } from '@/lib/i18n/format';

// PURE presentation helpers for AI cost metering — turn the ledger's integer "micros"
// into display-ready currency numbers and a compact "cost this month" summary object.
//
// The Usage ledger stores estimated AI spend as currency MICROS (millionths of one unit)
// to keep running totals integer-exact (see aiCost.ts). A billing/usage dashboard needs
// those as ordinary currency amounts plus a formatted label, and a single "this month"
// roll-up of calls + tokens + cost. No DB, no env, no Stripe — pure + unit-testable, safe
// from any runtime. Only the SaaS usage/billing surfaces consume it; the self-hosted app
// never reaches these (its usage is always zeroed / unmetered).

const MICROS_PER_UNIT = 1_000_000;

/** Coerce to a non-negative integer; non-finite/negative/non-number → 0. */
function nonNegInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Micros → whole currency units (e.g. 1_230_000 → 1.23). Garbage/negative → 0. */
export function microsToUnits(micros: number): number {
  if (typeof micros !== 'number' || !Number.isFinite(micros) || micros <= 0) return 0;
  return micros / MICROS_PER_UNIT;
}

/** Format ledger micros using an ISO currency and the reader's locale. */
export function formatMicros(micros: number, currency = 'EUR', locale = 'en'): string {
  return formatCurrency(microsToUnits(micros), currency, locale);
}

/** Raw current-period ledger figures a cost summary is built from (see UsageSnapshot). */
export type CostSummaryInput = {
  period: string;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiCostMicros: number;
};

/** Display-ready "cost this month" roll-up for a billing/usage dashboard. */
export type CostSummary = {
  period: string;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** inputTokens + outputTokens. */
  totalTokens: number;
  /** Raw integer micros (source of truth for the running total). */
  costMicros: number;
  /** costMicros as whole currency units (e.g. 1.23). */
  costUnits: number;
  /** costMicros formatted with the given currency (e.g. "€1.23"). */
  costFormatted: string;
};

/**
 * Build the "cost this month" summary from a period's raw ledger figures. Every numeric
 * field is coerced to a safe non-negative integer, so a partial/garbage snapshot can never
 * produce NaN or a negative in the read surface. `period` is passed through verbatim.
 */
export function buildCostSummary(input: CostSummaryInput, currency = 'EUR', locale = 'en'): CostSummary {
  const aiCalls = nonNegInt(input.aiCalls);
  const inputTokens = nonNegInt(input.aiInputTokens);
  const outputTokens = nonNegInt(input.aiOutputTokens);
  const costMicros = nonNegInt(input.aiCostMicros);
  return {
    period: input.period,
    aiCalls,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costMicros,
    costUnits: microsToUnits(costMicros),
    costFormatted: formatMicros(costMicros, currency, locale),
  };
}
