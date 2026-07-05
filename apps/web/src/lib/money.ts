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

// --- Active display symbol -------------------------------------------------
// SELF-HOSTED / CLIENT: a single module variable is safe and unchanged — there is no
// tenant context on the client, and the self-hosted server never enters `withTenant`.
// SAAS (concurrent tenants of different currencies): a bare module var would let one
// tenant's request clobber the symbol another tenant is mid-rendering with. So when an
// explicit tenant IS established for the current async subtree, the symbol is stored /
// read per-tenant, isolated by AsyncLocalStorage.
//
// This module is imported client-side (CurrencyInit) too, so it must stay free of any
// node-only import. Instead of importing the tenant store here, the SERVER registers a
// key resolver at startup (see lib/tenancy/currencyBinding.ts, imported by getAppSettings
// / the layout). When no resolver is registered (the client, and self-hosted where nothing
// establishes a tenant), we fall back to the module variable — byte-for-byte unchanged.
// `cur()`/`setCurrencySymbol` keep their exact call signatures, so no call site changes.

let _symbol = '€';

// Per-tenant symbols, keyed by tenant id. Only populated in SaaS mode (an established,
// non-default tenant context). The default/self-hosted tenant always uses `_symbol`.
const _tenantSymbols = new Map<string, string>();

/**
 * Injected by the server (node-only). Returns the current tenant's stable key, or null when
 * there is no explicit non-default tenant context → use the module var. Left null on the
 * client, so the client path never touches the tenant machinery.
 */
let _tenantKeyResolver: (() => string | null) | null = null;

/** Server-only: register how to resolve the current tenant's symbol key. Idempotent. */
export function bindCurrencyTenantResolver(resolver: () => string | null): void {
  _tenantKeyResolver = resolver;
}

function tenantSymbolKey(): string | null {
  return _tenantKeyResolver ? _tenantKeyResolver() : null;
}

/**
 * Set the active display symbol. Self-hosted / client → the module var (unchanged). Under an
 * explicit SaaS tenant context → that tenant's slot, isolated from concurrent tenants.
 */
export function setCurrencySymbol(symbol: string): void {
  const s = symbol || '€';
  const key = tenantSymbolKey();
  if (key) _tenantSymbols.set(key, s);
  else _symbol = s;
}

/** The active currency symbol for prefixing amounts, e.g. `${cur()}${n.toFixed(2)}`. */
export function cur(): string {
  const key = tenantSymbolKey();
  if (key) return _tenantSymbols.get(key) ?? _symbol;
  return _symbol;
}
