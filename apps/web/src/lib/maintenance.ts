// P41 — pure, DB-free helpers for periodic maintenance on owned items.
//
// Deliberately NOT the warranty fields next door: a warranty expires exactly once and
// then the record is dead, while maintenance is a recurring physical chore with no
// money attached (dust the rack, change the printer nozzle, rotate the seasonal gear).
// Like lib/bill.ts, everything here is DERIVED from two stored fields, so the item
// list, the detail panel and any later notification scan agree without a third flag
// that could drift.

/** Item statuses where maintenance is meaningful: things actually in the house. */
export const MAINTENANCE_STATUSES = ['received', 'installed'] as const;

export function maintenanceApplies(status: string | null | undefined): boolean {
  return (MAINTENANCE_STATUSES as readonly string[]).includes(String(status ?? ''));
}

export type MaintenanceState = 'overdue' | 'due-soon' | 'ok';

/**
 * The date the clock last started. `lastMaintenanceAt` once the chore has ever been
 * marked done, otherwise the purchase date — a printer bought a year ago with a 90-day
 * interval IS overdue, and demanding one ceremonial "mark done" click before the
 * feature says anything useful would just train people to ignore it. Null when there
 * is neither: an interval with nothing to count from cannot produce a due date.
 */
export function maintenanceAnchor(
  lastMaintenanceAt: string | Date | null | undefined,
  purchasedAt?: string | Date | null
): Date | null {
  for (const v of [lastMaintenanceAt, purchasedAt]) {
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** When the next service falls due. Null when unscheduled (no interval, or no anchor). */
export function maintenanceNextDue(
  intervalDays: number | null | undefined,
  lastMaintenanceAt: string | Date | null | undefined,
  purchasedAt?: string | Date | null
): Date | null {
  const days = Number(intervalDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  const anchor = maintenanceAnchor(lastMaintenanceAt, purchasedAt);
  if (!anchor) return null;
  return new Date(anchor.getTime() + days * 86400000);
}

/** Whole days until the next service (negative = already overdue). Null when unscheduled. */
export function maintenanceDaysUntilDue(
  intervalDays: number | null | undefined,
  lastMaintenanceAt: string | Date | null | undefined,
  purchasedAt?: string | Date | null,
  now: number = Date.now()
): number | null {
  const due = maintenanceNextDue(intervalDays, lastMaintenanceAt, purchasedAt);
  if (!due) return null;
  return Math.ceil((due.getTime() - now) / 86400000);
}

/**
 * Urgency of the next service:
 *  - overdue  → the due date has passed
 *  - due-soon → within `soonDays` (default 7)
 *  - ok       → further out
 * Null when unscheduled, which is every item written before P41.
 */
export function maintenanceState(
  intervalDays: number | null | undefined,
  lastMaintenanceAt: string | Date | null | undefined,
  purchasedAt?: string | Date | null,
  now: number = Date.now(),
  soonDays = 7
): MaintenanceState | null {
  const days = maintenanceDaysUntilDue(intervalDays, lastMaintenanceAt, purchasedAt, now);
  if (days === null) return null;
  if (days < 0) return 'overdue';
  if (days <= soonDays) return 'due-soon';
  return 'ok';
}

/**
 * Clamp a typed interval to something storable. Anything blank, zero, negative or
 * non-numeric means "no schedule" (null) rather than 0, so the field round-trips
 * through the form as the absence it is. Capped at ten years: the field is a chore
 * timer, and a fat-fingered 99999 would render a due date in the year 2300.
 */
export function normalizeMaintenanceInterval(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), 3650);
}

/** One inventory row as the alert scans need it (shape of the .lean() projection below). */
export type MaintenanceRow = {
  _id: unknown;
  title: string;
  status?: string | null;
  maintenanceIntervalDays?: number | null;
  lastMaintenanceAt?: string | Date | null;
  purchasedAt?: string | Date | null;
};

/** A chore that is due (or overdue). `days` is negative once the date has passed. */
export type MaintenanceDueEntry = { _id: unknown; title: string; days: number; iso: string };

/**
 * The items whose next service falls within `leadDays` — soonest (most overdue) first.
 *
 * Shared by BOTH alert paths on purpose: the in-app bell (computeAlerts) and the outbound
 * summary (runAlertChecks) must agree on what is due, or the phone push and the bell would
 * disagree about the same printer. There is deliberately NO lower bound: an overdue chore
 * keeps nagging until someone presses "serviced today", exactly like an unpaid bill.
 *
 * The Mongo query can only filter on the stored interval, so the status re-check happens
 * here — a sold or broken thing does not get serviced, and P41 hides the widget for it too.
 */
export function collectMaintenanceDue(
  rows: MaintenanceRow[],
  leadDays = 7,
  now: number = Date.now()
): MaintenanceDueEntry[] {
  const out: MaintenanceDueEntry[] = [];
  for (const r of rows) {
    if (!maintenanceApplies(r.status)) continue;
    const due = maintenanceNextDue(r.maintenanceIntervalDays, r.lastMaintenanceAt, r.purchasedAt);
    if (!due) continue;
    const days = Math.ceil((due.getTime() - now) / 86400000);
    if (days > leadDays) continue;
    out.push({ _id: r._id, title: r.title, days, iso: due.toISOString().slice(0, 10) });
  }
  return out.sort((a, b) => a.days - b.days);
}
