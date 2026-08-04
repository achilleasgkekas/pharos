import { describe, it, expect } from 'vitest';
import { isSaasPublicPath, SAAS_LOGIN_PATH } from './middleware';

// The SaaS front door. Before this, `if (saasMode()) return pass()` let EVERY request
// through on the reasoning that authorization happened one layer in. It did for the account
// pages and the operator console; it did not for the product itself. Verified live on
// 2026-08-04: https://home.ph-aros.com/ served the hub, all module cards and the onboarding
// checklist to a browser with no session.
//
// This list is the whole security boundary now, so it is pinned deny-by-default: a new page
// is GATED unless someone deliberately adds it here, which is the direction an error should
// go in.

describe('isSaasPublicPath — what a signed-out visitor may still reach', () => {
  it('lets the auth pages through, or there is no way in at all', () => {
    expect(isSaasPublicPath(SAAS_LOGIN_PATH)).toBe(true);
    expect(isSaasPublicPath('/account/signup')).toBe(true);
    expect(isSaasPublicPath('/account/reset')).toBe(true);
    expect(isSaasPublicPath('/account/reset/confirm')).toBe(true);
    expect(isSaasPublicPath('/account/verify')).toBe(true);
  });

  it('lets /api/* through, because those routes answer with a status, not a redirect', () => {
    // Bearer tokens, invite tokens, the Stripe webhook signature and the cron secret all
    // authenticate per route; a login-page redirect would break every one of them.
    expect(isSaasPublicPath('/api/saas/invites/accept')).toBe(true);
    expect(isSaasPublicPath('/api/v1/items')).toBe(true);
    expect(isSaasPublicPath('/api/cron/alerts')).toBe(true);
  });

  it('gates the product itself — the actual reported hole', () => {
    expect(isSaasPublicPath('/')).toBe(false);
    expect(isSaasPublicPath('/items')).toBe(false);
    expect(isSaasPublicPath('/receipts')).toBe(false);
    expect(isSaasPublicPath('/settings')).toBe(false);
    expect(isSaasPublicPath('/reports')).toBe(false);
  });

  it('gates the signed-in account area and the operator console', () => {
    expect(isSaasPublicPath('/account')).toBe(false);
    expect(isSaasPublicPath('/account/settings')).toBe(false);
    expect(isSaasPublicPath('/account/workspace/billing')).toBe(false);
    expect(isSaasPublicPath('/admin')).toBe(false);
    expect(isSaasPublicPath('/admin/tenants')).toBe(false);
  });

  it('gates the self-hosted first-run wizard, which no hosted visitor should ever be offered', () => {
    // Handing /setup to a stranger is how someone gets shown "create your admin account"
    // on a workspace that already belongs to a paying customer.
    expect(isSaasPublicPath('/setup')).toBe(false);
    expect(isSaasPublicPath('/login')).toBe(false);
  });

  it('does not open a gated path because it merely starts like a public one', () => {
    expect(isSaasPublicPath('/account/signup/../workspace')).toBe(false);
    expect(isSaasPublicPath('/account/verifying-something')).toBe(false);
    expect(isSaasPublicPath('/account/loginx')).toBe(false);
    expect(isSaasPublicPath('/apiv1/items')).toBe(false);
  });
});
