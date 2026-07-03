import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { setCurrencySymbol, currencySymbol } from './money';
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
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  itemCategories: DEFAULT_ITEM_CATEGORIES,
  subscriptionCategories: DEFAULT_SUBSCRIPTION_CATEGORIES,
  budgets: {},
};

let cache: { v: AppSettings; t: number } | null = null;
const TTL = 5000;

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
    expenseCategories: resolveTaxonomy('expenseCategories', doc?.lists, DEFAULT_EXPENSE_CATEGORIES),
    itemCategories: resolveTaxonomy('itemCategories', doc?.lists, DEFAULT_ITEM_CATEGORIES),
    subscriptionCategories: resolveTaxonomy('subscriptionCategories', doc?.lists, DEFAULT_SUBSCRIPTION_CATEGORIES),
    budgets: numMap(doc?.budgets),
  };
}

/** Effective defaults/alerts/notification settings (DB singleton over hard defaults). */
export async function getAppSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.t < TTL) return cache.v;
  let doc: RawAppConfigDoc | null = null;
  try {
    await connectDB();
    doc = await AppConfig.findOne({ key: 'singleton' })
      .select('defaultItemView defaultWarrantyMonths warrantyAlertDays autoAddStores ntfyUrl ntfyEnabled currency defaultVatRate lists budgets')
      .lean();
  } catch {
    /* DB down → hard defaults */
  }
  const v = normalizeSettings(doc);
  // Keep the server-side currency symbol in sync for any server code that calls cur().
  setCurrencySymbol(currencySymbol(v.currency));
  cache = { v, t: Date.now() };
  return v;
}

export function invalidateAppSettings(): void {
  cache = null;
}
