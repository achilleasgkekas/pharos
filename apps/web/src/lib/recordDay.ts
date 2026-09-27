// The calendar day a stored record date means, so a list and its period filter agree (#355).
//
// Picked, typed and AI-read dates are date-only values stored at UTC midnight; reading them in the
// viewer's zone moves them a day back for everyone west of Greenwich. Some dates are real instants
// (upload time when no date was found, the time an email arrived); those belong to the viewer's
// local day, or a receipt uploaded at 01:30 in Athens files under the previous day. Same idea as
// lib/calendarDay.ts, which fixed this for the Calendar (#187, #243).

import { formatDate } from './i18n/format';

type DateLike = string | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD`: the UTC day of a UTC-midnight value, else the viewer's local day. '' when unset or invalid. */
export function recordDay(value: DateLike): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return dateOnly
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** That day, printed in the app language. Formatted in UTC so the day cannot shift again. */
export function formatRecordDay(value: DateLike, locale: string, options?: Intl.DateTimeFormatOptions): string {
  const day = recordDay(value);
  return day ? formatDate(day, locale, { ...options, timeZone: 'UTC' }) : '';
}
