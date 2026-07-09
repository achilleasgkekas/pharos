import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import { currentTenant } from './tenancy/current';
import { setCurrencySymbol, currencySymbol } from './money';
// Side-effect import: registers the tenant-aware currency-symbol resolver into money.ts.
// getAppSettings is server-only and runs on every request before render, so importing it
// here guarantees the resolver is bound server-side without money.ts needing a node import.
import './tenancy/currencyBinding';
import {
  resolveTaxonomy,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_ITEM_CATEGORIES,
  DEFAULT_SUBSCRIPTION_CATEGORIES,
} from './taxonomies';

export type AppSettings = {
  defaultItemView: 'grid' | 'list';
  defaultWarrantyMonths: number;
  warrantyAlertDays: number;
  autoAddStores: boolean;
  ntfyUrl: string;
  ntfyEnabled: boolean;
  currency: string;
  defaultVatRate: number;
  defaultReturnWindowDays: number; // return window (days) unless a store overrides it; 0 = off
  expenseCategories: string[];
  itemCategories: string[];
  subscriptionCategories: string[];
  budgets: Record<string, number>; // monthly budget per expense category (€)
};

/** Raw AppConfig singleton fields relevant to app settings (all optional). */
export type RawAppConfigDoc = {
  defaultItemView?: string;
  defaultWarrantyMonths?: number;
  warrantyAlertDays?: number;
  autoAddStores?: boolean;
  ntfyUrl?: string;
  ntfyEnabled?: boolean;
  currency?: string;
  defaultVatRate?: number;
  defaultReturnWindowDays?: number;
  lists?: Record<string, unknown>;
  budgets?: Record<string, unknown>;
};

/** Coerce a Mixed map to { key: positiveNumber }. */
export function numMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Number(v);
      if (k && Number.isFinite(n) && n > 0) out[k] = n;
    }
  }
  return out;
}

const DEFAULTS: AppSettings = {
  defaultItemView: 'grid',
  defaultWarrantyMonths: 24,
  warrantyAlertDays: 90,
  autoAddStores: true,
  ntfyUrl: '',
  ntfyEnabled: false,
  currency: 'EUR',
  defaultVatRate: 24,
  defaultReturnWindowDays: 14, // EU distance-selling default
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  itemCategories: DEFAULT_ITEM_CATEGORIES,
  subscriptionCategories: DEFAULT_SUBSCRIPTION_CATEGORIES,
  budgets: {},
};

// Cache keyed by tenant. Default/self-hosted tenant uses the '' key so its behaviour and
// TTL are byte-for-byte identical to the old single-slot cache; SaaS tenants each get their
// own slot so one tenant's settings never bleed into another's.
const cache = new Map<string, { v: AppSettings; t: number }>();
const TTL = 5000;

/** Stable cache key for the current tenant ('' = default/self-hosted). */
function tenantKey(): string {
  const ctx = currentTenant();
  return ctx.isDefault || !ctx.tenantId ? '' : ctx.tenantId;
}

/** Pure coercion of a raw AppConfig doc into effective AppSettings (DB-free, testable). */
export function normalizeSettings(doc: RawAppConfigDoc | null | undefined): AppSettings {
  return {
    defaultItemView: doc?.defaultItemView === 'list' ? 'list' : 'grid',
    defaultWarrantyMonths: typeof doc?.defaultWarrantyMonths === 'number' ? doc.defaultWarrantyMonths : DEFAULTS.defaultWarrantyMonths,
    warrantyAlertDays: typeof doc?.warrantyAlertDays === 'number' ? doc.warrantyAlertDays : DEFAULTS.warrantyAlertDays,
    autoAddStores: doc?.autoAddStores !== false,
    ntfyUrl: doc?.ntfyUrl || '',
    ntfyEnabled: !!doc?.ntfyEnabled,
    currency: doc?.currency || DEFAULTS.currency,
    defaultVatRate: typeof doc?.defaultVatRate === 'number' ? doc.defaultVatRate : DEFAULTS.defaultVatRate,
    defaultReturnWindowDays:
      typeof doc?.defaultReturnWindowDays === 'number' && doc.defaultReturnWindowDays >= 0
        ? doc.defaultReturnWindowDays
        : DEFAULTS.defaultReturnWindowDays,
    expenseCategories: resolveTaxonomy('expenseCategories', doc?.lists, DEFAULT_EXPENSE_CATEGORIES),
    itemCategories: resolveTaxonomy('itemCategories', doc?.lists, DEFAULT_ITEM_CATEGORIES),
    subscriptionCategories: resolveTaxonomy('subscriptionCategories', doc?.lists, DEFAULT_SUBSCRIPTION_CATEGORIES),
    budgets: numMap(doc?.budgets),
  };
}

/** Effective defaults/alerts/notification settings (DB singleton over hard defaults). */
export async function getAppSettings(): Promise<AppSettings> {
  const key = tenantKey();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let doc: RawAppConfigDoc | null = null;
  try {
    await connectDB();
    // Route to the current tenant's database (default tenant → the AppConfig model
    // untouched, same query as before).
    const Config = await currentModel(AppConfig);
    doc = await Config.findOne({ key: 'singleton' })
      .select('defaultItemView defaultWarrantyMonths warrantyAlertDays autoAddStores ntfyUrl ntfyEnabled currency defaultVatRate defaultReturnWindowDays lists budgets')
      .lean();
  } catch {
    /* DB down → hard defaults */
  }
  const v = normalizeSettings(doc);
  // Keep the (tenant-scoped) currency symbol in sync for any server code that calls cur().
  setCurrencySymbol(currencySymbol(v.currency));
  cache.set(key, { v, t: Date.now() });
  return v;
}

/** Clear the settings cache. No arg → only the CURRENT tenant; `all` → every tenant. */
export function invalidateAppSettings(all = false): void {
  if (all) cache.clear();
  else cache.delete(tenantKey());
}
