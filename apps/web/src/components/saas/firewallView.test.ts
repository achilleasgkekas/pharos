import { describe, it, expect } from 'vitest';
import { firewallView, relativeAge, canRequestUnban } from './firewallView';
import type { BanState } from '@/lib/saas/f2b';

const ROW = { jail: 'sshd', ip: '1.2.3.4', bannedAt: '2026-08-06 10:00:00', until: null };

describe('relativeAge', () => {
  it('reads in whole units', () => {
    expect(relativeAge(0)).toBe('0s ago');
    expect(relativeAge(45_000)).toBe('45s ago');
    expect(relativeAge(5 * 60_000)).toBe('5m ago');
    expect(relativeAge(3 * 3600_000)).toBe('3h ago');
    expect(relativeAge(4 * 86_400_000)).toBe('4d ago');
  });
});

describe('canRequestUnban', () => {
  it('is true only for jails the host script accepts requests for', () => {
    expect(canRequestUnban('sshd')).toBe(true);
    expect(canRequestUnban('nginx')).toBe(false);
  });
});

describe('firewallView', () => {
  it('reports a fresh, quiet firewall as live and says so explicitly', () => {
    const v = firewallView({
      known: true,
      generatedAt: new Date('2026-08-06T12:00:00Z'),
      ageMs: 30_000,
      stale: false,
      bans: [],
    });
    expect(v.health).toBe('live');
    // The empty case must STATE that it is empty, not render a blank table that could mean
    // anything.
    expect(v.headline).toContain('No addresses banned');
    expect(v.actionable).toBe(true);
  });

  it('never renders "unknown" as an empty ban list', () => {
    const unknown: BanState = { known: false, reason: 'missing', detail: 'no state.json' };
    const v = firewallView(unknown);
    expect(v.health).toBe('unknown');
    expect(v.bans).toEqual([]);
    // The distinction the whole feature rests on: nothing here may read as "all clear".
    expect(v.headline.toLowerCase()).toContain('unknown');
    expect(v.actionable).toBe(false);
    expect(v.detail).toBeTruthy();
  });

  it('surfaces an unreadable file as its own failure, with the reason', () => {
    const v = firewallView({
      known: false,
      reason: 'unreadable',
      detail: 'cannot read /var/lib/pharos/f2b/state.json (EACCES)',
    });
    expect(v.health).toBe('unknown');
    expect(v.detail).toContain('EACCES');
  });

  it('flags a stale file as a dead bridge while still showing what it last knew', () => {
    const v = firewallView({
      known: true,
      generatedAt: new Date('2026-08-06T11:00:00Z'),
      ageMs: 3600_000,
      stale: true,
      bans: [ROW],
    });
    expect(v.health).toBe('stale');
    expect(v.headline).toContain('not running');
    expect(v.bans).toHaveLength(1);
    // Still actionable on purpose: the queue survives a dead bridge, and a locked-out operator
    // needs the button most exactly then.
    expect(v.actionable).toBe(true);
  });

  it('counts bans in the headline, singular and plural', () => {
    const one = firewallView({
      known: true,
      generatedAt: new Date(),
      ageMs: 1000,
      stale: false,
      bans: [ROW],
    });
    expect(one.headline).toContain('1 address banned');
    const two = firewallView({
      known: true,
      generatedAt: new Date(),
      ageMs: 1000,
      stale: false,
      bans: [ROW, { ...ROW, ip: '5.6.7.8' }],
    });
    expect(two.headline).toContain('2 addresses banned');
  });
});
