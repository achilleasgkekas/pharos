import { describe, it, expect } from 'vitest';
import { erasurePendingFilter, suspensionPendingFilter, DELETION_QUEUE_LIMIT } from './deletionQueue';

describe('erasurePendingFilter', () => {
  // Not `erasureDueFilter`: the point of the screen is to see a deletion coming while its owner
  // can still cancel it, so scheduled-but-not-yet-due rows must match.
  it('selects every pending erasure, not only the due ones', () => {
    expect(erasurePendingFilter()).toEqual({ erasureScheduledAt: { $ne: null } });
  });
});

describe('suspensionPendingFilter', () => {
  it('selects suspended workspaces that are not already enrolled into erasure', () => {
    // The exclusion is what stops a workspace appearing in two buckets of a deletion screen,
    // which would read as two deletions.
    expect(suspensionPendingFilter()).toEqual({ status: 'suspended', erasureScheduledAt: null });
  });
});

describe('DELETION_QUEUE_LIMIT', () => {
  it('is a positive bound so an operator screen can never issue an unbounded read', () => {
    expect(DELETION_QUEUE_LIMIT).toBeGreaterThan(0);
    expect(Number.isInteger(DELETION_QUEUE_LIMIT)).toBe(true);
  });
});
