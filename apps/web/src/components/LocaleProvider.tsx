'use client';
import { createContext, useContext, useMemo } from 'react';
import { makeT, type Dict, type TFunc, type Locale } from '@/lib/i18n';

type Ctx = { locale: Locale; t: TFunc };
const LocaleContext = createContext<Ctx | null>(null);

// The server layout resolves the dictionary and hands it down here so every client
// component gets the same translations via useT() — no per-component fetching.
export function LocaleProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(dict) }), [locale, dict]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Translate hook for client components. Falls back to the key if used outside a provider. */
export function useT(): TFunc {
  const c = useContext(LocaleContext);
  return c ? c.t : ((key) => String(key)) as TFunc;
}

export function useLocale(): Locale {
  return useContext(LocaleContext)?.locale ?? 'en';
}
