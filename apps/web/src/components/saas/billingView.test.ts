import { describe, it, expect } from 'vitest';
import {
  priceLabel,
  aiLabel,
  storageLabel,
  seatsLabel,
  planCards,
  billingErrorMessage,
} from './billingView';

describe('billingView labels', () => {
  it('priceLabel: Free for 0, €N / mo otherwise', () => {
    expect(priceLabel(0)).toBe('Free');
    expect(priceLabel(9)).toBe('€9 / mo');
  });

  it('aiLabel: unlimited vs grouped count', () => {
    expect(aiLabel(null)).toBe('Unlimited AI calls');
    expect(aiLabel(1000)).toBe('1,000 AI calls / mo');
  });

  it('storageLabel groups thousands', () => {
    expect(storageLabel(500)).toBe('500 GB storage');
    expect(storageLabel(5)).toBe('5 GB storage');
  });

  it('seatsLabel: unlimited / singular / plural', () => {
    expect(seatsLabel(null)).toBe('Unlimited seats');
    expect(seatsLabel(1)).toBe('1 seat');
    expect(seatsLabel(5)).toBe('5 seats');
  });
});

describe('planCards', () => {
  it('returns free, shared, dedicated in order', () => {
    const cards = planCards({ currentPlan: 'free', canManage: true, hasSubscription: false });
    expect(cards.map((c) => c.key)).toEqual(['free', 'shared', 'dedicated']);
  });

  it('flags the current plan', () => {
    const cards = planCards({ currentPlan: 'shared', canManage: true, hasSubscription: false });
    expect(cards.find((c) => c.key === 'shared')?.current).toBe(true);
    expect(cards.filter((c) => c.current)).toHaveLength(1);
  });

  it('unknown/blank current plan falls back to free', () => {
    const cards = planCards({ currentPlan: null, canManage: true, hasSubscription: false });
    expect(cards.find((c) => c.key === 'free')?.current).toBe(true);
  });

  it('a manager with no subscription can check out the paid non-current plans', () => {
    const cards = planCards({ currentPlan: 'free', canManage: true, hasSubscription: false });
    expect(cards.find((c) => c.key === 'free')?.checkoutable).toBe(false); // free is not paid
    expect(cards.find((c) => c.key === 'shared')?.checkoutable).toBe(true);
    expect(cards.find((c) => c.key === 'dedicated')?.checkoutable).toBe(true);
  });

  it('nothing is checkoutable once a subscription exists (portal handles changes)', () => {
    const cards = planCards({ currentPlan: 'shared', canManage: true, hasSubscription: true });
    expect(cards.every((c) => !c.checkoutable)).toBe(true);
  });

  it('members (cannot manage) get no checkoutable plans', () => {
    const cards = planCards({ currentPlan: 'free', canManage: false, hasSubscription: false });
    expect(cards.every((c) => !c.checkoutable)).toBe(true);
  });

  it('the current paid plan is not re-checkoutable', () => {
    const cards = planCards({ currentPlan: 'shared', canManage: true, hasSubscription: false });
    expect(cards.find((c) => c.key === 'shared')?.checkoutable).toBe(false);
    expect(cards.find((c) => c.key === 'dedicated')?.checkoutable).toBe(true);
  });
});

describe('billingErrorMessage', () => {
  it('409 from checkout says the workspace ALREADY subscribes and points at the portal (#221)', () => {
    const msg = billingErrorMessage('checkout', 409, 'this workspace already has an active subscription');
    expect(msg).toContain('already has an active subscription');
    expect(msg).toContain('Manage billing');
  });

  it('409 from the portal still says there is NOTHING to manage', () => {
    expect(billingErrorMessage('portal', 409, undefined)).toBe(
      'No active subscription to manage. Start a plan first.'
    );
  });

  it('the two 409 messages are not the same text, which is the whole point of the action arg', () => {
    expect(billingErrorMessage('checkout', 409, undefined)).not.toBe(
      billingErrorMessage('portal', 409, undefined)
    );
  });

  it('shared statuses read the same whichever route was called', () => {
    for (const action of ['checkout', 'portal'] as const) {
      expect(billingErrorMessage(action, 503, undefined)).toBe(
        'Billing is not configured on this deployment yet.'
      );
      expect(billingErrorMessage(action, 502, undefined)).toBe(
        'The billing provider is temporarily unavailable. Try again shortly.'
      );
      expect(billingErrorMessage(action, 403, undefined)).toBe(
        'Only owners and admins can change billing.'
      );
    }
  });

  it('an unmapped status falls back to the API error, then to a generic line', () => {
    expect(billingErrorMessage('checkout', 400, 'plan must be a paid plan')).toBe(
      'plan must be a paid plan'
    );
    expect(billingErrorMessage('checkout', 500, undefined)).toBe(
      'Something went wrong. Please try again.'
    );
  });
});
