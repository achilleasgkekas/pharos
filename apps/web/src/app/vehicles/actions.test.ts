import { beforeEach, describe, expect, it, vi } from 'vitest';

// #363: editing log entries, the new vehicle fields, the kept receipt file and the camera scan.
// Models, storage and the AI are mocked; the form parsing (lib/vehicleForms) is real.
const m = vi.hoisted(() => {
  const lean = <T,>(v: T) => ({ lean: vi.fn(async () => v), select: vi.fn(() => ({ lean: vi.fn(async () => v) })) });
  return {
    lean,
    vehicleFindById: vi.fn((_id: string) => lean<Record<string, unknown> | null>({ _id: 'v1', name: 'Golf', space: '', photoPath: '' })),
    vehicleUpdateOne: vi.fn(async (_f: unknown, _u: unknown) => ({ matchedCount: 1 })),
    vehicleCreate: vi.fn(async (doc: Record<string, unknown>) => ({ _id: 'v-new', ...doc })),
    vehicleExists: vi.fn(async () => true),
    logFindById: vi.fn((_id: string) => lean<Record<string, unknown> | null>({ _id: 'l1', vehicleId: 'v1', kind: 'service', filePath: 'expenses/old.jpg' })),
    logCreate: vi.fn(async (doc: Record<string, unknown>) => ({ _id: 'l-new', ...doc })),
    logUpdateOne: vi.fn(async (_f: unknown, _u: Record<string, any>) => ({ matchedCount: 1 })),
    saveFile: vi.fn(async (bucket: string, _b: Buffer, ext: string) => ({ filePath: `/abs/${bucket}/new.${ext}`, relativePath: `${bucket}/new.${ext}` })),
    deleteFile: vi.fn(async (_p: string) => undefined),
    addExpense: vi.fn(async () => ({ ok: true, id: 'e1' })),
    isFeatureEnabled: vi.fn(async () => true),
    scanVehicleFile: vi.fn(async (_kind: string, _b: Buffer, _ext: string): Promise<Record<string, unknown>> => ({ liters: 32.5, total: 60.09 })),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (model: unknown) => model }));
vi.mock('@/models/Vehicle', () => ({ Vehicle: { findById: m.vehicleFindById, updateOne: m.vehicleUpdateOne, create: m.vehicleCreate, exists: m.vehicleExists, updateMany: vi.fn() } }));
vi.mock('@/models/VehicleLog', () => ({ VehicleLog: { findById: m.logFindById, create: m.logCreate, updateOne: m.logUpdateOne, updateMany: vi.fn() } }));
vi.mock('@/lib/storage', () => ({ saveFile: m.saveFile, deleteFile: m.deleteFile }));
vi.mock('@/app/expenses/actions', () => ({ addExpense: m.addExpense }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: m.isFeatureEnabled }));
vi.mock('@/lib/vehicleScan.server', () => ({ scanVehicleFile: m.scanVehicleFile }));

import { addVehicleLog, saveVehicle, scanVehicleDocument, updateVehicleLog } from './actions';

function fd(fields: Record<string, string>, file?: File) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (file) f.set('file', file);
  return f;
}
const photo = (name = 'receipt.jpg') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

beforeEach(() => vi.clearAllMocks());

describe('updateVehicleLog', () => {
  it('rewrites the entry, keeps its kind, replaces the kept file and never books a second expense', async () => {
    const r = await updateVehicleLog('l1', fd({
      vehicleId: 'v1', kind: 'fuel', date: '2026-02-01', odometer: '100000', cost: '320', description: 'Oil and filters', shop: 'Auto Fix',
      items: JSON.stringify([{ description: 'Oil', kind: 'part', cost: 45.5 }]), nextServiceKm: '115000', nextServiceDate: '2027-02-01', logExpense: 'on',
    }, photo('invoice.pdf')));
    expect(r).toEqual({ ok: true, id: 'l1' });
    const [filter, update] = m.logUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'l1' });
    expect(update.$set).toMatchObject({
      date: new Date('2026-02-01T00:00:00Z'), odometer: 100000, cost: 320, description: 'Oil and filters', shop: 'Auto Fix',
      liters: 0, items: [{ description: 'Oil', kind: 'part', cost: 45.5 }], nextServiceKm: 115000, nextServiceDate: new Date('2027-02-01T00:00:00Z'),
      filePath: 'expenses/new.pdf',
    });
    expect(update.$set.kind).toBeUndefined();
    expect(m.deleteFile).toHaveBeenCalledWith('expenses/old.jpg');
    expect(m.addExpense).not.toHaveBeenCalled();
  });

  it('keeps the old file when no new one is sent', async () => {
    await updateVehicleLog('l1', fd({ vehicleId: 'v1', kind: 'service', date: '2026-02-01', description: 'Brakes' }));
    expect(m.logUpdateOne.mock.calls[0][1].$set.filePath).toBeUndefined();
    expect(m.deleteFile).not.toHaveBeenCalled();
  });

  it('refuses an impossible date or a missing entry without writing', async () => {
    expect(await updateVehicleLog('l1', fd({ vehicleId: 'v1', kind: 'service', date: '31/02/2026', description: 'x' }))).toEqual({ ok: false, error: 'Enter a valid date' });
    m.logFindById.mockReturnValueOnce(m.lean(null));
    expect(await updateVehicleLog('nope', fd({ vehicleId: 'v1', kind: 'service', date: '2026-02-01', description: 'x' }))).toEqual({ ok: false, error: 'Entry not found' });
    expect(m.logUpdateOne).not.toHaveBeenCalled();
  });

  it('still requires odometer and litres when editing a fill', async () => {
    m.logFindById.mockReturnValueOnce(m.lean({ _id: 'l2', vehicleId: 'v1', kind: 'fuel', filePath: '' }));
    const r = await updateVehicleLog('l2', fd({ vehicleId: 'v1', kind: 'fuel', date: '2026-02-01', liters: '40' }));
    expect(r.ok).toBe(false);
    expect(m.logUpdateOne).not.toHaveBeenCalled();
  });
});

