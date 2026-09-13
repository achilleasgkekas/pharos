import { describe, it, expect } from 'vitest';
import { sentryDsn, sentryEnvironment, baseSentryOptions, scrubEvent, redactText, redactUrl } from './errorReporting';

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

describe('errorReporting · real event shapes (review round 2)', () => {
  it('redacts ids, emails and query/hash in URL paths', () => {
    expect(redactUrl('https://w.ph-aros.com/documents/64f1a2b3c4d5e6f708192a3b/share?x=1#y')).toBe('https://w.ph-aros.com/documents/:id/share');
    expect(redactUrl('https://w.ph-aros.com/u/maria%40example.gr/bills')).not.toContain('maria');
    expect(redactUrl('/items/1234567/edit')).toBe('/items/:id/edit');
  });

  it('allow-lists headers, so Referer and custom headers never leave', () => {
    const e = scrubEvent({ request: { headers: { Referer: 'https://w/expenses?q=secret', 'X-Custom': 'tok', 'Accept-Language': 'el', 'User-Agent': 'ua' } } });
    expect(e.request?.headers).toEqual({ 'Accept-Language': 'el', 'User-Agent': 'ua' });
  });

  it('never passes deep strings through unredacted — deep payloads are truncated instead', () => {
    let nested: Record<string, unknown> = { leak: 'deep a@b.co' };
    for (let i = 0; i < 20; i++) nested = { n: nested };
    const json = JSON.stringify(scrubEvent({ extra: nested }));
    expect(json).not.toContain('a@b.co');
    expect(json).toContain('[truncated]');
  });

  it('keeps stack frames usable while redacting the exception text', () => {
    const e = scrubEvent({
      exception: { values: [{ type: 'TypeError', value: 'bad total €12,00', stacktrace: { frames: [{ filename: 'app:///_next/static/chunks/app/bills/page-3f2a.js', function: 'BillRow', lineno: 42 }] } }] },
      transaction: '/bills/64f1a2b3c4d5e6f708192a3b',
      breadcrumbs: [{ category: 'navigation', data: { from: '/u/a@b.co', to: '/bills/64f1a2b3c4d5e6f708192a3b?tab=1' } }],
    });
    const v = (e.exception as { values: Array<{ value: string; stacktrace: { frames: Array<{ filename: string; lineno: number }> } }> }).values[0];
    expect(v.value).toBe('bad total [amount]');
    expect(v.stacktrace.frames[0]).toMatchObject({ filename: 'app:///_next/static/chunks/app/bills/page-3f2a.js', lineno: 42 });
    expect(JSON.stringify(e.breadcrumbs)).not.toMatch(/a@b\.co|tab=1|64f1a2/);
  });
});

describe('errorReporting · request allow-list (review round 3)', () => {
  it('drops env, fragment and any unknown request field; redacts allowed header values', () => {
    const e = scrubEvent({
      request: {
        method: 'POST',
        url: 'https://w.ph-aros.com/bills#iban=GR1601101250000000012300695',
        headers: { 'User-Agent': 'agent for a@b.co' },
        env: { REMOTE_ADDR: '84.205.1.2', SERVER_NAME: 'pharos-web' },
        fragment: 'iban=GR1601101250000000012300695',
        future_field: 'a@b.co',
      } as never,
    });
    expect(e.request).toEqual({ method: 'POST', url: 'https://w.ph-aros.com/bills', headers: { 'User-Agent': 'agent for [email]' } });
  });
});
