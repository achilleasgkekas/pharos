// Supported locales (popular European, all LTR). English is the source/fallback.
export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];
export const LOCALE_CODES = LOCALES.map((l) => l.code) as Locale[];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'pharos_locale';

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALE_CODES as string[]).includes(v);
}
