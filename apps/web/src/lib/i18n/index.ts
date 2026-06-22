import { en, type Dict, type TKey } from './locales/en';
import { el } from './locales/el';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { it } from './locales/it';
import { pt } from './locales/pt';
import { nl } from './locales/nl';
import type { Locale } from './config';

const DICTS: Record<Locale, Partial<Dict>> = { en, el, es, fr, de, it, pt, nl };

/** A locale's full dictionary = its strings layered over the English base, so any
 *  untranslated key gracefully falls back to English. */
export function resolveDict(locale: Locale): Dict {
  return { ...en, ...DICTS[locale] } as Dict;
}

/** Build a translate function from a resolved dictionary. Supports {var} interpolation. */
export function makeT(dict: Dict) {
  return (key: TKey, vars?: Record<string, string | number>): string => {
    let s: string = dict[key] ?? en[key] ?? String(key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export type TFunc = ReturnType<typeof makeT>;
export type { Dict, TKey } from './locales/en';
export type { Locale } from './config';
