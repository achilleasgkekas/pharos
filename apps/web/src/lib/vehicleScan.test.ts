import { beforeEach, describe, expect, it, vi } from 'vitest';

// #363: what a model's answer to a pump receipt / garage invoice / dashboard photo turns into.
// The AI calls are mocked; the schemas, the PDF routing and the feature tag are real.
const { runVisionJSON, runTextJSON, extractPdfText, looksLikeScannedPdf, pdfFirstPageJpeg } = vi.hoisted(() => ({
  runVisionJSON: vi.fn(),
  runTextJSON: vi.fn(),
  extractPdfText: vi.fn(async () => 'INVOICE text'),
  looksLikeScannedPdf: vi.fn(() => false),
  pdfFirstPageJpeg: vi.fn(async () => Buffer.from('jpeg')),
}));
vi.mock('./ollama', () => ({ runVisionJSON, runTextJSON }));
vi.mock('./pdf', () => ({ extractPdfText, looksLikeScannedPdf }));
vi.mock('./pdfThumb', () => ({ pdfFirstPageJpeg }));
vi.mock('./prompts', () => ({ getPromptOverride: vi.fn(async () => null) }));

import { FuelScanSchema, ServiceScanSchema, OdometerScanSchema } from './vehicleScan';
import { scanVehicleFile } from './vehicleScan.server';

beforeEach(() => vi.clearAllMocks());

describe('FuelScanSchema', () => {
  it('reads a clean answer', () => {
    expect(FuelScanSchema.parse({ date: '2026-03-14', station: 'Shell', liters: 32.5, pricePerLiter: 1.849, total: 60.09, fuelType: 'petrol', odometer: null })).toEqual({
      date: '2026-03-14', station: 'Shell', liters: 32.5, pricePerLiter: 1.849, total: 60.09, fuelType: 'petrol', odometer: null,
    });
  });

  it('accepts comma decimals and thousands separators, as receipts print them', () => {
    const r = FuelScanSchema.parse({ liters: '32,50', pricePerLiter: '1,849 €/L', total: '1.234,56', odometer: '120,600' });
    expect(r.liters).toBe(32.5);
    expect(r.pricePerLiter).toBe(1.849);
    expect(r.total).toBe(1234.56);
    expect(r.odometer).toBe(120600); // a distance: the comma groups thousands
  });

  it('turns anything it cannot trust into empty values instead of guesses', () => {
    expect(FuelScanSchema.parse({ date: '14/03/2026', liters: 'n/a', total: -5, fuelType: 'unleaded 95', station: 7 })).toEqual({
      date: '', station: '', liters: null, pricePerLiter: null, total: null, fuelType: '', odometer: null,
    });
    expect(FuelScanSchema.parse({})).toMatchObject({ date: '', liters: null, fuelType: '' });
  });
});

describe('ServiceScanSchema', () => {
  it('reads the invoice lines and the next service', () => {
    const r = ServiceScanSchema.parse({
      date: '2026-02-01', garage: 'Auto Fix', odometer: 100000, total: '320,00', description: 'Oil and filters',
      items: [{ description: 'Oil 5W-30', kind: 'part', cost: '45,50' }, { description: 'Labour', kind: 'labour', cost: 80 }, { description: 'Disposal', cost: null }],
      nextServiceKm: '115.000', nextServiceDate: '2027-02-01',
    });
    expect(r.total).toBe(320);
    expect(r.items).toEqual([
      { description: 'Oil 5W-30', kind: 'part', cost: 45.5 },
      { description: 'Labour', kind: 'other', cost: 80 },
      { description: 'Disposal', kind: 'other', cost: 0 },
    ]);
    expect(r.nextServiceKm).toBe(115000);
    expect(r.nextServiceDate).toBe('2027-02-01');
  });

  it('drops a broken items list rather than failing the scan', () => {
    expect(ServiceScanSchema.parse({ items: 'oil, filters' }).items).toEqual([]);
  });
});

describe('OdometerScanSchema', () => {
  it('reads a number or nothing', () => {
    expect(OdometerScanSchema.parse({ odometer: 120600 }).odometer).toBe(120600);
    expect(OdometerScanSchema.parse({ odometer: 'unreadable' }).odometer).toBeNull();
  });
});

describe('scanVehicleFile', () => {
  it('sends a photo to the vision model, tagged as the vehicles feature', async () => {
    runVisionJSON.mockResolvedValue({ json: { liters: 40, total: 70 }, raw: '', model: 'm' });
    const r = await scanVehicleFile('fuel', Buffer.from('img'), 'jpg');
    expect(r).toMatchObject({ liters: 40, total: 70 });
    expect(runVisionJSON.mock.calls[0][3]).toMatchObject({ feature: 'vehicles', trigger: 'user' });
    expect(runTextJSON).not.toHaveBeenCalled();
  });

  it('reads a PDF with a text layer as text, without the vision model', async () => {
    runTextJSON.mockResolvedValue({ json: { garage: 'Auto Fix', total: 320 }, raw: '', model: 'm' });
    const r = await scanVehicleFile('service', Buffer.from('%PDF'), 'pdf');
    expect(r).toMatchObject({ garage: 'Auto Fix', total: 320, items: [] });
    expect(runTextJSON.mock.calls[0][1]).toContain('INVOICE text');
    expect(runVisionJSON).not.toHaveBeenCalled();
  });

  it('rasterizes a scanned PDF and reads the page as a photo', async () => {
    looksLikeScannedPdf.mockReturnValueOnce(true);
    runVisionJSON.mockResolvedValue({ json: { odometer: 98765 }, raw: '', model: 'm' });
    const r = await scanVehicleFile('odometer', Buffer.from('%PDF'), 'pdf');
    expect(r.odometer).toBe(98765);
    expect(pdfFirstPageJpeg).toHaveBeenCalled();
    expect(runVisionJSON.mock.calls[0][2]).toEqual([Buffer.from('jpeg').toString('base64')]);
  });
});
