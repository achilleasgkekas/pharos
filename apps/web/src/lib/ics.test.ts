import { describe, it, expect } from 'vitest';
import {
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  formatIcsDateTime,
  agendaToIcsEvents,
  buildIcsCalendar,
  type IcsEvent,
} from './ics';
import type { AgendaMonth } from './moneyAgenda';

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and newlines per RFC 5545', () => {
    expect(escapeIcsText('a\\b;c,d')).toBe('a\\\\b\\;c\\,d');
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
    expect(escapeIcsText('crlf\r\nhere')).toBe('crlf\\nhere');
  });
  it('does NOT escape colons (valid in TEXT values)', () => {
    expect(escapeIcsText('12:00 at store')).toBe('12:00 at store');
  });
});

describe('foldIcsLine', () => {
  it('leaves short lines untouched', () => {
    expect(foldIcsLine('SUMMARY:hello')).toBe('SUMMARY:hello');
  });
  it('folds a long ASCII line at 75 octets with CRLF + space', () => {
    const line = 'SUMMARY:' + 'x'.repeat(100);
    const folded = foldIcsLine(line);
    expect(folded).toContain('\r\n ');
    // Unfolding (remove CRLF+space) must recover the original.
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    // First physical line is at most 75 octets.
    expect(Buffer.from(folded.split('\r\n')[0], 'utf8').length).toBeLessThanOrEqual(75);
  });
  it('never splits a multi-byte (Greek) character across a fold', () => {
    const line = 'SUMMARY:' + 'ω'.repeat(60); // each ω = 2 bytes
    const folded = foldIcsLine(line);
    // Every physical segment must decode cleanly (no replacement char from a split codepoint).
    for (const seg of folded.split('\r\n ')) {
      expect(seg).not.toContain('�');
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('date formatters', () => {
  it('formatIcsDate uses local calendar components (all-day)', () => {
    expect(formatIcsDate(new Date(2026, 6, 1))).toBe('20260701'); // 1 July 2026 local
    expect(formatIcsDate(new Date(2026, 11, 9))).toBe('20261209');
  });
  it('formatIcsDateTime emits a UTC Z timestamp', () => {
    expect(formatIcsDateTime(new Date(Date.UTC(2026, 6, 10, 3, 30, 0)))).toBe('20260710T033000Z');
  });
});

function month(entries: AgendaMonth['entries']): AgendaMonth {
  return { key: '2026-07', label: 'July 2026', entries, out: 0, inc: 0 };
}

describe('agendaToIcsEvents', () => {
  it('prefixes the summary by category and appends the formatted amount', () => {
    const evs = agendaToIcsEvents(
      [month([{ date: new Date(2026, 6, 4).toISOString(), kind: 'renewal', label: 'Netflix', sub: 'Renews monthly', amount: 15 }])],
      'EUR'
    );
    expect(evs).toHaveLength(1);
    expect(evs[0].summary).toBe('[Renewal] Netflix — €15.00');
    expect(evs[0].description).toBe('Renews monthly');
    expect(evs[0].categories).toEqual(['Pharos', 'renewal']);
  });
  it('omits the amount for expiry entries (amount null)', () => {
    const evs = agendaToIcsEvents(
      [month([{ date: new Date(2026, 6, 20).toISOString(), kind: 'warranty', label: 'Apple Watch', sub: 'Warranty expires', amount: null }])],
      'EUR'
    );
    expect(evs[0].summary).toBe('[Warranty] Apple Watch');
  });
  it('falls back to the currency code when there is no known symbol', () => {
    const evs = agendaToIcsEvents(
      [month([{ date: new Date(2026, 6, 4).toISOString(), kind: 'bill', label: 'Rent', sub: '', amount: 500 }])],
      'RON'
    );
    expect(evs[0].summary).toBe('[Bill] Rent — 500.00 RON');
  });
  it('gives the same UID for identical events (stable across regenerations)', () => {
    const mk = () =>
      agendaToIcsEvents(
        [month([{ date: new Date(2026, 6, 4).toISOString(), kind: 'renewal', label: 'Netflix', sub: 'Renews monthly', amount: 15 }])],
        'EUR'
      )[0].uid;
    expect(mk()).toBe(mk());
    expect(mk()).toContain('@pharos.local');
    expect(mk().startsWith('renewal-20260704-')).toBe(true);
  });
  it('gives different UIDs for different amounts/labels', () => {
    const a = agendaToIcsEvents([month([{ date: new Date(2026, 6, 4).toISOString(), kind: 'renewal', label: 'Netflix', sub: 's', amount: 15 }])], 'EUR')[0].uid;
    const b = agendaToIcsEvents([month([{ date: new Date(2026, 6, 4).toISOString(), kind: 'renewal', label: 'Netflix', sub: 's', amount: 16 }])], 'EUR')[0].uid;
    expect(a).not.toBe(b);
  });
});

describe('buildIcsCalendar', () => {
  const dtstamp = new Date(Date.UTC(2026, 6, 10, 3, 30, 0));
  const events: IcsEvent[] = [
    { uid: 'x1@pharos.local', date: new Date(2026, 6, 15), summary: '[Bill] Rent — €500.00', description: 'Expected monthly', categories: ['Pharos', 'bill'] },
  ];

  it('wraps events in a well-formed VCALENDAR with CRLF terminators', () => {
    const ics = buildIcsCalendar(events, { name: 'Pharos', description: 'Money agenda', dtstamp });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Pharos//Money Calendar//EN');
    expect(ics).toContain('X-WR-CALNAME:Pharos');
    expect(ics).toContain('X-WR-CALDESC:Money agenda');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT12H');
  });

  it('renders each event as an all-day VEVENT (DTEND = day after DTSTART)', () => {
    const ics = buildIcsCalendar(events, { name: 'Pharos', dtstamp });
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:x1@pharos.local');
    expect(ics).toContain('DTSTAMP:20260710T033000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260715');
    expect(ics).toContain('DTEND;VALUE=DATE:20260716');
    expect(ics).toContain('SUMMARY:[Bill] Rent — €500.00');
    expect(ics).toContain('DESCRIPTION:Expected monthly');
    expect(ics).toContain('CATEGORIES:Pharos,bill');
    expect(ics).toContain('TRANSP:TRANSPARENT');
  });

  it('rolls a month-end DTSTART over to the first of the next month', () => {
    const ics = buildIcsCalendar([{ uid: 'y@pharos.local', date: new Date(2026, 6, 31), summary: 's' }], { name: 'P', dtstamp });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260731');
    expect(ics).toContain('DTEND;VALUE=DATE:20260801');
  });

  it('produces an empty-but-valid calendar when there are no events', () => {
    const ics = buildIcsCalendar([], { name: 'Pharos', dtstamp });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('clamps a sub-hour TTL to at least PT1H', () => {
    const ics = buildIcsCalendar([], { name: 'P', dtstamp, ttlHours: 0 });
    expect(ics).toContain('X-PUBLISHED-TTL:PT1H');
  });
});
