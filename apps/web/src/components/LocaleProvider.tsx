'use client';
import { formatCurrency } from '@/lib/i18n/format';
import React, { createContext, useContext, useMemo } from 'react';
import { makeT, type Dict, type TFunc, type Locale } from '@/lib/i18n';

type Ctx = { locale: Locale; currency: string; t: TFunc };
const LocaleContext = createContext<Ctx | null>(null);

// The server layout resolves the dictionary and hands it down here so every client
// component gets the same translations via useT() — no per-component fetching.
export function LocaleProvider({ locale, dict, currency = 'EUR', children }: { locale: Locale; dict: Dict; currency?: string; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, currency, t: makeT(dict) }), [locale, dict, currency]);
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

/** Reads both preferences from the render tree, never a process-wide display variable. */
export function useMoney(options: Intl.NumberFormatOptions = {}) {
  const context = useContext(LocaleContext);
  return (amount: number, currency = context?.currency ?? 'EUR', overrides: Intl.NumberFormatOptions = {}) =>
    formatCurrency(amount, currency, context?.locale ?? 'en', { ...options, ...overrides });
}
