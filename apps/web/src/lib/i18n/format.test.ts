import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relTime, formatCurrency } from './format';
import { makeT, resolveDict, type TFunc, type TKey } from '@/lib/i18n';

// A fixed "now" so every relative-time bucket is deterministic. All test isos are
// derived by subtracting a known number of seconds from this instant.
const NOW = new Date('2026-07-02T12:00:00.000Z');
const NOW_MS = NOW.getTime();

/** Build an ISO string that is `secondsAgo` before the frozen `NOW`. Negative → future. */
function ago(secondsAgo: number): string {
  return new Date(NOW_MS - secondsAgo * 1000).toISOString();
}

/** A recording translate fn: captures the exact key + vars relTime selected, so tests
 *  can assert the bucket/`n` without depending on any locale's wording. */
function spyT(): { t: TFunc; calls: Array<{ key: TKey; vars?: Record<string, string | number> }> } {
  const calls: Array<{ key: TKey; vars?: Record<string, string | number> }> = [];
  const t = ((key: TKey, vars?: Record<string, string | number>) => {
    calls.push({ key, vars });
    return String(key);
  }) as TFunc;
  return { t, calls };
}

// Real English translate fn, to also exercise the dictionary interpolation end-to-end.
const en = makeT(resolveDict('en'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('relTime — bucket selection (key + n)', () => {
  it('uses justNow below one minute', () => {
    const { t, calls } = spyT();
    relTime(ago(0), t);
    relTime(ago(1), t);
    relTime(ago(59), t);
    expect(calls.map((c) => c.key)).toEqual(['time.justNow', 'time.justNow', 'time.justNow']);
    expect(calls.every((c) => c.vars === undefined)).toBe(true);
  });

  it('switches to minutes exactly at 60s', () => {
    const { t, calls } = spyT();
    relTime(ago(60), t);
    expect(calls[0]).toEqual({ key: 'time.minutes', vars: { n: 1 } });
  });

  it('floors the minute count', () => {
    const { t, calls } = spyT();
    relTime(ago(119), t); // 1m 59s → 1
    relTime(ago(3599), t); // 59m 59s → 59 (still under an hour)
    expect(calls[0]).toEqual({ key: 'time.minutes', vars: { n: 1 } });
    expect(calls[1]).toEqual({ key: 'time.minutes', vars: { n: 59 } });
  });

  it('switches to hours exactly at 3600s', () => {
    const { t, calls } = spyT();
    relTime(ago(3600), t);
    expect(calls[0]).toEqual({ key: 'time.hours', vars: { n: 1 } });
  });

  it('floors the hour count up to the day boundary', () => {
    const { t, calls } = spyT();
    relTime(ago(7199), t); // 1h 59m → 1
    relTime(ago(86399), t); // 23h 59m 59s → 23 (still under a day)
    expect(calls[0]).toEqual({ key: 'time.hours', vars: { n: 1 } });
    expect(calls[1]).toEqual({ key: 'time.hours', vars: { n: 23 } });
  });

  it('uses yesterday (no vars) at exactly one day', () => {
    const { t, calls } = spyT();
    relTime(ago(86400), t);
    relTime(ago(2 * 86400 - 1), t); // still day 1 (floor)
    expect(calls[0]).toEqual({ key: 'time.yesterday', vars: undefined });
    expect(calls[1]).toEqual({ key: 'time.yesterday', vars: undefined });
  });

  it('uses days with the floored day count from two days on', () => {
    const { t, calls } = spyT();
    relTime(ago(2 * 86400), t); // 2
    relTime(ago(10 * 86400 + 500), t); // 10 (remainder floored away)
    expect(calls[0]).toEqual({ key: 'time.days', vars: { n: 2 } });
    expect(calls[1]).toEqual({ key: 'time.days', vars: { n: 10 } });
  });
});

describe('relTime — future/edge inputs clamp to 0 (justNow)', () => {
  it('clamps a future timestamp to justNow', () => {
    const { t, calls } = spyT();
    relTime(ago(-120), t); // 2 minutes in the future
    expect(calls[0]).toEqual({ key: 'time.justNow', vars: undefined });
  });

  it('treats the exact current instant as justNow', () => {
    const { t, calls } = spyT();
    relTime(NOW.toISOString(), t);
    expect(calls[0].key).toBe('time.justNow');
  });
});

describe('relTime — end-to-end with the real English dictionary', () => {
  it('interpolates {n} into each bucket wording', () => {
    expect(relTime(ago(30), en)).toBe('just now');
    expect(relTime(ago(60), en)).toBe('1m ago');
    expect(relTime(ago(45 * 60), en)).toBe('45m ago');
    expect(relTime(ago(3600), en)).toBe('1h ago');
    expect(relTime(ago(5 * 3600), en)).toBe('5h ago');
    expect(relTime(ago(86400), en)).toBe('yesterday');
    expect(relTime(ago(3 * 86400), en)).toBe('3d ago');
  });
});

// Currency layout must follow the reader, including whitespace and symbol placement.
describe('formatCurrency', () => {
  it('renders Greek decimals, grouping and a trailing euro symbol', () => {
    expect(formatCurrency(1234.5, 'EUR', 'el')).toBe('1.234,50\u00a0€');
    expect(formatCurrency(-12.5, 'EUR', 'el')).toBe('-12,50\u00a0€');
  });

  it('keeps currency identity independent from locale', () => {
    expect(formatCurrency(1234.5, 'USD', 'en')).toBe('$1,234.50');
    expect(formatCurrency(1234.5, 'USD', 'el')).toBe('1.234,50\u00a0$');
    expect(formatCurrency(0, 'EUR', 'el')).toBe('0,00\u00a0€');
    expect(formatCurrency(NaN, 'EUR', 'el')).toBe('0,00\u00a0€');
  });

  it('supports every app locale without changing the amount', () => {
    for (const locale of ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt', 'el']) {
      expect(formatCurrency(42.5, 'EUR', locale)).toBe(
        new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(42.5),
      );
    }
  });
});

import { compareNames, formatDate, formatDateTime, formatTime, intlTag } from './format';

describe('date formatting follows the app language (#5)', () => {
  const d = new Date(2026, 6, 4, 9, 5); // 4 July 2026, 09:05 local

  it("maps the app's `en` to British English, keeps every other locale", () => {
    expect(intlTag('en')).toBe('en-GB');
    expect(intlTag(undefined)).toBe('en-GB');
    expect(intlTag('el')).toBe('el');
    expect(intlTag('de')).toBe('de');
  });

  it('month names come out in the selected language, not English', () => {
    const opts = { month: 'long', year: 'numeric' } as const;
    expect(formatDate(d, 'en', opts)).toBe('July 2026');
    expect(formatDate(d, 'el', opts)).toMatch(/Ιο[υύ]λ/);
    expect(formatDate(d, 'de', opts)).toBe('Juli 2026');
    expect(formatDate(d, 'fr', opts)).toBe('juillet 2026');
  });

  it('numeric dates keep DD/MM for en (never US order)', () => {
    expect(formatDate(d, 'en')).toBe('04/07/2026');
    expect(formatDate(d, 'de')).toBe('4.7.2026');
  });

  it('formats calendar day strings (YYYY-MM-DD) without shifting back a day in timezones behind UTC when timeZone UTC is supplied', () => {
    // Save original TZ
    const origTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const calendarDateStr = '2026-07-01';
      // Without timeZone: 'UTC', 2026-07-01 parsing to UTC midnight shifts to June 30 in NY (EDT, UTC-4)
      const formattedWithoutUtc = formatDate(calendarDateStr, 'en', { day: '2-digit', month: '2-digit', year: '2-digit' });
      expect(formattedWithoutUtc).toBe('30/06/26');

      // With timeZone: 'UTC', it stays 01/07/26
      const formattedWithUtc = formatDate(calendarDateStr, 'en', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
      expect(formattedWithUtc).toBe('01/07/26');
    } finally {
      process.env.TZ = origTZ;
    }
  });

  it('empty or invalid input returns the fallback instead of "Invalid Date"', () => {
    expect(formatDate(null, 'el')).toBe('');
    expect(formatDate('', 'el', undefined, '—')).toBe('—');
    expect(formatDate('not a date', 'en', undefined, '—')).toBe('—');
    expect(formatTime(undefined, 'en')).toBe('');
    expect(formatDateTime('garbage', 'en', undefined, '—')).toBe('—');
  });
});

describe('compareNames — one order on the server and in the browser (#152)', () => {
  const list = ['Apple Music', 'Μπαταρίες UPS', 'Zoom', 'apple tv'];

  it('sorts by the APP language, not the runtime default', () => {
    // Greek collation puts Greek before Latin; en/de put it after. Before #152 the sort took the
    // RUNTIME default — Node said one thing, the browser another, and React blew up on hydration.
    expect([...list].sort((a, b) => compareNames(a, b, 'el'))[0]).toBe('Μπαταρίες UPS');
    expect([...list].sort((a, b) => compareNames(a, b, 'en'))[0]).toBe('Apple Music');
    expect([...list].sort((a, b) => compareNames(a, b, 'de')).at(-1)).toBe('Μπαταρίες UPS');
  });

  it('is stable for the same locale no matter how it is spelled, and ignores case', () => {
    const byEn = [...list].sort((a, b) => compareNames(a, b, 'en'));
    expect([...list].sort((a, b) => compareNames(a, b, 'en'))).toEqual(byEn);
    expect(compareNames('apple tv', 'Apple TV', 'en')).toBe(0);
  });

  it('orders numbers the way a person reads them', () => {
    expect(['Room 10', 'Room 2'].sort((a, b) => compareNames(a, b, 'en'))).toEqual(['Room 2', 'Room 10']);
  });

  it('treats empty and missing names as equal, never throwing', () => {
    expect(compareNames(null, undefined, 'el')).toBe(0);
    expect(compareNames('', null, 'en')).toBe(0);
  });
});
