import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { tenantDb, tenantModel } from './tenancy/connection';
import { softRequestTenant } from './tenancy/request';
import { currentTenant } from './tenancy/current';
import { setCurrencySymbol, currencySymbol } from './money';
// Side-effect import: registers the tenant-aware currency-symbol resolver into money.ts.
// getAppSettings is server-only and runs on every request before render, so importing it
// here guarantees the resolver is bound server-side without money.ts needing a node import.
import './tenancy/currencyBinding';
import { DEFAULT_STALE_CLAIM_DAYS } from './warrantyClaims';
import {
  resolveTaxonomy,
  normalizeSpaces,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_ITEM_CATEGORIES,
  DEFAULT_SUBSCRIPTION_CATEGORIES,
  DEFAULT_SPACES,
} from './taxonomies';
import { resolveDepreciation, DEFAULT_DEPRECIATION, type DepreciationConfig } from './depreciation';
import { resolveCategoryRules, type CategoryRule } from './categoryRules';
import { resolveNotifyTypes, defaultNotifyTypes, type NotifyTypes } from './alertTypes';
import { normalizeQuietHours, type QuietHours } from './quietHours';

export type AppSettings = {
  defaultItemView: 'grid' | 'list';
  defaultWarrantyMonths: number;
  warrantyAlertDays: number;
  trialAlertDays: number; // lead time (days) for free-trial "cancel before charge" alert (P33)
  giftCardAlertDays: number; // window (days) for "gift card expiring with balance" alert (P32); 0 = off
  billAlertDays: number; // lead-time (days) for "bill due / overdue" alert (P28); 0 = off
  documentAlertDays: number; // lead-time (days) for "document expiring / expired" alert (P42); 0 = off
  specialDateAlertDays: number; // lead-time (days) for "birthday / anniversary coming up" alert (P50); 0 = off
  maintenanceAlertDays: number; // lead-time (days) for the "maintenance due" alert (P41); overdue nags regardless
  lendingAlertDays: number; // lead-time (days) for the "lent item due back" alert (P47); overdue nags regardless
  staleClaimDays: number; // days of silence before an open warranty claim counts as forgotten (P44); 0 = off
  syncStaleDays: number; // days without a successful remote push before alerting (P48); 0 = off
  autoAddStores: boolean;
  ntfyUrl: string;
  ntfyEnabled: boolean;
  currency: string;
  multiCurrency: boolean; // P9: allow per-entry foreign currency + FX rate; off = single-currency UI
  defaultVatRate: number;
  defaultReturnWindowDays: number; // return window (days) unless a store overrides it; 0 = off
  expenseCategories: string[];
  itemCategories: string[];
  subscriptionCategories: string[];
  spaces: string[]; // per-property / per-context ledger tags (P34); empty = feature dormant
  budgets: Record<string, number>; // monthly budget per expense category (€)
  budgetRollover: boolean; // envelope mode (P25): carry net unspent budget into this month
  assetAccounts: Record<string, number>; // manual asset accounts for net worth (name → balance)
  depreciation: DepreciationConfig; // asset depreciation model (P29) for owned-inventory valuation
  categoryRules: CategoryRule[]; // vendor→category auto-rules (P15), applied on create
  onboardingDismissed: boolean; // hides the homepage "getting started" checklist (P26)
  notifyTypes: NotifyTypes; // per-type outbound alert toggles (P103); all-on = pre-P103 behaviour
  quietHours: QuietHours; // do-not-disturb window for the alert cron (P86); empty = off
};

/** Raw AppConfig singleton fields relevant to app settings (all optional). */
export type RawAppConfigDoc = {
  defaultItemView?: string;
  defaultWarrantyMonths?: number;
  warrantyAlertDays?: number;
  trialAlertDays?: number;
  giftCardAlertDays?: number;
  billAlertDays?: number;
  documentAlertDays?: number;
  specialDateAlertDays?: number;
  maintenanceAlertDays?: number;
  lendingAlertDays?: number;
  staleClaimDays?: number;
  syncStaleDays?: number;
  autoAddStores?: boolean;
  ntfyUrl?: string;
  ntfyEnabled?: boolean;
  currency?: string;
  multiCurrency?: boolean;
  defaultVatRate?: number;
  defaultReturnWindowDays?: number;
  lists?: Record<string, unknown>;
  spaces?: unknown;
  budgets?: Record<string, unknown>;
  budgetRollover?: boolean;
  assetAccounts?: Record<string, unknown>;
  depreciation?: Record<string, unknown>;
  categoryRules?: unknown;
  onboardingDismissed?: boolean;
  notifyTypes?: unknown;
  quietHours?: unknown;
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
  trialAlertDays: 2,
  giftCardAlertDays: 30,
  billAlertDays: 5,
  documentAlertDays: 30,
  specialDateAlertDays: 7,
  maintenanceAlertDays: 7,
  lendingAlertDays: 3,
  staleClaimDays: DEFAULT_STALE_CLAIM_DAYS,
  syncStaleDays: 7,
  autoAddStores: true,
  ntfyUrl: '',
  ntfyEnabled: false,
  currency: 'EUR',
  multiCurrency: false,
  defaultVatRate: 24,
  defaultReturnWindowDays: 14, // EU distance-selling default
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  itemCategories: DEFAULT_ITEM_CATEGORIES,
  subscriptionCategories: DEFAULT_SUBSCRIPTION_CATEGORIES,
  spaces: DEFAULT_SPACES,
  budgets: {},
  budgetRollover: false,
  assetAccounts: {},
  depreciation: DEFAULT_DEPRECIATION,
  categoryRules: [],
  onboardingDismissed: false,
  notifyTypes: defaultNotifyTypes(),
  quietHours: { start: '', end: '' },
};

