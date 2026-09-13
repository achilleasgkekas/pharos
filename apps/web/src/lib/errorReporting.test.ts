import { describe, it, expect } from 'vitest';
import { sentryDsn, sentryEnvironment, baseSentryOptions, scrubEvent } from './errorReporting';

describe('errorReporting · off by default', () => {
  it('returns no DSN when unset or malformed, so the SDK is never loaded', () => {
    expect(sentryDsn({})).toBeNull();
    expect(sentryDsn({ SENTRY_DSN: '' })).toBeNull();
    expect(sentryDsn({ SENTRY_DSN: 'not-a-dsn' })).toBeNull();
    expect(sentryDsn({ SENTRY_DSN: 'http://abc@o1.ingest.sentry.io/123' })).toBeNull();
  });

  it('accepts a real-shaped DSN', () => {
    const dsn = 'https://abc123@o42.ingest.de.sentry.io/4507';
    expect(sentryDsn({ SENTRY_DSN: ` ${dsn} ` })).toBe(dsn);
  });

  it('labels the two stacks, with an explicit override', () => {
    expect(sentryEnvironment(true, {})).toBe('saas');
    expect(sentryEnvironment(false, {})).toBe('self-hosted');
    expect(sentryEnvironment(true, { SENTRY_ENVIRONMENT: 'staging' })).toBe('staging');
  });

  it('never enables PII or tracing', () => {
    const o = baseSentryOptions('https://a@b/1', 'saas');
    expect(o.sendDefaultPii).toBe(false);
    expect(o.tracesSampleRate).toBe(0);
  });
});

describe('errorReporting · scrubEvent', () => {
  it('removes identity, cookies, bodies, query strings and sensitive headers', () => {
    const e = scrubEvent({
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4', username: 'x' },
      request: {
        url: 'https://w.ph-aros.com/expenses?q=pharmacy',
        cookies: { pharos_account: 'jwt' },
        data: { amount: 42 },
        query_string: 'q=pharmacy',
        headers: { Cookie: 'x', Authorization: 'Bearer t', 'X-Forwarded-For': '1.2.3.4', 'User-Agent': 'ua' },
      },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api/search?q=secret', method: 'GET' } }],
    });
    expect(e.user).toEqual({ id: 'u1' });
    expect(e.request?.cookies).toBeUndefined();
    expect(e.request?.data).toBeUndefined();
    expect(e.request?.query_string).toBeUndefined();
    expect(e.request?.url).toBe('https://w.ph-aros.com/expenses');
    expect(e.request?.headers).toEqual({ 'User-Agent': 'ua' });
    expect(e.breadcrumbs?.[0].data?.url).toBe('/api/search');
  });

  it('drops the user entirely when there is no opaque id', () => {
    expect(scrubEvent({ user: { email: 'a@b.c' } }).user).toBeNull();
  });
});
