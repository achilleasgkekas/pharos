import { describe, it, expect } from 'vitest';
import { isWebPushConfigured } from './webPush';

// P102 — the pure guard that gates every web-push path (dispatch, key read). The rest of
// lib/webPush.ts is DB + push-service I/O; what matters to pin here is that a half-written
// or empty VAPID config is treated as "not set up" rather than attempted.
describe('isWebPushConfigured', () => {
  it('needs both keys present', () => {
    expect(isWebPushConfigured({ publicKey: 'p', privateKey: 'k', subject: 'mailto:x' })).toBe(true);
  });
  it('is false when either key is missing or empty', () => {
    expect(isWebPushConfigured({ publicKey: 'p', privateKey: '' })).toBe(false);
    expect(isWebPushConfigured({ publicKey: '', privateKey: 'k' })).toBe(false);
    expect(isWebPushConfigured({})).toBe(false);
    expect(isWebPushConfigured(undefined)).toBe(false);
    expect(isWebPushConfigured(null)).toBe(false);
  });
});
