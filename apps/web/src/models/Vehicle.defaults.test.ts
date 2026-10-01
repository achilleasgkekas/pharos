import { describe, expect, it } from 'vitest';
import { Vehicle } from './Vehicle';
import { VehicleLog } from './VehicleLog';

// #363: every new field is optional with an empty default, so a vehicle or a log saved before
// these fields existed reads back the same and needs no migration.
describe('Vehicle defaults', () => {
  it('fills the new fields with empty values', () => {
    const v = new Vehicle({ name: 'Golf' }).toObject() as Record<string, unknown>;
    expect(v).toMatchObject({
      name: 'Golf',
      photoPath: '',
      vin: '',
      fuelType: '',
      engineCc: null,
      powerKw: null,
      transmission: '',
      firstRegistration: null,
      purchaseDate: null,
      purchasePrice: null,
      purchaseOdometer: null,
      tankCapacity: null,
      serviceIntervalKm: null,
      serviceIntervalMonths: null,
      insurer: '',
      insuranceYearlyCost: null,
      tyreChangeUntil: null,
      batteryUntil: null,
      attachments: [],
    });
    expect(new Vehicle({ name: 'Golf' }).validateSync()).toBeUndefined();
  });

  it('refuses an unknown fuel type or a negative number', () => {
    const bad = new Vehicle({ name: 'Golf', fuelType: 'steam', serviceIntervalKm: -1 }).validateSync();
    expect(Object.keys(bad?.errors ?? {}).sort()).toEqual(['fuelType', 'serviceIntervalKm']);
  });
});

describe('VehicleLog defaults', () => {
  it('fills the new fields with empty values', () => {
    const l = new VehicleLog({ vehicleId: '64b000000000000000000001', kind: 'service', date: new Date('2026-02-01') }).toObject() as Record<string, unknown>;
    expect(l).toMatchObject({ pricePerLiter: null, fuelType: '', filePath: '', items: [], nextServiceKm: null, nextServiceDate: null });
  });

  it('refuses an unknown invoice line kind', () => {
    const bad = new VehicleLog({ vehicleId: '64b000000000000000000001', kind: 'service', date: new Date(), items: [{ description: 'x', kind: 'gift', cost: 1 }] }).validateSync();
    expect(Object.keys(bad?.errors ?? {})).toContain('items.0.kind');
  });
});
