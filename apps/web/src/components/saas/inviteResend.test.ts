import { describe, it, expect } from 'vitest';
import { resendNotice } from './inviteResend';

describe('resendNotice', () => {
  it('formats a plain resend without a dev token', () => {
    expect(resendNotice('teammate@example.com')).toBe(
      'Invitation resent to teammate@example.com.'
    );
  });

  it('appends the dev token when echoed (no mailer configured, non-production)', () => {
    expect(resendNotice('teammate@example.com', 'abc123')).toBe(
      'Invitation resent to teammate@example.com. (dev token: abc123)'
    );
  });

  it('falls back to a generic subject when email is empty', () => {
    expect(resendNotice('')).toBe('Invitation resent to this address.');
  });

  it('ignores a null devToken same as undefined', () => {
    expect(resendNotice('a@b.com', null)).toBe('Invitation resent to a@b.com.');
  });

  it('ignores an empty-string devToken (falsy, no echo)', () => {
    expect(resendNotice('a@b.com', '')).toBe('Invitation resent to a@b.com.');
  });
});
