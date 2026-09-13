import { describe, it, expect } from 'vitest';
import { sentryDsn, sentryEnvironment, baseSentryOptions, scrubEvent, redactText } from './errorReporting';

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

describe('errorReporting · free-text redaction', () => {
  it('redacts personal data and secrets inside strings', () => {
    const t = redactText(
      'bill for maria@example.gr failed: IBAN GR16 0110 1250 0000 0001 2300 695, amount €1.234,56, ' +
      'card 4111 1111 1111 1111, token Bearer abcdefghijkl123, key sk_live_abcdefghijk12345, jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4',
    );
    expect(t).not.toMatch(/maria@|GR16|1\.234|4111|abcdefghijkl123|sk_live|eyJhbG/);
    expect(t).toContain('[email]');
    expect(t).toContain('[iban]');
    expect(t).toContain('[amount]');
  });

  it('keeps ordinary error text readable', () => {
    expect(redactText("Cannot read properties of undefined (reading 'map')")).toBe("Cannot read properties of undefined (reading 'map')");
  });

  it('applies to exception values, messages, breadcrumbs, extras, tags and custom contexts — not SDK contexts', () => {
    const e = scrubEvent({
      message: 'user a@b.co',
      exception: { values: [{ type: 'Error', value: 'no bill for a@b.co' }] },
      breadcrumbs: [{ category: 'console', message: 'saving 12,50 €', data: { arguments: ['a@b.co'] } }],
      extra: { form: { email: 'a@b.co' } },
      tags: { who: 'a@b.co' },
      contexts: { browser: { version: '128.0.6613.84' }, custom: { note: 'a@b.co' } },
    });
    const json = JSON.stringify(e);
    expect(json).not.toContain('a@b.co');
    expect(json).not.toContain('12,50');
    expect((e.contexts as Record<string, { version?: string }>).browser.version).toBe('128.0.6613.84');
  });
});
