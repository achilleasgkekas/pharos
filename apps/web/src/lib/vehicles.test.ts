import { describe, expect, it } from 'vitest';
import { collectVehicleDue, vehicleStats, withFuelConsumption } from './vehicles';

const fill = (odometer: number, liters: number, cost: number, fullTank = true) => ({ date: '2026-09-01', odometer, liters, cost, fullTank });

describe('withFuelConsumption (full-to-full)', () => {
  it('computes L/100 km between two full fills', () => {
    const rows = withFuelConsumption([fill(10000, 40, 70), fill(10500, 30, 55)]);
    expect(rows.map((r) => r.consumption)).toEqual([null, 6]);
  });

  it('adds partial fills to the next full fill and gives the partial itself no figure', () => {
    const rows = withFuelConsumption([fill(10000, 40, 70), fill(10200, 10, 18, false), fill(10500, 20, 36)]);
    expect(rows.map((r) => r.consumption)).toEqual([null, null, 6]);
  });

  it('sorts by odometer whatever the input order', () => {
    const rows = withFuelConsumption([fill(10500, 30, 55), fill(10000, 40, 70)]);
    expect(rows.map((r) => r.odometer)).toEqual([10000, 10500]);
    expect(rows[1].consumption).toBe(6);
  });
});

describe('vehicleStats', () => {
  it('averages litres over distance, sums costs and gives cost per km', () => {
    const s = vehicleStats([fill(10000, 40, 70), fill(10500, 30, 55), fill(11000, 35, 60)], [{ cost: 250, odometer: 10800 }]);
    expect(s.avgConsumption).toBe(6.5); // (30 + 35) / 1000 km
    expect(s.fuelCost).toBe(185);
    expect(s.serviceCost).toBe(250);
    expect(s.distance).toBe(1000);
    expect(s.costPerKm).toBe(0.435);
  });

  it('has no consumption or cost per km without enough data', () => {
    const s = vehicleStats([fill(10000, 40, 70)], []);
    expect(s.avgConsumption).toBeNull();
    expect(s.costPerKm).toBeNull();
  });
});

describe('collectVehicleDue', () => {
  const now = Date.UTC(2026, 8, 25);
  const day = (n: number) => new Date(now + n * 86400000).toISOString();
  it('lists dates inside the window and past ones, soonest first, per kind', () => {
    const due = collectVehicleDue(
      [{ _id: 'v1', name: 'Golf', plate: 'ΙΚΑ-1234', motUntil: day(10), insuranceUntil: day(-3), roadTaxUntil: day(90), emissionsUntil: null }],
      30,
      now
    );
    expect(due.map((d) => [d.kind, d.days])).toEqual([['insuranceUntil', -3], ['motUntil', 10]]);
    expect(due[0].plate).toBe('ΙΚΑ-1234');
  });

  it('is off with a zero window', () => {
    expect(collectVehicleDue([{ _id: 'v1', name: 'Golf', motUntil: day(1) }], 0, now)).toEqual([]);
  });
});
