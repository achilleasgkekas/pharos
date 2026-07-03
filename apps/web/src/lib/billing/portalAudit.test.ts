import { describe, it, expect } from 'vitest';
import { portalAuditMeta } from './portalAudit';

describe('portalAuditMeta', () => {
  it('records the plan alone when no portal id is given', () => {
    expect(portalAuditMeta('shared')).toEqual({ plan: 'shared' });
    expect(portalAuditMeta('dedicated', null)).toEqual({ plan: 'dedicated' });
    expect(portalAuditMeta('free', undefined)).toEqual({ plan: 'free' });
  });

  it('includes a real portal id', () => {
    expect(portalAuditMeta('shared', 'bps_test_123')).toEqual({
      plan: 'shared',
      portalId: 'bps_test_123',
    });
  });

  it('trims plan and portal id', () => {
    expect(portalAuditMeta('  dedicated  ', '  bps_abc  ')).toEqual({
      plan: 'dedicated',
      portalId: 'bps_abc',
    });
  });

  it('drops a blank/whitespace value rather than emitting an empty key', () => {
    expect(portalAuditMeta('shared', '')).toEqual({ plan: 'shared' });
    expect(portalAuditMeta('shared', '   ')).toEqual({ plan: 'shared' });
    expect(portalAuditMeta('', 'bps_x')).toEqual({ portalId: 'bps_x' });
    expect(portalAuditMeta('   ', null)).toEqual({});
  });

  it('drops non-string values (fail-safe)', () => {
    // @ts-expect-error — exercising a defensive runtime path
    expect(portalAuditMeta(42, 'bps_x')).toEqual({ portalId: 'bps_x' });
    // @ts-expect-error — exercising a defensive runtime path
    expect(portalAuditMeta('shared', {})).toEqual({ plan: 'shared' });
    expect(portalAuditMeta(null, null)).toEqual({});
  });

  it('never leaks non-whitelisted fields', () => {
    const meta = portalAuditMeta('shared', 'bps_x');
    expect(Object.keys(meta).sort()).toEqual(['plan', 'portalId']);
  });
});
