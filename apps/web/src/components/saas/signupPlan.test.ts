import { describe, it, expect } from 'vitest';
import { signupPlanNotice } from './signupPlan';

// The pricing cards carry the visitor's choice in `?plan=`. Signup used to ignore it, so
// clicking "Pro €9" led to a generic form with no sign the choice registered.
//
// The rule is as much about what NOT to echo: an unrecognised value must not be reflected
// onto the page, and the copy must not promise a subscription that signup does not create.

describe('signupPlanNotice', () => {
  it('confirms a paid plan with its real name and price', () => {
    expect(signupPlanNotice('shared')).toMatchObject({ key: 'shared', name: 'Pro', priceLabel: '€9/month' });
    expect(signupPlanNotice('dedicated')).toMatchObject({ key: 'dedicated', priceLabel: '€29/month' });
  });

  it('is forgiving about case and padding in the link', () => {
    expect(signupPlanNotice(' SHARED ')?.key).toBe('shared');
  });

  it('says nothing for the free plan, which has nothing to confirm', () => {
    expect(signupPlanNotice('free')).toBeNull();
  });

  it('never reflects an unrecognised value back onto the page', () => {
    // Otherwise any string in the URL renders as a "plan", which is both a lie and a
    // reflection sink.
    expect(signupPlanNotice('enterprise')).toBeNull();
    expect(signupPlanNotice('<script>alert(1)</script>')).toBeNull();
    expect(signupPlanNotice('')).toBeNull();
    expect(signupPlanNotice(null)).toBeNull();
    expect(signupPlanNotice(undefined)).toBeNull();
  });

  it('tells the visitor what actually happens next, not that they are subscribing', () => {
    // Signup creates a FREE workspace; the plan is switched on afterwards by code. Copy
    // that implied otherwise would be a promise this form cannot keep.
    const n = signupPlanNotice('shared')!;
    expect(n.nextStep).toMatch(/create your account/i);
    expect(n.nextStep).toMatch(/activate/i);
    expect(n.nextStep).not.toMatch(/pay|charged|card/i);
  });
});
