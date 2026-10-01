// The deployment-wide default VAT / sales-tax % (#402).

/** Neutral default: no tax assumed until the user sets one, matching lib/appSettings. */
export const NEUTRAL_VAT_RATE = 0;

/**
 * A default VAT rate as stored: 0–100, with 0 kept as 0. `Number(v) || 24` used to read an
 * explicit 0% as "missing", so the setup wizard (which starts at 0) and Settings both saved
 * 24% for a user who chose no VAT. Blank or non-numeric input means the neutral default.
 */
export function normalizeVatRate(value: unknown): number {
  if (value === null || value === undefined) return NEUTRAL_VAT_RATE;
  if (typeof value === 'string' && !value.trim()) return NEUTRAL_VAT_RATE;
  const n = Number(value);
  if (!Number.isFinite(n)) return NEUTRAL_VAT_RATE;
  return Math.max(0, Math.min(100, n));
}
