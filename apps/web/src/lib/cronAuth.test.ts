import { describe, it, expect, beforeEach } from 'vitest';
import { cronTokenMatches, checkCronAuth } from './cronAuth';

// The shared bearer gate for scheduler-driven endpoints. Two things here are easy to get wrong
// and expensive if wrong, so they are pinned directly rather than only through a route:
//   - timingSafeEqual THROWS when the two buffers differ in length, so the length guard is not
//     a micro-optimisation: without it, any wrong-length token crashes the handler instead of
//     being rejected (and a crash is a very loud oracle for "wrong length"),
//   - a missing CRON_SECRET must fail CLOSED (500), never fall through to "no secret, no check".

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://pharos.local/api/cron/alerts', { method: 'POST', headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'sekrit' };
});

describe('cronTokenMatches', () => {
  it('accepts an exact match', () => {
    expect(cronTokenMatches('sekrit', 'sekrit')).toBe(true);
  });

  it('rejects a same-length near-miss', () => {
    expect(cronTokenMatches('sekrix', 'sekrit')).toBe(false);
  });

  it('rejects shorter and longer tokens without throwing', () => {
    expect(() => cronTokenMatches('sek', 'sekrit')).not.toThrow();
    expect(cronTokenMatches('sek', 'sekrit')).toBe(false);
    expect(cronTokenMatches('sekrit-plus', 'sekrit')).toBe(false);
  });

  it('rejects the empty token against a real secret', () => {
    expect(cronTokenMatches('', 'sekrit')).toBe(false);
  });
});

describe('checkCronAuth', () => {
  it('returns null (authorised) for the right bearer token', () => {
    expect(checkCronAuth(req({ authorization: 'Bearer sekrit' }))).toBeNull();
  });

  it('fails closed with 500 when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronAuth(req({ authorization: 'Bearer sekrit' }))).toEqual({
      status: 500,
      error: 'CRON_SECRET is not configured',
    });
  });

  it('fails closed with 500 even when the caller sends no header at all', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronAuth(req())?.status).toBe(500);
  });

  it('rejects a missing header, a non-Bearer scheme, and a wrong token with 401', () => {
    expect(checkCronAuth(req())?.status).toBe(401);
    expect(checkCronAuth(req({ authorization: 'Basic sekrit' }))?.status).toBe(401);
    expect(checkCronAuth(req({ authorization: 'Bearer nope' }))?.status).toBe(401);
  });

  it('rejects "Bearer" with an empty token', () => {
    expect(checkCronAuth(req({ authorization: 'Bearer    ' }))?.status).toBe(401);
  });

  it('tolerates whitespace around the token', () => {
    expect(checkCronAuth(req({ authorization: 'Bearer  sekrit ' }))).toBeNull();
  });

  it('reads CRON_SECRET per call, so a late-injected secret is honoured', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronAuth(req({ authorization: 'Bearer later' }))?.status).toBe(500);

    process.env.CRON_SECRET = 'later';
    expect(checkCronAuth(req({ authorization: 'Bearer later' }))).toBeNull();
  });
});
