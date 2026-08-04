import { describe, it, expect } from 'vitest';
import { blockedNotice } from './blockedNotice';

describe('blockedNotice', () => {
  it.each(['suspended', 'canceled', 'pending'])('explains %s', (status) => {
    const n = blockedNotice(status);
    expect(n).not.toBeNull();
    expect(n!.title.length).toBeGreaterThan(0);
    expect(n!.body.length).toBeGreaterThan(0);
  });

  it('tells a suspended or canceled customer their data is still there', () => {
    // The first fear on seeing a locked app is "did I lose everything". Answer it in the banner.
    expect(blockedNotice('suspended')!.body.toLowerCase()).toContain('intact');
    expect(blockedNotice('canceled')!.body.toLowerCase()).toContain('still here');
  });

  it('is case- and whitespace-insensitive, matching the redirect that produces it', () => {
    expect(blockedNotice('  SUSPENDED ')).toEqual(blockedNotice('suspended'));
  });

  it.each([
    ['active', 'a healthy workspace is not blocked by anything'],
    ['trialing', 'a running trial is not blocked either'],
    ['<img src=x onerror=alert(1)>', 'untrusted URL input is never echoed back'],
    ['', 'absent'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('renders no banner for %s (%s)', (status: string | null | undefined, _why: string) => {
    expect(blockedNotice(status)).toBeNull();
  });
});
