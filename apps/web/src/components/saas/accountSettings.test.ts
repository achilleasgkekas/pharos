import { describe, it, expect } from 'vitest';
import {
  profileNameChanged,
  profileEmailChanged,
  profileSaveReady,
  passwordSaveReady,
  describeAccountSettingsError,
} from './accountSettings';

describe('profileNameChanged', () => {
  it('detects a trimmed, actually-different name', () => {
    expect(profileNameChanged('New Name', 'Old Name')).toBe(true);
    expect(profileNameChanged('  New Name  ', 'Old Name')).toBe(true);
  });

  it('treats whitespace-only differences as unchanged', () => {
    expect(profileNameChanged('Kalamos', 'Kalamos')).toBe(false);
    expect(profileNameChanged('  Kalamos  ', 'Kalamos')).toBe(false);
  });

  it('allows clearing the name (empty is a legitimate edit)', () => {
    expect(profileNameChanged('', 'Kalamos')).toBe(true);
    expect(profileNameChanged('', '')).toBe(false);
  });
});

describe('profileEmailChanged', () => {
  it('is case/whitespace-insensitive, matching the server normalizer', () => {
    expect(profileEmailChanged('Achilleas@Example.com', 'achilleas@example.com')).toBe(false);
    expect(profileEmailChanged('  achilleas@example.com  ', 'achilleas@example.com')).toBe(false);
  });

  it('detects an actual address change', () => {
    expect(profileEmailChanged('new@example.com', 'old@example.com')).toBe(true);
  });
});

describe('profileSaveReady', () => {
  const current = { name: 'Achilleas', email: 'achilleas@example.com' };

  it('rejects when nothing changed', () => {
    expect(profileSaveReady(current, current)).toBe(false);
  });

  it('accepts a name-only change', () => {
    expect(profileSaveReady({ name: 'Nea', email: current.email }, current)).toBe(true);
  });

  it('accepts a valid email-only change', () => {
    expect(profileSaveReady({ name: current.name, email: 'new@example.com' }, current)).toBe(true);
  });

  it('rejects a changed-but-invalid email even when the name also changed', () => {
    expect(profileSaveReady({ name: 'Nea', email: 'not-an-email' }, current)).toBe(false);
  });
});

describe('passwordSaveReady', () => {
  it('rejects a blank current password', () => {
    expect(passwordSaveReady('', 'newpassword1', 'newpassword1')).toBe(false);
  });

  it('rejects a mismatched confirmation', () => {
    expect(passwordSaveReady('oldpassword1', 'newpassword1', 'newpassword2')).toBe(false);
  });

  it('rejects a new password that fails the server policy (too short / unchanged)', () => {
    expect(passwordSaveReady('oldpassword1', 'short', 'short')).toBe(false);
    expect(passwordSaveReady('samepassword1', 'samepassword1', 'samepassword1')).toBe(false);
  });

  it('accepts a valid, distinct, matching pair', () => {
    expect(passwordSaveReady('oldpassword1', 'newpassword1', 'newpassword1')).toBe(true);
  });
});

describe('describeAccountSettingsError', () => {
  it('prefers a server-provided error string', () => {
    expect(describeAccountSettingsError(409, 'An account with this email already exists')).toBe(
      'An account with this email already exists'
    );
  });

  it('ignores a blank/whitespace server error and falls back by status', () => {
    expect(describeAccountSettingsError(401, '  ')).toBe('Please sign in again');
    expect(describeAccountSettingsError(404, null)).toBe('Account not found');
    expect(describeAccountSettingsError(409, undefined)).toBe('That email is already in use');
    expect(describeAccountSettingsError(500, undefined)).toBe('Something went wrong. Please try again');
  });

  it('has a generic fallback for an unmapped status', () => {
    expect(describeAccountSettingsError(418)).toBe('Could not save. Please try again');
  });
});
