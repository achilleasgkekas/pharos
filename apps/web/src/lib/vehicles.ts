/**
 * Vehicles (P110, #126): the pure rules, DB-free so tests pin them.
 *
 * Fuel consumption uses the full-to-full method every fuel log (and LubeLogger) uses: between
 * two FULL fills, the litres of every fill after the first (partials included) divided by the
 * distance driven. A partial fill on its own says nothing about consumption. Nothing derived
 * is stored, so correcting an old fill fixes every figure after it (same idea as P49's meters).
 */
import { documentDaysUntilExpiry } from './documentExpiry';

export type FuelLog = { _id?: unknown; date: string | Date; odometer: number; liters: number; cost: number; fullTank?: boolean };

export type FuelRow = FuelLog & {
  /** L/100 km for the stretch this full fill closes, or null (partial fill, or no earlier full fill). */
  consumption: number | null;
};

/** Fuel logs in odometer order, each full fill annotated with the consumption since the previous one. */
export function withFuelConsumption(logs: FuelLog[]): FuelRow[] {
  const sorted = [...logs].filter((l) => l.odometer >= 0).sort((a, b) => a.odometer - b.odometer || +new Date(a.date) - +new Date(b.date));
  let lastFullOdo: number | null = null;
  let litersSince = 0;
  return sorted.map((l) => {
    const full = l.fullTank !== false;
    let consumption: number | null = null;
    litersSince += l.liters > 0 ? l.liters : 0;
    if (full) {
      if (lastFullOdo !== null && l.odometer > lastFullOdo) {
        consumption = Math.round((litersSince / (l.odometer - lastFullOdo)) * 100 * 100) / 100;
      }
      lastFullOdo = l.odometer;
      litersSince = 0;
    }
    return { ...l, consumption };
  });
}

export type VehicleStats = {
  /** Average L/100 km over every measured stretch (litres ÷ distance, not a mean of means). */
  avgConsumption: number | null;
  fuelCost: number;
  serviceCost: number;
  /** Distance covered by the logs (highest − lowest odometer seen), 0 with fewer than two. */
  distance: number;
  /** (fuel + service) ÷ distance, null without distance. */
  costPerKm: number | null;
};

