import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { signWebhookPayload, coerceWebhookSubscription } from './webhooks';

describe('signWebhookPayload', () => {
  it('matches a manually-computed Stripe-style HMAC', () => {
    const secret = 'shh';
    const ts = 1750000000;
    const body = '{"event":"receipt.parsed","data":{},"ts":1750000000}';
    const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    expect(signWebhookPayload(secret, ts, body)).toBe(`t=${ts},v1=${expected}`);
  });

  it('is deterministic and changes with any input', () => {
    const a = signWebhookPayload('secret', 100, 'body');
    const b = signWebhookPayload('secret', 100, 'body');
    expect(a).toBe(b);
    expect(signWebhookPayload('other', 100, 'body')).not.toBe(a);
    expect(signWebhookPayload('secret', 101, 'body')).not.toBe(a);
    expect(signWebhookPayload('secret', 100, 'other')).not.toBe(a);
  });
});

describe('coerceWebhookSubscription', () => {
  it('rejects non-objects and blank URLs', () => {
    expect(coerceWebhookSubscription(null, 0)).toBeNull();
    expect(coerceWebhookSubscription('x', 0)).toBeNull();
    expect(coerceWebhookSubscription({ url: '' }, 0)).toBeNull();
    expect(coerceWebhookSubscription({ url: '   ' }, 0)).toBeNull();
  });

  it('normalizes a full subscription and drops unknown event names', () => {
    const sub = coerceWebhookSubscription(
      {
        id: 'w1',
        url: 'https://example.com/hook',
        secret: 'abc',
        enabled: true,
        label: 'Home Assistant',
        events: ['receipt.parsed', 'not.a.real.event', 'budget.exceeded'],
      },
      0,
    );
    expect(sub).toEqual({
      id: 'w1',
      url: 'https://example.com/hook',
      secret: 'abc',
      enabled: true,
      label: 'Home Assistant',
      events: ['receipt.parsed', 'budget.exceeded'],
    });
  });

  it('defaults id from index and enabled to true when omitted', () => {
    const sub = coerceWebhookSubscription({ url: 'https://x.test' }, 2);
    expect(sub?.id).toBe('w2');
    expect(sub?.enabled).toBe(true);
    expect(sub?.events).toEqual([]);
  });

  it('respects an explicit enabled:false', () => {
    const sub = coerceWebhookSubscription({ url: 'https://x.test', enabled: false }, 0);
    expect(sub?.enabled).toBe(false);
  });
});
