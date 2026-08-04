import { describe, it, expect } from 'vitest';
import { config } from '@/middleware';

// The three SaaS scheduler endpoints in this folder authenticate with CRON_SECRET, never with a
// session cookie, so they only work if the middleware's session gate does not match them first.
// That is a property of `config.matcher`, NOT of the handlers, and unit tests that call the
// exported POST() directly cannot see it: they bypass the middleware entirely and pass happily
// while a real scheduler gets a bare plain-text 401 that reads exactly like a wrong token. This
// happened for real — the routes were reported (ask-inbox pharos-daily-dev-20260803-1145) as
// live-returning `401 Unauthorized` from the middleware while they lived under /api/saas/.
//
// They now live under /api/cron/, which the matcher excludes. This file pins that, next to the
// routes, so moving or renaming one of them cannot silently re-open the hole. It deliberately
// does not touch the top-level middleware.matcher.test.ts (owned elsewhere); the two overlap by
// design, since a gap here is invisible until a scheduler run quietly stops doing anything.

/** The matcher entry is a regex body in Next's syntax; anchor it the way Next does. */
const gate = new RegExp(`^${config.matcher[0]}$`);
const isGated = (path: string) => gate.test(path);

describe('SaaS cron endpoints bypass the session gate', () => {
  it.each([
    ['/api/cron/saas/usage-sample', 'per-tenant storage sampling for the usage ledger'],
    ['/api/cron/saas/trials-sweep', 'trial warn + lapse suspension sweep'],
    ['/api/cron/saas/erasure-purge', 'GDPR Art. 17 purge scan (report-only)'],
  ])('%s is NOT gated (%s)', (path) => {
    expect(isGated(path)).toBe(false);
  });

  it('the whole /api/cron/saas/ prefix is excluded, so a fourth endpoint here is safe by default', () => {
    expect(isGated('/api/cron/saas/anything-added-later')).toBe(false);
  });
});

describe('the old /api/saas/ locations stay gated', () => {
  // Kept as a live reminder of why the routes moved: under this prefix a scheduler request is
  // answered by the middleware, and only reached its handler because of an unrelated SaaS-mode
  // short-circuit added for /account/signup. Session-authenticated SaaS routes SHOULD be gated.
  it.each([
    ['/api/saas/usage/sample', 'former location of the storage sampler'],
    ['/api/saas/trials/sweep', 'former location of the trial sweep'],
    ['/api/saas/workspace/erasure/purge', 'former location of the purge scan'],
    ['/api/saas/workspace/erasure', 'the session-authenticated sibling, which stays put'],
  ])('%s IS gated (%s)', (path) => {
    expect(isGated(path)).toBe(true);
  });
});
