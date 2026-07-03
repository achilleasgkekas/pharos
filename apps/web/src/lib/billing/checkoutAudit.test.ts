import { describe, it, expect } from 'vitest';
import { checkoutAuditMeta } from './checkoutAudit';

describe('checkoutAuditMeta', () => {
  it('records the plan alone when no checkout id is given', () => {
    expect(checkoutAuditMeta('shared')).toEqual({ plan: 'shared' });
    expect(checkoutAuditMeta('dedicated', null)).toEqual({ plan: 'dedicated' });
    expect(checkoutAuditMeta('shared', undefined)).toEqual({ plan: 'shared' });
  });

  it('includes a real checkout id', () => {
    expect(checkoutAuditMeta('shared', 'cs_test_123')).toEqual({
      plan: 'shared',
      checkoutId: 'cs_test_123',
    });
  });

  it('trims the checkout id', () => {
    expect(checkoutAuditMeta('dedicated', '  cs_abc  ')).toEqual({
      plan: 'dedicated',
      checkoutId: 'cs_abc',
    });
  });

  it('drops a blank/whitespace checkout id rather than emitting an empty key', () => {
    expect(checkoutAuditMeta('shared', '')).toEqual({ plan: 'shared' });
    expect(checkoutAuditMeta('shared', '   ')).toEqual({ plan: 'shared' });
  });

  it('drops a non-string checkout id (fail-safe)', () => {
    // @ts-expect-error — exercising a defensive runtime path
    expect(checkoutAuditMeta('shared', 42)).toEqual({ plan: 'shared' });
    // @ts-expect-error — exercising a defensive runtime path
    expect(checkoutAuditMeta('shared', {})).toEqual({ plan: 'shared' });
  });

  it('never leaks non-whitelisted fields', () => {
    const meta = checkoutAuditMeta('shared', 'cs_x');
    expect(Object.keys(meta).sort()).toEqual(['checkoutId', 'plan']);
  });
});
