import { describe, expect, it } from 'vitest';
import { collectServiceDue, currentOdometer, fuelPriceSeries, monthlyCosts, nextService, serviceCostByYear, SERVICE_KM_LEAD } from './vehicles';

// #363: the service schedule and the cost breakdowns on the vehicle page.
const NOW = Date.parse('2026-07-20T09:00:00Z');
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe('nextService', () => {
  const vehicle = { serviceIntervalKm: 15000, serviceIntervalMonths: 12 };

  it('counts the interval from the latest service, by km and by months', () => {
    const n = nextService(vehicle, [{ date: day('2025-02-01'), odometer: 85000 }, { date: day('2026-02-01'), odometer: 100000 }], 112000, NOW);
    expect(n).toEqual({ dueDate: '2027-02-01', dueKm: 115000, daysLeft: 196, kmLeft: 3000 });
  });

  it('lets a next service printed on the invoice win over the interval', () => {
    const n = nextService(vehicle, [{ date: day('2026-02-01'), odometer: 100000, nextServiceKm: 110000, nextServiceDate: day('2026-12-01') }], 108000, NOW);
    expect(n.dueKm).toBe(110000);
    expect(n.dueDate).toBe('2026-12-01');
    expect(n.kmLeft).toBe(2000);
  });

  it('counts from the purchase before the first service', () => {
    const n = nextService({ ...vehicle, purchaseDate: day('2026-01-31'), purchaseOdometer: 20000 }, [], 21000, NOW);
    expect(n.dueDate).toBe('2027-01-31');
    expect(n.dueKm).toBe(35000);
  });

  it('clamps a month-end service date into a short month', () => {
    const n = nextService({ serviceIntervalMonths: 1 }, [{ date: day('2026-01-31'), odometer: null }], null, NOW);
    expect(n.dueDate).toBe('2026-02-28');
  });

  it('says nothing when no interval and no printed next service is known', () => {
    expect(nextService({}, [{ date: day('2026-02-01'), odometer: 100000 }], 101000, NOW)).toEqual({ dueDate: null, dueKm: null, daysLeft: null, kmLeft: null });
  });

  it('has no km left without a current odometer', () => {
    expect(nextService(vehicle, [{ date: day('2026-02-01'), odometer: 100000 }], null, NOW).kmLeft).toBeNull();
  });
});

describe('currentOdometer', () => {
  it('is the highest reading of any log or the purchase', () => {
    expect(currentOdometer([{ odometer: 1200 }, { odometer: null }, { odometer: 900 }], 500)).toBe(1200);
    expect(currentOdometer([], 500)).toBe(500);
    expect(currentOdometer([{ odometer: null }])).toBeNull();
  });
});

describe('collectServiceDue', () => {
  const rows = [
    { _id: 'v1', name: 'Golf', plate: 'ABC-1234', serviceIntervalKm: 15000, serviceIntervalMonths: 12 },
    { _id: 'v2', name: 'Polo', serviceIntervalKm: 15000, serviceIntervalMonths: 12 },
    { _id: 'v3', name: 'Vespa', serviceIntervalMonths: 6 },
  ];
  const logs = new Map([
    ['v1', [{ kind: 'service', date: day('2026-02-01'), odometer: 100000 }, { kind: 'fuel', date: day('2026-07-15'), odometer: 114600 }]],
    ['v2', [{ kind: 'service', date: day('2026-06-20'), odometer: 50000 }, { kind: 'fuel', date: day('2026-07-15'), odometer: 50900 }]],
    ['v3', [{ kind: 'service', date: day('2026-01-25'), odometer: null }]],
  ]);

  it('fires by km within the km lead, by date within the day lead, and not otherwise', () => {
    const due = collectServiceDue(rows, logs, 30, NOW);
    // Soonest first: 5 days beats 400 km (about 10 days of driving).
    expect(due.map((d) => d.name)).toEqual(['Vespa', 'Golf']);
    expect(due[0]).toMatchObject({ key: '2026-07-25:', next: { daysLeft: 5, kmLeft: null } });
    expect(due[1]).toMatchObject({ plate: 'ABC-1234', key: '2027-02-01:115000', next: { kmLeft: 400 } });
    expect(SERVICE_KM_LEAD).toBe(1000);
  });

  it('keeps nagging once a service is overdue', () => {
    const late = new Map([['v1', [{ kind: 'service', date: day('2025-06-01'), odometer: 90000 }, { kind: 'fuel', date: day('2026-07-15'), odometer: 106000 }]]]);
    const due = collectServiceDue([rows[0]], late, 30, NOW);
    expect(due[0].next).toMatchObject({ daysLeft: -49, kmLeft: -1000 });
  });

  it('is off when the lead time is 0', () => {
    expect(collectServiceDue(rows, logs, 0, NOW)).toEqual([]);
  });
});

describe('costs', () => {
  const logs = [
    { kind: 'fuel' as const, date: '2026-01-10', cost: 70, liters: 40 },
    { kind: 'fuel' as const, date: '2026-01-28', cost: 60, liters: 32.5, pricePerLiter: 1.849 },
    { kind: 'service' as const, date: '2026-02-01', cost: 320 },
    { kind: 'fuel' as const, date: '2026-02-20', cost: 0, liters: 10 },
    { kind: 'service' as const, date: '2025-05-01', cost: 180.5 },
  ];

  it('fuelPriceSeries uses the printed price, else cost ÷ litres, oldest first, skipping unknown ones', () => {
    expect(fuelPriceSeries(logs)).toEqual([
      { date: '2026-01-10', price: 1.75 },
      { date: '2026-01-28', price: 1.849 },
    ]);
  });

  it('monthlyCosts splits fuel and service per month, with the empty months in between', () => {
    const rows = monthlyCosts(logs);
    expect(rows).toHaveLength(10); // May 2025 … Feb 2026
    expect(rows[0]).toEqual({ month: '2025-05', fuel: 0, service: 180.5 });
    expect(rows[1]).toEqual({ month: '2025-06', fuel: 0, service: 0 });
    expect(rows.slice(-2)).toEqual([
      { month: '2026-01', fuel: 130, service: 0 },
      { month: '2026-02', fuel: 0, service: 320 },
    ]);
    expect(monthlyCosts([])).toEqual([]);
  });

  it('serviceCostByYear sums services only', () => {
    expect(serviceCostByYear(logs)).toEqual([
      { year: '2025', cost: 180.5 },
      { year: '2026', cost: 320 },
    ]);
  });
});
