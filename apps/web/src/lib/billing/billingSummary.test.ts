import { describe, it, expect } from 'vitest';
import { buildBillingSummary, billingAction } from './billingSummary';

// Only the PURE builder + action chooser are unit-tested. The GET route is SaaS-gated
// (404 when SAAS_MODE off) and exercised via integration; the authz/read shape it exposes
// is asserted here through buildBillingSummary + billingAction.

describe('billingAction', () => {
  it('gives members a read-only view regardless of subscription state', () => {
    expect(billingAction(false, false)).toBe('view');
    expect(billingAction(true, false)).toBe('view');
  });

  it('offers managers manage when subscribed, subscribe otherwise', () => {
    expect(billingAction(true, true)).toBe('manage');
    expect(billingAction(false, true)).toBe('subscribe');
  });
});

describe('buildBillingSummary', () => {
  const base = {
    plan: 'shared',
    status: 'active',
    role: 'owner',
    billingCustomerId: 'cus_123',
    billingSubscriptionId: 'sub_123',
    trialEndsAt: null,
    billingConfigured: true,
  } as const;

  it('maps plan metadata from the plan table', () => {
    const s = buildBillingSummary(base);
    expect(s.plan).toEqual({
      key: 'shared',
      name: 'Pro',
      priceMonthlyEUR: 9,
      tier: 'shared',
      storageGB: 50,
      aiCallsPerMonth: 1000,
      customDomain: false,
    });
  });

  it('reports an active subscription + manage action for an owner with a Stripe sub', () => {
    const s = buildBillingSummary(base);
    expect(s.subscription).toEqual({
      customerId: 'cus_123',
      subscriptionId: 'sub_123',
      active: true,
    });
    expect(s.canManage).toBe(true);
    expect(s.action).toBe('manage');
    expect(s.billingConfigured).toBe(true);
  });

  it('offers subscribe when there is no subscription yet', () => {
    const s = buildBillingSummary({ ...base, billingSubscriptionId: null, billingCustomerId: null });
    expect(s.subscription.active).toBe(false);
    expect(s.action).toBe('subscribe');
  });

  it('gives a member a read-only view even with an active subscription', () => {
    const s = buildBillingSummary({ ...base, role: 'member' });
    expect(s.canManage).toBe(false);
    expect(s.action).toBe('view');
  });

  it('falls back to the free plan for an unknown/legacy plan key', () => {
    const s = buildBillingSummary({ ...base, plan: 'enterprise' });
    expect(s.plan.key).toBe('free');
    expect(s.plan.priceMonthlyEUR).toBe(0);
  });

  it('defaults a blank status to trialing', () => {
    expect(buildBillingSummary({ ...base, status: null }).status).toBe('trialing');
    expect(buildBillingSummary({ ...base, status: '' }).status).toBe('trialing');
  });

  it('serializes trialEndsAt to ISO and tolerates strings / bad values', () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    expect(buildBillingSummary({ ...base, trialEndsAt: d }).trialEndsAt).toBe(
      '2026-08-01T00:00:00.000Z'
    );
    expect(buildBillingSummary({ ...base, trialEndsAt: '2026-08-01T00:00:00.000Z' }).trialEndsAt).toBe(
      '2026-08-01T00:00:00.000Z'
    );
    expect(buildBillingSummary({ ...base, trialEndsAt: 'not-a-date' }).trialEndsAt).toBeNull();
    expect(buildBillingSummary({ ...base, trialEndsAt: null }).trialEndsAt).toBeNull();
  });

  it('trims empty Stripe ids to null and reflects an unconfigured backend', () => {
    const s = buildBillingSummary({
      ...base,
      billingCustomerId: '  ',
      billingSubscriptionId: '',
      billingConfigured: false,
    });
    expect(s.subscription.customerId).toBeNull();
    expect(s.subscription.subscriptionId).toBeNull();
    expect(s.subscription.active).toBe(false);
    expect(s.billingConfigured).toBe(false);
    expect(s.action).toBe('subscribe');
  });
});
