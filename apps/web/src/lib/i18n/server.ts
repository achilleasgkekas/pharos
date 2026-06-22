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
