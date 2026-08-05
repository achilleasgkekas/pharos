import { describe, it, expect } from 'vitest';
import { aiMarkup, aiMinChargeMicros, aiCharge, formatMicros } from './aiBilling';

// Turning metered provider cost into what a tenant OWES. The failure modes here are money in
// both directions — invoicing someone who owes nothing, or silently eating the cost — so what
// is pinned is mostly when it refuses to bill.

const env = (markup?: string, min?: string) =>
  ({ SAAS_AI_MARKUP: markup, SAAS_AI_MIN_CHARGE: min }) as { SAAS_AI_MARKUP?: string; SAAS_AI_MIN_CHARGE?: string };

describe('aiMarkup', () => {
  it('reads a configured multiplier', () => {
    expect(aiMarkup(env('2'))).toBe(2);
    expect(aiMarkup(env('1.5'))).toBe(1.5);
  });

  it('is OFF when unset — an undecided price must not start invoicing', () => {
    expect(aiMarkup(env())).toBe(0);
    expect(aiMarkup(env('  '))).toBe(0);
  });

  it('refuses a markup below cost, which is a config mistake not a business model', () => {
    // Losing money per token is exactly the sort of thing nobody notices for months.
    expect(aiMarkup(env('0.5'))).toBe(0);
    expect(aiMarkup(env('0'))).toBe(0);
    expect(aiMarkup(env('-3'))).toBe(0);
  });

  it('refuses junk instead of guessing', () => {
    expect(aiMarkup(env('two'))).toBe(0);
    expect(aiMarkup(env('NaN'))).toBe(0);
    expect(aiMarkup(env('Infinity'))).toBe(0);
  });
});

describe('aiMinChargeMicros', () => {
  it('converts a currency amount to micros', () => {
    expect(aiMinChargeMicros(env('2', '0.50'))).toBe(500_000);
  });

  it('is 0 when unset or nonsense', () => {
    expect(aiMinChargeMicros(env('2'))).toBe(0);
    expect(aiMinChargeMicros(env('2', 'free'))).toBe(0);
    expect(aiMinChargeMicros(env('2', '-1'))).toBe(0);
  });
});

describe('aiCharge', () => {
  it('applies the markup to the metered cost', () => {
    // 1.00 of cost at 2x → 2.00 owed.
    expect(aiCharge(1_000_000, false, env('2'))).toMatchObject({
      costMicros: 1_000_000,
      billableMicros: 2_000_000,
      markup: 2,
      billable: true,
    });
  });

  it('bills nothing when no markup is configured', () => {
    const c = aiCharge(1_000_000, false, env());
    expect(c.billableMicros).toBe(0);
    expect(c.billable).toBe(false);
    expect(c.costMicros).toBe(1_000_000); // the cost is still reported, just not charged
  });

  it('never bills a workspace on its OWN key', () => {
    // It never touched the platform key. Charging it would be billing someone for
    // electricity they generated. Stated explicitly so a future metering change cannot
    // start invoicing them by accident.
    expect(aiCharge(5_000_000, true, env('2')).billableMicros).toBe(0);
  });

  it('bills nothing when nothing was used', () => {
    expect(aiCharge(0, false, env('2')).billable).toBe(false);
    expect(aiCharge(-5, false, env('2')).billableMicros).toBe(0);
    expect(aiCharge(NaN, false, env('2')).costMicros).toBe(0);
  });

  it('rounds UP to the cent, so a month of tiny calls is not free', () => {
    // 0.0001 of cost at 2x = 0.0002 → a fraction of a cent. Rounding down makes it vanish.
    const c = aiCharge(100, false, env('2'));
    expect(c.billableMicros).toBe(10_000); // one cent
  });

  it('withholds a charge under the configured minimum', () => {
    // 0.10 owed against a 0.50 floor: not worth invoicing, so it is not.
    expect(aiCharge(50_000, false, env('2', '0.50'))).toMatchObject({ billableMicros: 0, billable: false });
    // 0.60 owed clears it.
    expect(aiCharge(300_000, false, env('2', '0.50')).billable).toBe(true);
  });
});

describe('formatMicros', () => {
  it('renders micros as a two-decimal amount', () => {
    expect(formatMicros(2_000_000)).toBe('2.00');
    expect(formatMicros(12_345)).toBe('0.01');
    expect(formatMicros(0)).toBe('0.00');
    expect(formatMicros(NaN)).toBe('0.00');
  });
});
