import { describe, it, expect } from 'vitest';
import { COMMON_CARRIERS, hasKnownCarrier, resolveTrackingUrl } from './tracking';

// P72 — the quick-link builder. What matters here is not the exact courier URL (those
// change) but the RULES around them: a pasted override always wins, an unknown carrier
// yields no link at all rather than a guess, and nothing but http(s) ever reaches an href.

describe('resolveTrackingUrl', () => {
  it('builds the carrier link from the number', () => {
    const url = resolveTrackingUrl({ carrier: 'ACS', trackingNumber: '1234567' });
    expect(url).toContain('acscourier');
    expect(url).toContain('1234567');
  });

  it('matches a carrier name loosely, so "ACS Courier" is still ACS', () => {
    expect(resolveTrackingUrl({ carrier: 'ACS Courier', trackingNumber: '99' })).toContain('acscourier');
    expect(resolveTrackingUrl({ carrier: 'dhl express', trackingNumber: '99' })).toContain('dhl');
  });

  it('prefers a pasted URL over the built one', () => {
    const url = resolveTrackingUrl({
      carrier: 'ACS',
      trackingNumber: '1234567',
      trackingUrl: 'https://example.com/mine',
    });
    expect(url).toBe('https://example.com/mine');
  });

  it('returns null for an unknown carrier instead of guessing', () => {
    expect(resolveTrackingUrl({ carrier: 'Some Local Guy', trackingNumber: '1234567' })).toBeNull();
  });

  it('returns null when a half is missing', () => {
    expect(resolveTrackingUrl({ carrier: 'ACS', trackingNumber: '' })).toBeNull();
    expect(resolveTrackingUrl({ carrier: '', trackingNumber: '1234567' })).toBeNull();
    expect(resolveTrackingUrl({})).toBeNull();
  });

  it('refuses a non-http override, so no javascript: URL can reach an href', () => {
    expect(
      resolveTrackingUrl({ carrier: 'ACS', trackingNumber: '1', trackingUrl: 'javascript:alert(1)' })
    ).toBeNull();
  });

  it('escapes the number it puts in the query string', () => {
    const url = resolveTrackingUrl({ carrier: 'UPS', trackingNumber: 'a b&c' });
    expect(url).toContain('a%20b%26c');
  });
});

describe('hasKnownCarrier', () => {
  it('knows every carrier it suggests in the form', () => {
    for (const c of COMMON_CARRIERS) expect(hasKnownCarrier(c)).toBe(true);
  });

  it('is false for an empty or unlisted carrier', () => {
    expect(hasKnownCarrier('')).toBe(false);
    expect(hasKnownCarrier('Some Local Guy')).toBe(false);
  });
});
