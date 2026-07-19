import { describe, it, expect } from 'vitest';
import { AUDIT_ACTIONS } from '@/lib/tenancy/audit';
import { ACTIVITY_FILTER_OPTIONS, ALL_ACTIONS_VALUE } from './activityFilter';

describe('ACTIVITY_FILTER_OPTIONS', () => {
  it('starts with an "All actions" option using the empty-string sentinel', () => {
    expect(ACTIVITY_FILTER_OPTIONS[0]).toEqual({ value: ALL_ACTIONS_VALUE, label: 'All actions' });
  });

  it('has one entry per known audit action, plus the All-actions entry', () => {
    expect(ACTIVITY_FILTER_OPTIONS).toHaveLength(AUDIT_ACTIONS.length + 1);
  });

  it('covers every AUDIT_ACTIONS verb exactly once, in declared order', () => {
    const values = ACTIVITY_FILTER_OPTIONS.slice(1).map((o) => o.value);
    expect(values).toEqual([...AUDIT_ACTIONS]);
  });

  it('labels a known verb with human-readable copy, not the raw string', () => {
    const memberAdded = ACTIVITY_FILTER_OPTIONS.find((o) => o.value === 'member.added');
    expect(memberAdded?.label).toBe('Member added');
  });

  it('never has a blank label for any option', () => {
    expect(ACTIVITY_FILTER_OPTIONS.every((o) => o.label.trim().length > 0)).toBe(true);
  });
});
