import { describe, it, expect } from 'vitest';
import {
  isBanIp,
  isBanJail,
  unbanRequestLine,
  parseBanState,
  F2B_STALE_AFTER_MS,
} from './f2b';

// This file is the adversarial half of the fail2ban bridge. The string this side produces is
// handed to a host script that turns it into `fail2ban-client set <jail> unbanip <ip>` as ROOT,
// so every test below is about what must NOT be able to travel through unbanRequestLine, plus the
// one display contract that matters: an empty ban list must never stand in for "I don't know".

describe('isBanIp', () => {
  it('accepts plain IPv4 and IPv6 literals', () => {
    for (const ip of ['1.2.3.4', '10.0.1.1', '255.255.255.255', '::1', '2a00:1450:4001:80f::200e']) {
      expect(isBanIp(ip), ip).toBe(true);
    }
  });

  it('rejects anything that is not exactly an address', () => {
    const bad = [
      '',
      '   ',
      '1.2.3',
      '1.2.3.4.5',
      '256.1.1.1',
      '01.2.3.4', // leading zero: not what fail2ban prints, and an octal-looking octet
      '1.2.3.4/24', // CIDR
      '1.2.3.4:22', // host:port
      'fe80::1%eth0', // zone id
      'localhost',
      'evil.example.com',
      123,
      null,
      undefined,
      {},
      ['1.2.3.4'],
    ];
    for (const v of bad) expect(isBanIp(v), JSON.stringify(v)).toBe(false);
  });

  it('rejects shell metacharacters and whitespace tricks in an otherwise valid address', () => {
    const injections = [
      '1.2.3.4; rm -rf /',
      '1.2.3.4 && reboot',
      '1.2.3.4 | tee /etc/passwd',
      '$(whoami)',
      '`id`',
      '1.2.3.4\nunban sshd 5.6.7.8', // a second command smuggled as a second line
      '1.2.3.4\t5.6.7.8',
      '1.2.3.4 5.6.7.8', // an extra argv element
      '--all',
      '-h',
    ];
    for (const v of injections) expect(isBanIp(v), v).toBe(false);
  });

  it('rejects an over-long string even when it is all legal characters', () => {
    expect(isBanIp('1'.repeat(60))).toBe(false);
  });
});

describe('isBanJail', () => {
  it('accepts only the allowlisted jail', () => {
    expect(isBanJail('sshd')).toBe(true);
    for (const v of ['SSHD', 'sshd ', 'nginx', 'recidive', '', null, 1, {}]) {
      expect(isBanJail(v), JSON.stringify(v)).toBe(false);
    }
  });
});

describe('unbanRequestLine', () => {
  it('builds exactly one line, three fields, newline-terminated', () => {
    expect(unbanRequestLine('sshd', '1.2.3.4')).toBe('unban sshd 1.2.3.4\n');
    // Exactly one terminator: the host script rejects anything with more than one line.
    expect(unbanRequestLine('sshd', '1.2.3.4')!.split('\n')).toHaveLength(2);
  });

  it('trims surrounding whitespace rather than embedding it', () => {
    expect(unbanRequestLine('sshd', '  1.2.3.4  ')).toBe('unban sshd 1.2.3.4\n');
  });

  it('is the only verb it can ever produce', () => {
    // There is no argument that turns this into a ban: the verb is a literal.
    expect(unbanRequestLine('sshd', '1.2.3.4')!.startsWith('unban ')).toBe(true);
  });

  it('returns null for an unknown jail or a non-address', () => {
    expect(unbanRequestLine('nginx', '1.2.3.4')).toBeNull();
    expect(unbanRequestLine('sshd', 'localhost')).toBeNull();
    expect(unbanRequestLine('sshd', '1.2.3.4; id')).toBeNull();
    expect(unbanRequestLine(null, '1.2.3.4')).toBeNull();
  });
});

const NOW = new Date('2026-08-06T12:00:00.000Z');

function stateJson(generatedAt: string, jails: Record<string, unknown[]>): string {
  return JSON.stringify({ generatedAt, jails });
}

