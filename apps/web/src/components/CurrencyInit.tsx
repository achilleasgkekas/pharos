'use client';
import { setCurrencySymbol } from '@/lib/money';

/** Sets the client-side currency symbol before children render. Renders nothing.
 *  (The server symbol is set in getAppSettings()/layout, so SSR + client agree.) */
export function CurrencyInit({ symbol }: { symbol: string }) {
  setCurrencySymbol(symbol);
  return null;
}