describe('addVehicleLog', () => {
  it('stores a scanned fill with its price per litre and fuel type, keeps the photo, and logs the expense', async () => {
    const r = await addVehicleLog(fd({ vehicleId: 'v1', kind: 'fuel', date: '2026-03-14', odometer: '120600', liters: '32.5', pricePerLiter: '1.849', cost: '60.09', fuelType: 'petrol', shop: 'Shell', fullTank: 'on', logExpense: 'on' }, photo()));
    expect(r).toEqual({ ok: true, id: 'l-new' });
    expect(m.saveFile).toHaveBeenCalledWith('expenses', expect.any(Buffer), 'jpg');
    expect(m.logCreate.mock.calls[0][0]).toMatchObject({ vehicleId: 'v1', kind: 'fuel', liters: 32.5, pricePerLiter: 1.849, fuelType: 'petrol', filePath: 'expenses/new.jpg', expenseId: 'e1', items: [] });
    expect(m.addExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 60.09, category: 'fuel', vendor: 'Shell' }));
  });

  it('refuses a file type it cannot keep', async () => {
    const r = await addVehicleLog(fd({ vehicleId: 'v1', kind: 'service', date: '2026-02-01', description: 'x' }, new File(['x'], 'notes.exe')));
    expect(r).toEqual({ ok: false, error: 'Unsupported file type' });
    expect(m.logCreate).not.toHaveBeenCalled();
  });

  it('refuses invoice lines that are not a list', async () => {
    const r = await addVehicleLog(fd({ vehicleId: 'v1', kind: 'service', date: '2026-02-01', description: 'x', items: '{"oops":1}' }));
    expect(r).toEqual({ ok: false, error: 'Invalid invoice lines' });
  });
});

describe('saveVehicle', () => {
  it('stores the new details: identity, purchase, specs, schedule, insurance', async () => {
    const r = await saveVehicle(fd({
      name: 'Golf', vin: 'wvwzzz1kz8w000001', fuelType: 'diesel', engineCc: '1598', powerKw: '85', transmission: 'manual',
      firstRegistration: '2018-05-02', purchaseDate: '2020-01-15', purchasePrice: '14500', purchaseOdometer: '62000',
      tankCapacity: '50', tyreSize: '205/55 R16', oilType: '5W-30', oilCapacity: '4.3', serviceIntervalKm: '15000', serviceIntervalMonths: '12',
      insurer: 'Interamerican', policyNumber: 'P-1', coverType: 'Full', insuranceYearlyCost: '420', batteryUntil: '2027-03-01',
    }));
    expect(r).toEqual({ ok: true, id: 'v-new' });
    expect(m.vehicleCreate.mock.calls[0][0]).toMatchObject({
      vin: 'WVWZZZ1KZ8W000001', fuelType: 'diesel', engineCc: 1598, powerKw: 85, transmission: 'manual',
      firstRegistration: new Date('2018-05-02T00:00:00Z'), purchasePrice: 14500, purchaseOdometer: 62000,
      tankCapacity: 50, oilCapacity: 4.3, serviceIntervalKm: 15000, serviceIntervalMonths: 12, insuranceYearlyCost: 420,
      batteryUntil: new Date('2027-03-01T00:00:00Z'), motUntil: null, color: '',
    });
  });

  it('leaves unset numbers as null and refuses an impossible date', async () => {
    await saveVehicle(fd({ name: 'Polo', engineCc: '', purchasePrice: '' }));
    expect(m.vehicleCreate.mock.calls[0][0]).toMatchObject({ engineCc: null, purchasePrice: null, fuelType: '' });
    expect(await saveVehicle(fd({ name: 'Polo', purchaseDate: '2026-02-31' }))).toEqual({ ok: false, error: 'Enter a valid date' });
    expect(m.vehicleCreate).toHaveBeenCalledTimes(1);
  });
});

describe('scanVehicleDocument', () => {
  it('returns the prefill without saving anything', async () => {
    const r = await scanVehicleDocument('fuel', fd({}, photo()));
    expect(r).toEqual({ ok: true, kind: 'fuel', data: { liters: 32.5, total: 60.09 } });
    expect(m.scanVehicleFile).toHaveBeenCalledWith('fuel', expect.any(Buffer), 'jpg');
    expect(m.logCreate).not.toHaveBeenCalled();
    expect(m.saveFile).not.toHaveBeenCalled();
  });

  it('is off when the vehicles AI switch is off', async () => {
    m.isFeatureEnabled.mockResolvedValueOnce(false);
    const r = await scanVehicleDocument('service', fd({}, photo()));
    expect(r.ok).toBe(false);
    expect(m.scanVehicleFile).not.toHaveBeenCalled();
  });

  it('refuses a missing or unsupported file and an unknown kind', async () => {
    expect((await scanVehicleDocument('fuel', fd({}))).ok).toBe(false);
    expect((await scanVehicleDocument('fuel', fd({}, new File(['x'], 'a.txt')))).ok).toBe(false);
    expect((await scanVehicleDocument('tyres' as never, fd({}, photo()))).ok).toBe(false);
    expect(m.scanVehicleFile).not.toHaveBeenCalled();
  });

  it('reports an AI failure as a message', async () => {
    m.scanVehicleFile.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await scanVehicleDocument('odometer', fd({}, photo()))).toEqual({ ok: false, error: 'AI not reachable (check the AI provider)' });
  });
});
