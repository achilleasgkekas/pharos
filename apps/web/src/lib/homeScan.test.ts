import { describe, it, expect } from 'vitest';
import { BillScanSchema, DocumentScanSchema, MeterScanSchema } from './homeScan';

describe('DocumentScanSchema', () => {
  it('keeps clean fields and drops a date that is not YYYY-MM-DD', () => {
    const d = DocumentScanSchema.parse({ title: ' Διαβατήριο ', type: 'passport', holder: 'Α. Παπαδόπουλος', number: 'AB123', issuedAt: '2020-05-01', expiryDate: '01/05/2030' });
    expect(d).toEqual({ title: 'Διαβατήριο', type: 'passport', holder: 'Α. Παπαδόπουλος', number: 'AB123', issuedAt: '2020-05-01', expiryDate: '' });
  });
  it('turns an empty answer into empty fields', () => {
    expect(DocumentScanSchema.parse({})).toEqual({ title: '', type: '', holder: '', number: '', issuedAt: '', expiryDate: '' });
  });
});

describe('BillScanSchema', () => {
  it('reads European amounts and unknown categories safely', () => {
    const b = BillScanSchema.parse({ vendor: 'ΔΕΗ', amount: '1.234,56', consumption: '312', consumptionUnit: 'kWh', category: 'power', dueDate: '2026-11-05' });
    expect(b.amount).toBe(1234.56);
    expect(b.consumption).toBe(312);
    expect(b.category).toBe('other');
    expect(b.dueDate).toBe('2026-11-05');
  });
  it('keeps null for a value that is not printed', () => {
    const b = BillScanSchema.parse({ amount: 'n/a', consumptionUnit: 'litres' });
    expect(b.amount).toBeNull();
    expect(b.consumption).toBeNull();
    expect(b.consumptionUnit).toBe('');
  });
});

describe('MeterScanSchema', () => {
  it('reads a decimal reading', () => {
    expect(MeterScanSchema.parse({ value: '01234,56', unit: 'kWh' })).toEqual({ value: 1234.56, unit: 'kWh', meterNumber: '' });
  });
  it('is null when unreadable', () => {
    expect(MeterScanSchema.parse({ value: 'unreadable' }).value).toBeNull();
  });
});
