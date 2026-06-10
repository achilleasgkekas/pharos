// Display currency. The app is single-currency per deployment (the user picks theirs
// in Settings, default EUR). `cur()` returns the symbol; it reads a module variable
// that's set on every render from the saved setting — on the client by <CurrencyInit>,
// on the server by getAppSettings()/layout. No per-component prop drilling needed.

export const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'USD', symbol: '$', label: 'US Dollar ($)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (£)' },
  { code: 'CHF', symbol: 'CHF ', label: 'Swiss Franc (CHF)' },
  { code: 'SEK', symbol: 'kr ', label: 'Swedish Krona (kr)' },
  { code: 'NOK', symbol: 'kr ', label: 'Norwegian Krone (kr)' },
  { code: 'DKK', symbol: 'kr ', label: 'Danish Krone (kr)' },
  { code: 'PLN', symbol: 'zł ', label: 'Polish Złoty (zł)' },
  { code: 'CZK', symbol: 'Kč ', label: 'Czech Koruna (Kč)' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar (C$)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (A$)' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen (¥)' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (₹)' },
];

/** Symbol for an ISO 4217 code (falls back to the code itself, then €). */
export function currencySymbol(code?: string | null): string {
  if (!code) return '€';
  const hit = CURRENCIES.find((c) => c.code === code.toUpperCase());
  return hit ? hit.symbol : `${code} `;
}

let _symbol = '€';

/** Set the active display symbol. Single-user app → a module variable is safe. */
export function setCurrencySymbol(symbol: string): void {
  _symbol = symbol || '€';
}

/** The active currency symbol for prefixing amounts, e.g. `${cur()}${n.toFixed(2)}`. */
export function cur(): string {
  return _symbol;
}
