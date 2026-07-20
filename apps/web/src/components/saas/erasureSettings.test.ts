import { describe, it, expect } from 'vitest';
import { describeErasureError, describeErasureCountdown } from './erasureSettings';

describe('describeErasureError', () => {
  it('is the same describer as workspaceSettings (re-exported, not duplicated)', () => {
    expect(describeErasureError(403, 'only the workspace owner can request erasure')).toBe(
      'only the workspace owner can request erasure'
    );
    expect(describeErasureError(401, undefined)).toBe('Please sign in again');
  });
});

describe('describeErasureCountdown', () => {
  it('returns an empty string when there is no schedule', () => {
    expect(describeErasureCountdown(null)).toBe('');
  });

  it('says "due for deletion now" when the window has elapsed', () => {
    expect(describeErasureCountdown(0)).toBe('due for deletion now');
    expect(describeErasureCountdown(-3)).toBe('due for deletion now');
  });

  it('singularizes exactly 1 day left', () => {
    expect(describeErasureCountdown(1)).toBe('1 day left');
  });

  it('pluralizes for 2+ days left', () => {
    expect(describeErasureCountdown(2)).toBe('2 days left');
    expect(describeErasureCountdown(30)).toBe('30 days left');
  });
});