export function vehicleStats(fuel: FuelLog[], service: { cost: number; odometer?: number | null }[]): VehicleStats {
  const rows = withFuelConsumption(fuel);
  let liters = 0;
  let km = 0;
  let lastFull: number | null = null;
  let since = 0;
  for (const r of rows) {
    since += r.liters > 0 ? r.liters : 0;
    if (r.fullTank !== false) {
      if (lastFull !== null && r.odometer > lastFull) {
        liters += since;
        km += r.odometer - lastFull;
      }
      lastFull = r.odometer;
      since = 0;
    }
  }
  const fuelCost = round2(fuel.reduce((s, f) => s + (f.cost > 0 ? f.cost : 0), 0));
  const serviceCost = round2(service.reduce((s, x) => s + (x.cost > 0 ? x.cost : 0), 0));
  const odos = [...fuel.map((f) => f.odometer), ...service.map((s) => s.odometer ?? -1)].filter((o) => o >= 0);
  const distance = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0;
  return {
    avgConsumption: km > 0 ? Math.round((liters / km) * 100 * 100) / 100 : null,
    fuelCost,
    serviceCost,
    distance,
    costPerKm: distance > 0 ? Math.round(((fuelCost + serviceCost) / distance) * 1000) / 1000 : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The dates a vehicle carries that expire. Keys are stored on the Vehicle document. */
export const VEHICLE_DUE_KINDS = ['motUntil', 'insuranceUntil', 'roadTaxUntil', 'emissionsUntil', 'tyreChangeUntil', 'batteryUntil'] as const;
export type VehicleDueKind = (typeof VEHICLE_DUE_KINDS)[number];

export type VehicleDueRow = { _id: unknown; name: string; plate?: string } & Partial<Record<VehicleDueKind, string | Date | null>>;
export type VehicleDue = { _id: unknown; name: string; plate: string; kind: VehicleDueKind; days: number; iso: string };

/**
 * Vehicle dates that warrant an alert: due within `leadDays`, or already past (keeps nagging until
 * renewed), soonest first. `leadDays <= 0` turns it off. Same day arithmetic as documents (P42).
 */
export function collectVehicleDue(rows: VehicleDueRow[], leadDays: number, now: number = Date.now()): VehicleDue[] {
  if (!(leadDays > 0)) return [];
  const out: VehicleDue[] = [];
  for (const r of rows) {
    for (const kind of VEHICLE_DUE_KINDS) {
      const at = r[kind];
      const days = documentDaysUntilExpiry(at ?? null, now);
      if (days === null || days > leadDays) continue;
      out.push({ _id: r._id, name: r.name, plate: r.plate || '', kind, days, iso: new Date(at as string | Date).toISOString().slice(0, 10) });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Fuel / drive types a vehicle can have (#363). '' = not set. */
export const VEHICLE_FUEL_TYPES = ['', 'petrol', 'diesel', 'lpg', 'cng', 'hybrid', 'phev', 'electric'] as const;
export type VehicleFuelType = (typeof VEHICLE_FUEL_TYPES)[number];

// ─── Service schedule (#363) ────────────────────────────────────────────────

/** How close (km) a service may get before it alerts, next to the date lead time. */
export const SERVICE_KM_LEAD = 1000;

export type ServiceScheduleVehicle = {
  serviceIntervalKm?: number | null;
  serviceIntervalMonths?: number | null;
  purchaseDate?: string | Date | null;
  purchaseOdometer?: number | null;
};
export type ServiceScheduleLog = {
  date: string | Date;
  odometer?: number | null;
  nextServiceKm?: number | null;
  nextServiceDate?: string | Date | null;
};
export type NextService = {
  /** YYYY-MM-DD, or null when nothing says when. */
  dueDate: string | null;
  dueKm: number | null;
  /** Whole days until dueDate (negative = overdue), null without a date. */
  daysLeft: number | null;
  /** km until dueKm from the current odometer (negative = overdue), null without both. */
  kmLeft: number | null;
};

function addMonthsUTC(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last)));
}

const positive = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * When the next service is due, by date and by km; whichever comes first is what alerts.
 *
 * The latest service is the base. A next date / km the garage wrote on that invoice wins over
 * the vehicle's interval; otherwise the interval counts from that service. With no service yet,
 * the interval counts from the purchase. Nothing is stored: logging a service moves it on.
 */
export function nextService(
  vehicle: ServiceScheduleVehicle,
  services: ServiceScheduleLog[],
  currentOdometer: number | null,
  now: number = Date.now()
): NextService {
  const last = [...services].sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];
  const baseDate = last ? new Date(last.date) : vehicle.purchaseDate ? new Date(vehicle.purchaseDate) : null;
  const baseKm = last ? (last.odometer ?? null) : (vehicle.purchaseOdometer ?? null);

  let due: Date | null = last?.nextServiceDate ? new Date(last.nextServiceDate) : null;
  if (!due && baseDate && !Number.isNaN(baseDate.getTime()) && positive(vehicle.serviceIntervalMonths)) {
    due = addMonthsUTC(baseDate, Math.round(vehicle.serviceIntervalMonths));
  }
  let dueKm: number | null = positive(last?.nextServiceKm) ? last.nextServiceKm : null;
  if (dueKm === null && typeof baseKm === 'number' && baseKm >= 0 && positive(vehicle.serviceIntervalKm)) {
    dueKm = baseKm + vehicle.serviceIntervalKm;
  }
  const dueDate = due && !Number.isNaN(due.getTime()) ? due.toISOString().slice(0, 10) : null;
  return {
    dueDate,
    dueKm,
    daysLeft: dueDate ? documentDaysUntilExpiry(dueDate, now) : null,
    kmLeft: dueKm !== null && typeof currentOdometer === 'number' && currentOdometer >= 0 ? dueKm - currentOdometer : null,
  };
}

/** The highest odometer any log (or the purchase) recorded, or null. */
export function currentOdometer(logs: { odometer?: number | null }[], purchaseOdometer?: number | null): number | null {
  const all = [...logs.map((l) => l.odometer), purchaseOdometer].filter((o): o is number => typeof o === 'number' && o >= 0);
  return all.length ? Math.max(...all) : null;
}

export type ServiceDueRow = { _id: unknown; name: string; plate?: string } & ServiceScheduleVehicle;
export type ServiceDue = { _id: unknown; name: string; plate: string; next: NextService; key: string };

/**
 * Vehicles whose next service is due within `leadDays` or within SERVICE_KM_LEAD km, or past
 * either. `leadDays <= 0` turns it off, like the dates. `key` names the due point, so the
 * alert retires once a service is logged (a new date / km) instead of nagging forever.
 */
export function collectServiceDue(
  rows: ServiceDueRow[],
  logsByVehicle: Map<string, (ServiceScheduleLog & { kind: string })[]>,
  leadDays: number,
  now: number = Date.now()
): ServiceDue[] {
  if (!(leadDays > 0)) return [];
  const out: ServiceDue[] = [];
  for (const r of rows) {
    const logs = logsByVehicle.get(String(r._id)) ?? [];
    const next = nextService(r, logs.filter((l) => l.kind === 'service'), currentOdometer(logs, r.purchaseOdometer), now);
    const byDate = next.daysLeft !== null && next.daysLeft <= leadDays;
    const byKm = next.kmLeft !== null && next.kmLeft <= SERVICE_KM_LEAD;
    if (!byDate && !byKm) continue;
    out.push({ _id: r._id, name: r.name, plate: r.plate || '', next, key: `${next.dueDate ?? ''}:${next.dueKm ?? ''}` });
  }
  return out.sort((a, b) => urgency(a.next) - urgency(b.next));
}

/** Rough days-equivalent for sorting: km left counted at ~40 km a day. */
function urgency(n: NextService): number {
  const fromKm = n.kmLeft === null ? Infinity : n.kmLeft / 40;
  return Math.min(n.daysLeft ?? Infinity, fromKm);
}

// ─── Costs (#363) ───────────────────────────────────────────────────────────

export type CostLog = { kind: 'fuel' | 'service'; date: string | Date; cost: number; liters?: number; pricePerLiter?: number | null };

/** Price per litre of each fill, oldest first: as printed, else cost ÷ litres. */
export function fuelPriceSeries(logs: CostLog[]): { date: string; price: number }[] {
  return logs
    .filter((l) => l.kind === 'fuel')
    .map((l) => {
      const printed = positive(l.pricePerLiter) ? l.pricePerLiter : null;
      const derived = positive(l.liters) && l.cost > 0 ? l.cost / l.liters : null;
      const price = printed ?? derived;
      return price === null ? null : { date: new Date(l.date).toISOString().slice(0, 10), price: Math.round(price * 1000) / 1000 };
    })
    .filter((x): x is { date: string; price: number } => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Fuel and service spend per calendar month (UTC), oldest first, empty months included. */
export function monthlyCosts(logs: CostLog[]): { month: string; fuel: number; service: number }[] {
  const m = new Map<string, { fuel: number; service: number }>();
  for (const l of logs) {
    if (!(l.cost > 0)) continue;
    const key = new Date(l.date).toISOString().slice(0, 7);
    const row = m.get(key) ?? { fuel: 0, service: 0 };
    row[l.kind] += l.cost;
    m.set(key, row);
  }
  const keys = [...m.keys()].sort();
  if (!keys.length) return [];
  // Every month from the first to the last, so a month with no spend shows as a gap, not as
  // if it never happened (capped at ten years so a stray old date cannot explode the chart).
  const out: { month: string; fuel: number; service: number }[] = [];
  let [y, mo] = keys[0].split('-').map(Number);
  const last = keys[keys.length - 1];
  for (let i = 0; i < 120; i++) {
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    const v = m.get(key) ?? { fuel: 0, service: 0 };
    out.push({ month: key, fuel: round2(v.fuel), service: round2(v.service) });
    if (key >= last) break;
    mo++;
    if (mo > 12) { mo = 1; y++; }
  }
  return out;
}

/** Service spend per calendar year, oldest first. */
export function serviceCostByYear(logs: CostLog[]): { year: string; cost: number }[] {
  const m = new Map<string, number>();
  for (const l of logs) {
    if (l.kind !== 'service' || !(l.cost > 0)) continue;
    const y = new Date(l.date).toISOString().slice(0, 4);
    m.set(y, (m.get(y) ?? 0) + l.cost);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, cost]) => ({ year, cost: round2(cost) }));
}
