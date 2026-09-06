// Per-type alert toggles (P103). The outbound summary that runAlertChecks() pushes to
// ntfy/Discord/Slack/Telegram bundles every category into one message; this registry lets
// Settings → Notifications turn each category off individually. Client-safe on purpose (the
// checkbox list imports it), so nothing server-only may be imported here.
//
// The in-app bell is deliberately NOT filtered by these — it has its own per-item memory and
// costs nothing to glance at. These toggles are about what interrupts you on your phone.

export const ALERT_TYPES = [
  { key: 'deals', label: 'Price drops (target price hit)' },
  { key: 'installments', label: 'Installments due this month' },
  { key: 'warranty', label: 'Warranties expiring' },
  { key: 'returns', label: 'Return windows closing' },
  { key: 'priceHikes', label: 'Recurring price changes' },
  { key: 'trials', label: 'Free trials ending' },
  { key: 'giftCards', label: 'Gift cards expiring with balance' },
  { key: 'bills', label: 'Bills due / overdue' },
  { key: 'maintenance', label: 'Maintenance due on owned items' },
  { key: 'lending', label: 'Lent items due back' },
  { key: 'warrantyClaims', label: 'Warranty claims with no movement' },
  { key: 'budgets', label: 'Budgets exceeded' },
  { key: 'syncStale', label: 'Remote backup fallen behind' },
] as const;

export type AlertType = (typeof ALERT_TYPES)[number]['key'];
export type NotifyTypes = Record<AlertType, boolean>;

export const ALERT_TYPE_KEYS: AlertType[] = ALERT_TYPES.map((t) => t.key);

/** Every type on — the pre-P103 behaviour, and what an unset/partial doc resolves to. */
export function defaultNotifyTypes(): NotifyTypes {
  return Object.fromEntries(ALERT_TYPE_KEYS.map((k) => [k, true])) as NotifyTypes;
}

/** Coerce a stored Mixed map into a complete NotifyTypes. Only an explicit `false` turns a
 *  type off, so an older doc (no field at all) or a partial one keeps sending everything. */
export function resolveNotifyTypes(raw: unknown): NotifyTypes {
  const out = defaultNotifyTypes();
  if (raw && typeof raw === 'object') {
    const src = raw as Record<string, unknown>;
    for (const k of ALERT_TYPE_KEYS) if (src[k] === false) out[k] = false;
  }
  return out;
}
