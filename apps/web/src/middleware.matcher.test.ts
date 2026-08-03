import { describe, it, expect } from 'vitest';
import { config } from './middleware';

// The middleware matcher decides which paths hit the session gate at all, and getting it wrong
// fails in two opposite, equally silent ways:
//   - too GREEDY: a bearer-authenticated endpoint (MCP connector, cron scheduler) is answered
//     with a bare 401 before its handler ever runs, which looks exactly like a bad token. This
//     is not hypothetical — POST /api/cron/alerts was live-probed returning the middleware's
//     plain-text "Unauthorized" while its own auth was perfectly fine (fixed by adding
//     api/cron to the exclusion list).
//   - too LOOSE: /api/files (receipts, statement PDFs, item photos) escapes the gate and every
//     stored document is served to anyone who knows a URL.
// Unit tests of a route's exported POST() call the handler DIRECTLY and therefore cannot catch
// either case, so the matcher is pinned here on its own.

/** The matcher entry is already a regex body in Next's syntax; anchor it the way Next does. */
const gate = new RegExp(`^${config.matcher[0]}$`);
const isGated = (path: string) => gate.test(path);

describe('middleware matcher — bearer-authenticated endpoints bypass the session gate', () => {
  it.each([
    ['/api/cron/alerts', 'the self-hosted alert sweep, authenticated by CRON_SECRET'],
    ['/api/mcp', 'MCP connector, authenticated by its own bearer'],
    ['/api/v1/items', 'the mobile REST API, authenticated by its own bearer'],
    ['/api/auth/login', 'the auth actions themselves'],
  ])('%s is NOT gated (%s)', (path) => {
    expect(isGated(path)).toBe(false);
  });
});

describe('middleware matcher — everything else stays gated', () => {
  it.each([
    ['/api/files/receipts/2026/06/scan.pdf', 'stored receipts must never be public'],
    ['/api/calendar.ics', 'the calendar feed is not bearer-authenticated'],
    ['/receipts', 'ordinary pages'],
    ['/settings', 'ordinary pages'],
    ['/', 'the dashboard'],
  ])('%s IS gated (%s)', (path) => {
    expect(isGated(path)).toBe(true);
  });

  it('keeps /login and /setup matched, since the middleware stamps x-pathname on them', () => {
    // They are matched on purpose and then passed through unauthenticated inside the handler,
    // rather than excluded here — the root layout needs the header to render them chrome-less.
    expect(isGated('/login')).toBe(true);
    expect(isGated('/setup')).toBe(true);
  });
});
