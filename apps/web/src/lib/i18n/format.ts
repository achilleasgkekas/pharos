import type { TFunc } from '@/lib/i18n';

/** Localized "x ago" relative time, given a translate function (client-side). */
export function relTime(iso: string, t: TFunc): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.minutes', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hours', { n: Math.floor(s / 3600) });
  const d = Math.floor(s / 86400);
  return d === 1 ? t('time.yesterday') : t('time.days', { n: d });
}

/** Money display only: locale and ISO currency are explicit so concurrent requests stay isolated. */
export function formatCurrency(
  amount: number,
  currency: string,
  locale = 'en',
  options: Intl.NumberFormatOptions = {},
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

/** Intl tag for an app locale. The app's `en` is British English (DD/MM, Monday weeks); bare `en`
 *  would resolve to US order in Intl. Every other app locale is already a valid Intl tag. */
export function intlTag(locale: string | undefined | null): string {
  return !locale || locale === 'en' ? 'en-GB' : locale;
}

type DateLike = string | number | Date | null | undefined;

function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Date in the ACTIVE app language (#5) — replaces every hardcoded `toLocaleDateString('en-GB')`.
 *  Invalid/empty → `fallback`. Server code has no React context, so the locale is always explicit:
 *  pass `useLocale()` on the client and `getLocale()` on the server. Never use this for values that
 *  feed an <input type="date"> — those must stay ISO. */
export function formatDate(value: DateLike, locale: string, options?: Intl.DateTimeFormatOptions, fallback = ''): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(intlTag(locale), options) : fallback;
}

/** Time of day in the active app language. */
export function formatTime(value: DateLike, locale: string, options?: Intl.DateTimeFormatOptions, fallback = ''): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(intlTag(locale), options) : fallback;
}

/** Date + time in the active app language. */
export function formatDateTime(value: DateLike, locale: string, options?: Intl.DateTimeFormatOptions, fallback = ''): string {
  const d = toDate(value);
  return d ? d.toLocaleString(intlTag(locale), options) : fallback;
}
