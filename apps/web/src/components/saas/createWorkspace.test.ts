import { describe, it, expect } from 'vitest';
import { workspaceNameReady, describeCreateWorkspaceError, MAX_WORKSPACE_NAME } from './createWorkspace';

describe('workspaceNameReady', () => {
  it('accepts a normal trimmed name', () => {
    expect(workspaceNameReady('My Household')).toBe(true);
    expect(workspaceNameReady('  Kalamos  ')).toBe(true);
  });
  it('rejects blank / whitespace-only names', () => {
    expect(workspaceNameReady('')).toBe(false);
    expect(workspaceNameReady('   ')).toBe(false);
  });
  it('rejects a name over the length cap, accepts exactly at the cap', () => {
    expect(workspaceNameReady('a'.repeat(MAX_WORKSPACE_NAME))).toBe(true);
    expect(workspaceNameReady('a'.repeat(MAX_WORKSPACE_NAME + 1))).toBe(false);
  });
});

describe('describeCreateWorkspaceError', () => {
  it('prefers a server-provided error string', () => {
    expect(describeCreateWorkspaceError(400, 'Workspace limit reached for this account')).toBe(
      'Workspace limit reached for this account'
    );
  });
  it('ignores a blank/whitespace server error and falls back by status', () => {
    expect(describeCreateWorkspaceError(401, '  ')).toBe('Please sign in again');
    expect(describeCreateWorkspaceError(404, null)).toBe('Workspaces are not available on this server');
    expect(describeCreateWorkspaceError(500, undefined)).toBe('Something went wrong. Please try again');
  });
  it('has a generic fallback for an unmapped status', () => {
    expect(describeCreateWorkspaceError(418)).toBe('Could not create the workspace. Please try again');
  });
});
