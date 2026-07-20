import { describe, it, expect } from 'vitest';
import { resendNoticeText } from './inviteResend';

describe('resendNoticeText', () => {
  it('formats a plain resend confirmation', () => {
    expect(resendNoticeText('teammate@example.com')).toBe(
      'Invitation resent to teammate@example.com.'
    );
  });

  it('falls back to a generic subject when email is empty', () => {
    expect(resendNoticeText('')).toBe('Invitation resent to this address.');
  });
});
