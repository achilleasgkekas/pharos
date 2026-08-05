/**
 * What a tenant OWES for AI, on top of what it cost us.
 *
 * The provider cost is already metered per tenant per period (`aiCostMicros` in
 * lib/billing/usage.ts, incremented on every metered call). This turns that number into a
 * billable one, so the operator can put one platform key in front of the whole fleet and
 * charge each workspace for what it actually used.
 *
 * Two knobs, both env, both PURE here so the arithmetic is testable and never guesses:
 *
 *     SAAS_AI_MARKUP="2"        # multiplier on provider cost. 2 = charge double.
 *     SAAS_AI_MIN_CHARGE="0.50" # don't invoice under this (EUR); below it, bill nothing.
 *
 * UNSET MEANS OFF. With no markup configured nothing is billable at all — a deployment that
 * has not decided its pricing must not start quietly producing invoices, and "we forgot to
 * set it" should read as €0.00 owed rather than as cost silently passed through.
 */

/** Micros are millionths of a currency unit — how `aiCostMicros` is stored. */
const MICROS_PER_UNIT = 1_000_000;

type Env = { SAAS_AI_MARKUP?: string | undefined; SAAS_AI_MIN_CHARGE?: string | undefined; [k: string]: string | undefined };

export type AiCharge = {
  /** What the provider cost us, in micros. Straight from the meter. */
  costMicros: number;
  /** What the tenant owes, in micros. 0 when billing is off or under the minimum. */
  billableMicros: number;
  /** The multiplier applied. 0 when billing is not configured. */
  markup: number;
  /** True when a real charge came out of it (useful for "N billable workspaces"). */
  billable: boolean;
};

/**
 * The configured markup, or 0 (= billing off).
 *
 * Rejects anything that is not a finite number above zero. A markup below 1 would mean
 * charging LESS than the call cost, which is a config mistake rather than a business model,
 * so it is refused too — quietly losing money per token is exactly the sort of thing nobody
 * notices for months.
 */
export function aiMarkup(env: Env = process.env): number {
  const raw = Number((env.SAAS_AI_MARKUP || '').trim());
  if (!Number.isFinite(raw) || raw < 1) return 0;
  return raw;
}

/** Minimum invoiceable amount in micros; 0 when unset or unparseable. */
export function aiMinChargeMicros(env: Env = process.env): number {
  const raw = Number((env.SAAS_AI_MIN_CHARGE || '').trim());
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw * MICROS_PER_UNIT);
}

/**
 * Turn a tenant's metered cost into what it owes.
 *
 * `byoKey` short-circuits to nothing owed: a workspace on its own provider key never touched
 * the platform key, so charging it would be billing someone for electricity they generated.
 * Its cost is 0 anyway (BYO calls are not metered), but saying it explicitly means a future
 * metering change cannot start invoicing them by accident.
 */
export function aiCharge(costMicros: number, byoKey = false, env: Env = process.env): AiCharge {
  const cost = Number.isFinite(costMicros) && costMicros > 0 ? Math.round(costMicros) : 0;
  const markup = aiMarkup(env);
  if (byoKey || markup === 0 || cost === 0) {
    return { costMicros: cost, billableMicros: 0, markup, billable: false };
  }
  // Round UP to the cent: a fraction of a cent is not invoiceable, and rounding down would
  // make a month of small calls free.
  const raw = cost * markup;
  const cents = Math.ceil(raw / 10_000);
  const billableMicros = cents * 10_000;
  if (billableMicros < aiMinChargeMicros(env)) {
    return { costMicros: cost, billableMicros: 0, markup, billable: false };
  }
  return { costMicros: cost, billableMicros, markup, billable: true };
}

/** Format micros as a currency amount for display (2 decimals, no symbol). */
export function formatMicros(micros: number): string {
  const n = Number.isFinite(micros) ? micros : 0;
  return (n / MICROS_PER_UNIT).toFixed(2);
}
