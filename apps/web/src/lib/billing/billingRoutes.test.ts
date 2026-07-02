import { describe, it, expect } from 'vitest';
import {
  canManageBilling,
  checkoutablePlan,
  normalizeBase,
  pickBaseUrl,
  checkoutUrls,
  portalReturnUrl,
} from './billingRoutes';

// Only the PURE helpers are unit-tested. The route handlers (checkout/portal) and the
// node-only resolveBillingSession are SaaS-gated (404 when SAAS_MODE off) and exercised via
// integration; the auth/authz shape is asserted here through canManageBilling.

describe('canManageBilling', () => {
  it('allows owner and admin', () => {
    expect(canManageBilling('owner')).toBe(true);
    expect(canManageBilling('admin')).toBe(true);
  });

  it('denies member and unknown/empty roles', () => {
    expect(canManageBilling('member')).toBe(false);
    expect(canManageBilling('')).toBe(false);
    expect(canManageBilling(null)).toBe(false);
    expect(canManageBilling(undefined)).toBe(false);
    expect(canManageBilling('viewer')).toBe(false);
  });
});

describe('checkoutablePlan', () => {
  it('accepts paid plans', () => {
    expect(checkoutablePlan('shared')).toBe('shared');
    expect(checkoutablePlan('dedicated')).toBe('dedicated');
  });

  it('rejects free (no Stripe price), unknown and empty', () => {
    expect(checkoutablePlan('free')).toBeNull();
    expect(checkoutablePlan('enterprise')).toBeNull();
    expect(checkoutablePlan('')).toBeNull();
    expect(checkoutablePlan(null)).toBeNull();
    expect(checkoutablePlan(undefined)).toBeNull();
  });
});

describe('normalizeBase', () => {
  it('strips trailing slashes and trims', () => {
    expect(normalizeBase('https://x.com/')).toBe('https://x.com');
    expect(normalizeBase('https://x.com///')).toBe('https://x.com');
    expect(normalizeBase('  https://x.com  ')).toBe('https://x.com');
    expect(normalizeBase('')).toBe('');
  });
});

describe('pickBaseUrl', () => {
  it('prefers the configured env base over the request origin', () => {
    expect(pickBaseUrl('https://app.ph-aros.com/', 'https://internal:3000')).toBe(
      'https://app.ph-aros.com'
    );
  });

  it('falls back to the request origin when env is unset/blank', () => {
    expect(pickBaseUrl('', 'https://acme.ph-aros.com')).toBe('https://acme.ph-aros.com');
    expect(pickBaseUrl(null, 'https://acme.ph-aros.com/')).toBe('https://acme.ph-aros.com');
    expect(pickBaseUrl(undefined, 'https://acme.ph-aros.com')).toBe('https://acme.ph-aros.com');
  });
});

describe('checkoutUrls', () => {
  it('builds success/cancel URLs and keeps the Stripe session template token literal', () => {
    const { successUrl, cancelUrl } = checkoutUrls('https://acme.ph-aros.com/');
    expect(successUrl).toBe(
      'https://acme.ph-aros.com/settings?billing=success&session_id={CHECKOUT_SESSION_ID}'
    );
    expect(cancelUrl).toBe('https://acme.ph-aros.com/settings?billing=cancelled');
  });
});

describe('portalReturnUrl', () => {
  it('builds the portal return URL', () => {
    expect(portalReturnUrl('https://acme.ph-aros.com')).toBe(
      'https://acme.ph-aros.com/settings?billing=portal_return'
    );
  });
});