// Cache keyed by tenant. Default/self-hosted tenant uses the '' key so its behaviour and
// TTL are byte-for-byte identical to the old single-slot cache; SaaS tenants each get their
// own slot so one tenant's settings never bleed into another's.
const cache = new Map<string, { v: AppSettings; t: number }>();
const TTL = 5000;

/** Stable cache key for a tenant ('' = default/self-hosted). */
function keyFor(ctx: { isDefault: boolean; tenantId: string | null }): string {
  return ctx.isDefault || !ctx.tenantId ? '' : ctx.tenantId;
}

/** Stable cache key for the AMBIENT tenant. Only used by the invalidation path. */
function tenantKey(): string {
  return keyFor(currentTenant());
}

/** Pure coercion of a raw AppConfig doc into effective AppSettings (DB-free, testable). */
export function normalizeSettings(doc: RawAppConfigDoc | null | undefined): AppSettings {
  return {
    defaultItemView: doc?.defaultItemView === 'list' ? 'list' : 'grid',
    defaultWarrantyMonths: typeof doc?.defaultWarrantyMonths === 'number' ? doc.defaultWarrantyMonths : DEFAULTS.defaultWarrantyMonths,
    warrantyAlertDays: typeof doc?.warrantyAlertDays === 'number' ? doc.warrantyAlertDays : DEFAULTS.warrantyAlertDays,
    trialAlertDays: typeof doc?.trialAlertDays === 'number' ? doc.trialAlertDays : DEFAULTS.trialAlertDays,
    giftCardAlertDays: typeof doc?.giftCardAlertDays === 'number' ? doc.giftCardAlertDays : DEFAULTS.giftCardAlertDays,
    billAlertDays: typeof doc?.billAlertDays === 'number' ? doc.billAlertDays : DEFAULTS.billAlertDays,
    documentAlertDays: typeof doc?.documentAlertDays === 'number' ? doc.documentAlertDays : DEFAULTS.documentAlertDays,
    specialDateAlertDays: typeof doc?.specialDateAlertDays === 'number' ? doc.specialDateAlertDays : DEFAULTS.specialDateAlertDays,
    maintenanceAlertDays:
      typeof doc?.maintenanceAlertDays === 'number' ? doc.maintenanceAlertDays : DEFAULTS.maintenanceAlertDays,
    lendingAlertDays: typeof doc?.lendingAlertDays === 'number' ? doc.lendingAlertDays : DEFAULTS.lendingAlertDays,
    staleClaimDays: typeof doc?.staleClaimDays === 'number' ? doc.staleClaimDays : DEFAULTS.staleClaimDays,
    syncStaleDays: typeof doc?.syncStaleDays === 'number' ? doc.syncStaleDays : DEFAULTS.syncStaleDays,
    autoAddStores: doc?.autoAddStores !== false,
    ntfyUrl: doc?.ntfyUrl || '',
    ntfyEnabled: !!doc?.ntfyEnabled,
    currency: doc?.currency || DEFAULTS.currency,
    multiCurrency: !!doc?.multiCurrency,
    defaultVatRate: typeof doc?.defaultVatRate === 'number' ? doc.defaultVatRate : DEFAULTS.defaultVatRate,
    defaultReturnWindowDays:
      typeof doc?.defaultReturnWindowDays === 'number' && doc.defaultReturnWindowDays >= 0
        ? doc.defaultReturnWindowDays
        : DEFAULTS.defaultReturnWindowDays,
    expenseCategories: resolveTaxonomy('expenseCategories', doc?.lists, DEFAULT_EXPENSE_CATEGORIES),
    itemCategories: resolveTaxonomy('itemCategories', doc?.lists, DEFAULT_ITEM_CATEGORIES),
    subscriptionCategories: resolveTaxonomy('subscriptionCategories', doc?.lists, DEFAULT_SUBSCRIPTION_CATEGORIES),
    spaces: normalizeSpaces(doc?.spaces),
    budgets: numMap(doc?.budgets),
    budgetRollover: !!doc?.budgetRollover,
    assetAccounts: numMap(doc?.assetAccounts),
    depreciation: resolveDepreciation(doc?.depreciation),
    categoryRules: resolveCategoryRules(doc?.categoryRules),
    onboardingDismissed: !!doc?.onboardingDismissed,
    notifyTypes: resolveNotifyTypes(doc?.notifyTypes),
    quietHours: normalizeQuietHours(doc?.quietHours),
  };
}

/** Effective defaults/alerts/notification settings (DB singleton over hard defaults). */
export async function getAppSettings(): Promise<AppSettings> {
  // Resolve the workspace even when no ambient context was established. Settings server actions
  // reach their models through a helper that opens and closes the context per call, so by the
  // time they call this there is no ambient tenant — and `currentTenant()` would then answer
  // "default", reading the WRONG database and, worse, caching that answer under the default key
  // where every other workspace would pick it up.
  const ctx = await softRequestTenant();
  const key = keyFor(ctx);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let doc: RawAppConfigDoc | null = null;
  try {
    await connectDB();
    const Config = tenantModel(await tenantDb(ctx), AppConfig);
    doc = await Config.findOne({ key: 'singleton' })
      .select('defaultItemView defaultWarrantyMonths warrantyAlertDays trialAlertDays giftCardAlertDays billAlertDays documentAlertDays specialDateAlertDays maintenanceAlertDays lendingAlertDays staleClaimDays syncStaleDays autoAddStores ntfyUrl ntfyEnabled currency multiCurrency defaultVatRate defaultReturnWindowDays lists spaces budgets budgetRollover assetAccounts depreciation categoryRules onboardingDismissed notifyTypes quietHours')
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
