import { describe, it, expect } from 'vitest';
import {
  workspaceRenameReady,
  describeWorkspaceSettingsError,
} from './workspaceSettings';
import { MAX_WORKSPACE_NAME } from '@/lib/tenancy/workspace';

describe('workspaceRenameReady', () => {
  it('accepts a normal trimmed name that differs from the current one', () => {
    expect(workspaceRenameReady('New Name', 'Old Name')).toBe(true);
    expect(workspaceRenameReady('  New Name  ', 'Old Name')).toBe(true);
  });

  it('rejects blank / whitespace-only names', () => {
    expect(workspaceRenameReady('', 'Old Name')).toBe(false);
    expect(workspaceRenameReady('   ', 'Old Name')).toBe(false);
  });

  it('rejects a name over the length cap, accepts exactly at the cap', () => {
    expect(workspaceRenameReady('a'.repeat(MAX_WORKSPACE_NAME), 'Old')).toBe(true);
    expect(workspaceRenameReady('a'.repeat(MAX_WORKSPACE_NAME + 1), 'Old')).toBe(false);
  });

  it('rejects a name that is unchanged (trimmed comparison)', () => {
    expect(workspaceRenameReady('Kalamos', 'Kalamos')).toBe(false);
    expect(workspaceRenameReady('  Kalamos  ', 'Kalamos')).toBe(false);
  });
});

describe('describeWorkspaceSettingsError', () => {
  it('prefers a server-provided error string', () => {
    expect(
      describeWorkspaceSettingsError(403, 'only the workspace owner can cancel it')
    ).toBe('only the workspace owner can cancel it');
  });

  it('ignores a blank/whitespace server error and falls back by status', () => {
    expect(describeWorkspaceSettingsError(401, '  ')).toBe('Please sign in again');
    expect(describeWorkspaceSettingsError(403, null)).toBe(
      'You do not have permission to do that'
    );
    expect(describeWorkspaceSettingsError(404, undefined)).toBe(
      'That workspace was not found'
    );
    expect(describeWorkspaceSettingsError(409, undefined)).toBe(
      'This workspace cannot be changed right now'
    );
    expect(describeWorkspaceSettingsError(500, undefined)).toBe(
      'Something went wrong. Please try again'
    );
  });

  it('has a generic fallback for an unmapped status', () => {
    expect(describeWorkspaceSettingsError(418)).toBe(
      'Could not update the workspace. Please try again'
    );
  });
});
