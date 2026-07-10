// PURE + client-safe view model for a quota progress bar (SaaS usage deep-dive). Turns a
// QuotaStatus-shaped figure (used / limit / ratio, from lib/billing/usage) into a render-ready
// { unlimited, percent, tone, remaining } object so the presentational <QuotaBar> stays dumb and
// the threshold logic is unit-tested without React. All defensive: a garbage/negative/partial
// snapshot can never produce NaN, a negative width, or a >100 bar. Only the SaaS usage surface
// consumes it; the self-hosted app never reaches here (its quotas are always unlimited).

/** Input mirrors the fields a lib/billing QuotaStatus carries (ratio optional; computed if absent). */
export type QuotaBarInput = {
  /** Amount consumed this period. */
  used: number;
  /** Plan allowance; null = unlimited. */
  limit: number | null;
  /** 0..1 fraction already used (preferred when present); otherwise derived from used/limit. */
  ratio?: number;
};

/** Fill severity — drives the bar colour. */
export type QuotaTone = 'ok' | 'warn' | 'full';

export type QuotaBarView = {
  /** No limit → no meaningful bar (render a flat "unlimited" track). */
  unlimited: boolean;
  /** Integer 0..100 for the fill width + a "N% used" label. */
  percent: number;
  /** <75% ok · 75–99% warn · ≥100% full. Unlimited is always ok. */
  tone: QuotaTone;
  /** limit − used, floored at 0; null when unlimited. */
  remaining: number | null;
};

/** Coerce to a finite non-negative number; garbage → 0. */
function nonNeg(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Build the quota-bar view. Unlimited (limit null / ≤0) renders a flat 0% "ok" track with no
 * remaining figure. Otherwise the fill fraction prefers an explicit `ratio` (clamped 0..1) and
 * falls back to used/limit; percent is rounded to a whole number and clamped 0..100 so an
 * over-quota tenant shows a full bar rather than an overflow. Tone thresholds: 75% → warn,
 * 100% → full.
 */
export function quotaBarView(input: QuotaBarInput): QuotaBarView {
  const used = nonNeg(input.used);
  const limit = input.limit;

  if (limit === null || !(typeof limit === 'number' && Number.isFinite(limit)) || limit <= 0) {
    return { unlimited: true, percent: 0, tone: 'ok', remaining: null };
  }

  const rawRatio =
    typeof input.ratio === 'number' && Number.isFinite(input.ratio) ? input.ratio : used / limit;
  const ratio = Math.min(1, Math.max(0, rawRatio));
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  const tone: QuotaTone = used >= limit ? 'full' : ratio >= 0.75 ? 'warn' : 'ok';
  const remaining = Math.max(0, limit - used);

  return { unlimited: false, percent, tone, remaining };
}
