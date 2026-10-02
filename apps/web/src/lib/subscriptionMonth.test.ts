import { describe, it, expect } from 'vitest';
import { chargedInMonth, chargesByMonth } from './subscriptionMonth';

const sub = (amount: number, billingCycle: string, nextRenewal: string, active = true) => ({ amount, billingCycle, nextRenewal, startDate: nextRenewal, active });

describe('chargedInMonth', () => {
  const subs = [sub(10, 'monthly', '2026-10-15'), sub(80, 'monthly', '2026-10-05'), sub(120, 'yearly', '2027-02-10')];
  it('counts a yearly plan only in the month it is charged', () => {
    expect(chargedInMonth(subs, 2026, 10)).toBe(90); // November
    expect(chargedInMonth(subs, 2027, 1)).toBe(210); // February
  });
  it('counts a weekly plan as many times as it falls in the month', () => {
    expect(chargedInMonth([sub(5, 'weekly', '2026-10-01')], 2026, 9)).toBe(25); // 1, 8, 15, 22, 29 October
  });
  it('skips cancelled plans and a lifetime plan outside its month', () => {
    expect(chargedInMonth([sub(10, 'monthly', '2026-10-15', false), sub(99, 'lifetime', '2026-03-01')], 2026, 10)).toBe(0);
  });
  it('lists twelve months starting with the current one', () => {
    const rows = chargesByMonth(subs, new Date('2026-10-20T00:00:00Z'));
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ year: 2026, month: 9 });
    expect(rows.find((r) => r.month === 1)?.total).toBe(210);
  });
});
