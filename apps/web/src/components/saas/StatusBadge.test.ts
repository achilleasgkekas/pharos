import { describe, it, expect } from 'vitest';
import { tenantStatusTone, memberStatusTone, memberRoleTone } from './StatusBadge';

describe('tenantStatusTone', () => {
  it('maps each known tenant status to its tone', () => {
    expect(tenantStatusTone('active')).toBe('accent');
    expect(tenantStatusTone('trialing')).toBe('cyan');
    expect(tenantStatusTone('pending')).toBe('gold');
    expect(tenantStatusTone('suspended')).toBe('red');
    expect(tenantStatusTone('canceled')).toBe('red');
  });
  it('falls back to neutral for unknown/empty', () => {
    expect(tenantStatusTone('')).toBe('neutral');
    expect(tenantStatusTone('whatever')).toBe('neutral');
  });
});

describe('memberStatusTone', () => {
  it('maps membership status', () => {
    expect(memberStatusTone('active')).toBe('accent');
    expect(memberStatusTone('invited')).toBe('gold');
    expect(memberStatusTone('removed')).toBe('red');
    expect(memberStatusTone('nope')).toBe('neutral');
  });
});

describe('memberRoleTone', () => {
  it('maps membership role', () => {
    expect(memberRoleTone('owner')).toBe('purple');
    expect(memberRoleTone('admin')).toBe('cyan');
    expect(memberRoleTone('member')).toBe('neutral');
    expect(memberRoleTone('')).toBe('neutral');
  });
});
