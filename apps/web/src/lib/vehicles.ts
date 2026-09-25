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
export const VEHICLE_DUE_KINDS = ['motUntil', 'insuranceUntil', 'roadTaxUntil', 'emissionsUntil'] as const;
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
