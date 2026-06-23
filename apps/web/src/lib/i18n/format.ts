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
