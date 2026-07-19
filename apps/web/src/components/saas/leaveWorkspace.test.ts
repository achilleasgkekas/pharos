import { describe, it, expect } from 'vitest';
import { describeLeaveWorkspaceError, isLastOwnerError } from './leaveWorkspace';

describe('describeLeaveWorkspaceError', () => {
  it('prefers a server-provided error string', () => {
    expect(
      describeLeaveWorkspaceError(409, 'you are the last owner; promote another member to owner before leaving')
    ).toBe('you are the last owner; promote another member to owner before leaving');
  });
  it('ignores a blank/whitespace server error and falls back by status', () => {
    expect(describeLeaveWorkspaceError(401, '  ')).toBe('Please sign in again');
    expect(describeLeaveWorkspaceError(404, null)).toBe('That workspace was not found');
    expect(describeLeaveWorkspaceError(500, undefined)).toBe('Something went wrong. Please try again');
  });
  it('has a generic fallback for an unmapped status', () => {
    expect(describeLeaveWorkspaceError(409)).toBe('Could not leave the workspace. Please try again');
  });
});

describe('isLastOwnerError', () => {
  it('is true only for the last_owner code', () => {
    expect(isLastOwnerError('last_owner')).toBe(true);
    expect(isLastOwnerError('seat_limit')).toBe(false);
    expect(isLastOwnerError(undefined)).toBe(false);
    expect(isLastOwnerError(null)).toBe(false);
  });
});
