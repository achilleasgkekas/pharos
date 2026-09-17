import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config';
import { resolveDict, makeT, type Dict, type TFunc } from './index';

/** The active locale for this request (from the cookie, else the default). */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
}

/** Locale + dictionary + t() for Server Components. The dict is also handed to the
 *  client via <LocaleProvider> so client components share the exact same strings. */
export async function getServerT(): Promise<{ locale: Locale; dict: Dict; t: TFunc }> {
  const locale = await getLocale();
  const dict = resolveDict(locale);
  return { locale, dict, t: makeT(dict) };
}

/** The request's locale, or the default outside a request (cron, scripts, unit tests), where
 *  `cookies()` throws. For formatting only — never a reason to fail the caller (#5). */
export async function getLocaleSafe(): Promise<Locale> {
  try {
    return await getLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}