describe('parseBanState', () => {
  it('reads a fresh state file into sorted rows', () => {
    const raw = stateJson('2026-08-06T11:59:30Z', {
      sshd: [
        { ip: '1.2.3.4', bannedAt: '2026-08-06 10:00:00', until: '2026-08-06 11:00:00' },
        { ip: '5.6.7.8', bannedAt: '2026-08-06 11:30:00', until: '2026-08-06 12:30:00' },
      ],
    });
    const s = parseBanState(raw, NOW);
    expect(s.known).toBe(true);
    if (!s.known) return;
    expect(s.stale).toBe(false);
    expect(s.ageMs).toBe(30_000);
    // Newest first.
    expect(s.bans.map((b) => b.ip)).toEqual(['5.6.7.8', '1.2.3.4']);
    expect(s.bans[0]).toMatchObject({ jail: 'sshd', until: '2026-08-06 12:30:00' });
  });

  it('marks a state file older than the staleness window', () => {
    const old = new Date(NOW.getTime() - F2B_STALE_AFTER_MS - 1000).toISOString();
    const s = parseBanState(stateJson(old, { sshd: [] }), NOW);
    expect(s.known).toBe(true);
    if (!s.known) return;
    expect(s.stale).toBe(true);
    // Crucially still `known` with an empty list — the UI decides what to say, but it must be
    // able to tell "nothing banned, an hour ago" from "no idea".
    expect(s.bans).toEqual([]);
  });

  it('never reports an empty ban list for input it could not understand', () => {
    const unusable = [
      'not json at all',
      '[]',
      '"a string"',
      JSON.stringify({ jails: { sshd: [] } }), // no generatedAt
      JSON.stringify({ generatedAt: 'yesterday', jails: {} }), // unparseable timestamp
      JSON.stringify({ generatedAt: '2026-08-06T11:59:30Z' }), // no jails
      JSON.stringify({ generatedAt: '2026-08-06T11:59:30Z', jails: [] }), // jails not an object
    ];
    for (const raw of unusable) {
      const s = parseBanState(raw, NOW);
      expect(s.known, raw).toBe(false);
      if (s.known) continue;
      expect(s.reason).toBe('malformed');
    }
  });

  it('drops entries whose ip is not an address instead of displaying them', () => {
    const raw = stateJson('2026-08-06T11:59:30Z', {
      sshd: [
        { ip: '1.2.3.4', bannedAt: '2026-08-06 10:00:00' },
        { ip: '; rm -rf /', bannedAt: '2026-08-06 11:00:00' },
        { ip: null },
        'a bare string',
        42,
      ],
    });
    const s = parseBanState(raw, NOW);
    expect(s.known).toBe(true);
    if (!s.known) return;
    expect(s.bans.map((b) => b.ip)).toEqual(['1.2.3.4']);
  });

  it('keeps rows with unknown times, sorted below the timestamped ones', () => {
    const raw = stateJson('2026-08-06T11:59:30Z', {
      sshd: [{ ip: '9.9.9.9' }, { ip: '1.2.3.4', bannedAt: '2026-08-06 10:00:00' }],
    });
    const s = parseBanState(raw, NOW);
    if (!s.known) throw new Error('expected known state');
    expect(s.bans.map((b) => b.ip)).toEqual(['1.2.3.4', '9.9.9.9']);
    expect(s.bans[1]).toMatchObject({ bannedAt: null, until: null });
  });

  it('reports a future-dated state file as age zero rather than negative', () => {
    const s = parseBanState(stateJson('2026-08-06T12:05:00Z', { sshd: [] }), NOW);
    if (!s.known) throw new Error('expected known state');
    expect(s.ageMs).toBe(0);
    expect(s.stale).toBe(false);
  });

  it('carries every allowlisted jail through with its own label', () => {
    const raw = stateJson('2026-08-06T11:59:30Z', {
      sshd: [{ ip: '1.2.3.4', bannedAt: '2026-08-06 10:00:00' }],
      // A jail the app does not allow REQUESTS for is still displayed if the bridge reports it:
      // hiding a live ban would be the same lie as an empty list.
      nginx: [{ ip: '5.6.7.8', bannedAt: '2026-08-06 11:00:00' }],
    });
    const s = parseBanState(raw, NOW);
    if (!s.known) throw new Error('expected known state');
    expect(s.bans.map((b) => `${b.jail}:${b.ip}`)).toEqual(['nginx:5.6.7.8', 'sshd:1.2.3.4']);
  });
});
