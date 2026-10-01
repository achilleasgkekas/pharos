'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCanWrite } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { safeDateOrNull } from '@/lib/dates';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { saveFile, deleteFile } from '@/lib/storage';
import { VEHICLE_FUEL_TYPES } from '@/lib/vehicles';
import { LogSchema, parseLogFields } from '@/lib/vehicleForms';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { scanVehicleFile } from '@/lib/vehicleScan.server';
import type { FuelScan, OdometerScan, ServiceScan, VehicleScanKind } from '@/lib/vehicleScan';
import { Vehicle as VehicleModel } from '@/models/Vehicle';
import { VehicleLog as VehicleLogModel } from '@/models/VehicleLog';
import { addExpense } from '@/app/expenses/actions';

type Result = { ok: boolean; id?: string; error?: string };

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const optionalDate = z.string().max(40).default('');
/** '' (not set) or a non-negative number, as a number input sends it. */
const optionalNumber = z.union([z.literal(''), z.coerce.number().finite().min(0)]).default('');
const text = (max: number) => z.string().trim().max(max).default('');
const num = (v: '' | number) => (v === '' ? null : v);

const VehicleSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(100),
  plate: text(30),
  make: text(60),
  model: text(60),
  year: z.union([z.literal(''), z.coerce.number().int().min(1900).max(2100)]).default(''),
  space: text(100),
  notes: z.string().max(2000).default(''),
  motUntil: optionalDate,
  insuranceUntil: optionalDate,
  roadTaxUntil: optionalDate,
  emissionsUntil: optionalDate,
  tyreChangeUntil: optionalDate,
  batteryUntil: optionalDate,
  // #363: more about the car, all optional.
  vin: text(40),
  fuelType: z.enum(VEHICLE_FUEL_TYPES).default(''),
  engineCc: optionalNumber,
  powerKw: optionalNumber,
  transmission: z.enum(['', 'manual', 'automatic']).default(''),
  color: text(40),
  firstRegistration: optionalDate,
  purchaseDate: optionalDate,
  purchasePrice: optionalNumber,
  purchaseSeller: text(100),
  purchaseOdometer: optionalNumber,
  tankCapacity: optionalNumber,
  tyreSize: text(60),
  tyrePressure: text(60),
  oilType: text(60),
  oilCapacity: optionalNumber,
  serviceIntervalKm: optionalNumber,
  serviceIntervalMonths: optionalNumber,
  insurer: text(100),
  policyNumber: text(60),
  coverType: text(60),
  insuranceYearlyCost: optionalNumber,
});

/** The date fields a vehicle form sends; a value that is there but is not a date is refused. */
const VEHICLE_DATE_FIELDS = ['motUntil', 'insuranceUntil', 'roadTaxUntil', 'emissionsUntil', 'tyreChangeUntil', 'batteryUntil', 'firstRegistration', 'purchaseDate'] as const;

function vehicleFields(d: z.output<typeof VehicleSchema>) {
  const dates = Object.fromEntries(VEHICLE_DATE_FIELDS.map((k) => [k, safeDateOrNull(d[k])]));
  return {
    name: d.name,
    plate: d.plate,
    make: d.make,
    model: d.model,
    year: d.year === '' ? null : d.year,
    space: d.space,
    notes: d.notes,
    ...dates,
    vin: d.vin.toUpperCase(),
    fuelType: d.fuelType,
    engineCc: num(d.engineCc),
    powerKw: num(d.powerKw),
    transmission: d.transmission,
    color: d.color,
    purchasePrice: num(d.purchasePrice),
    purchaseSeller: d.purchaseSeller,
    purchaseOdometer: num(d.purchaseOdometer),
    tankCapacity: num(d.tankCapacity),
    tyreSize: d.tyreSize,
    tyrePressure: d.tyrePressure,
    oilType: d.oilType,
    oilCapacity: num(d.oilCapacity),
    serviceIntervalKm: num(d.serviceIntervalKm),
    serviceIntervalMonths: num(d.serviceIntervalMonths),
    insurer: d.insurer,
    policyNumber: d.policyNumber,
    coverType: d.coverType,
    insuranceYearlyCost: num(d.insuranceYearlyCost),
  };
}

function badDate(d: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((k) => typeof d[k] === 'string' && !!(d[k] as string).trim() && safeDateOrNull(d[k]) === null);
}

function revalidateVehicle(id?: string) {
  revalidatePath('/vehicles');
  if (id) revalidatePath(`/vehicles/${id}`);
}

/** Create a vehicle, or update it when the form carries an `id`. */
export async function saveVehicle(formData: FormData): Promise<Result> {
  await assertCanWrite();
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  const parsed = VehicleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid vehicle' };
  if (badDate(parsed.data, VEHICLE_DATE_FIELDS)) return { ok: false, error: 'Enter a valid date' };
  const id = raw.id || '';
  return withRequestTenant(async () => {
    await connectDB();
    const Vehicle = await currentModel(VehicleModel);
    const fields = vehicleFields(parsed.data);
    if (id) {
      const res = await Vehicle.updateOne({ _id: id }, { $set: fields });
      if (res.matchedCount === 0) return { ok: false, error: 'Vehicle not found' };
    } else {
      const doc = await Vehicle.create(fields);
      revalidateVehicle();
      return { ok: true, id: String(doc._id) };
    }
    revalidateVehicle(id);
    return { ok: true, id };
  });
}

/** Sold or scrapped: hidden from the list and from alerts, history kept. */
export async function setVehicleArchived(id: string, archived: boolean): Promise<Result> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Vehicle = await currentModel(VehicleModel);
    await Vehicle.updateOne({ _id: id }, { $set: { archived } });
    revalidateVehicle(id);
    return { ok: true };
  });
}

/** Soft-delete a vehicle and its logs (restorable from the trash like everything else). */
export async function deleteVehicle(id: string): Promise<Result> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const [Vehicle, VehicleLog] = await Promise.all([currentModel(VehicleModel), currentModel(VehicleLogModel)]);
    const now = new Date();
    await Vehicle.updateOne({ _id: id }, { $set: { deletedAt: now } });
    await VehicleLog.updateMany({ vehicleId: id }, { $set: { deletedAt: now } });
    revalidateVehicle(id);
    return { ok: true };
  });
}

// ─── Photo and documents (#363) ─────────────────────────────────────────────

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);
const DOC_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};
const extOf = (f: File) => (f.name.split('.').pop() || '').toLowerCase();

/** Set (or replace) the vehicle's photo. */
export async function setVehiclePhoto(id: string, formData: FormData): Promise<Result & { photoPath?: string }> {
  await assertCanWrite();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No image' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'File too large (max 15MB)' };
  if (!IMAGE_EXTS.has(extOf(file))) return { ok: false, error: 'Unsupported image type' };
  return withRequestTenant(async () => {
    await connectDB();
    const Vehicle = await currentModel(VehicleModel);
    const v = await Vehicle.findById(id).select('photoPath').lean();
    if (!v) return { ok: false, error: 'Vehicle not found' };
    const { relativePath } = await saveFile('equipment', Buffer.from(await file.arrayBuffer()), extOf(file));
    await Vehicle.updateOne({ _id: id }, { $set: { photoPath: relativePath } });
    if (v.photoPath) await deleteFile(v.photoPath).catch(() => undefined);
    revalidateVehicle(id);
    return { ok: true, photoPath: relativePath };
  });
}

/** Add documents: registration certificate, insurance card, inspection report... */
export async function uploadVehicleDocuments(id: string, formData: FormData): Promise<Result & { added?: number }> {
  await assertCanWrite();
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: 'No file selected' };
  return withRequestTenant(async () => {
    await connectDB();
    const Vehicle = await currentModel(VehicleModel);
    if (!(await Vehicle.exists({ _id: id }))) return { ok: false, error: 'Vehicle not found' };
    const docs = [];
    for (const f of files) {
      const ext = extOf(f);
      if (!DOC_MIME[ext] || f.size > MAX_UPLOAD_BYTES) continue;
      const { relativePath } = await saveFile('equipment', Buffer.from(await f.arrayBuffer()), ext);
      docs.push({ path: relativePath, name: f.name.slice(0, 200), mimeType: DOC_MIME[ext], size: f.size, uploadedAt: new Date() });
    }
    if (!docs.length) return { ok: false, error: 'Unsupported file type (PDF or image, max 15MB)' };
    await Vehicle.updateOne({ _id: id }, { $push: { attachments: { $each: docs } } });
    revalidateVehicle(id);
    return { ok: true, added: docs.length };
  });
}

/** Remove one document and its file. */
export async function deleteVehicleDocument(id: string, path: string): Promise<Result> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Vehicle = await currentModel(VehicleModel);
    const res = await Vehicle.updateOne({ _id: id, 'attachments.path': path }, { $pull: { attachments: { path } } });
    if (res.matchedCount === 0) return { ok: false, error: 'Document not found' };
    await deleteFile(path).catch(() => undefined);
    revalidateVehicle(id);
    return { ok: true };
  });
}

// ─── Fuel and service logs ──────────────────────────────────────────────────

/** Keep the scanned receipt / invoice with the entry (a photo or a PDF). */
async function saveLogFile(formData: FormData): Promise<string | { error: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return '';
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'File too large (max 15MB)' };
  const ext = extOf(file);
  if (!DOC_MIME[ext]) return { error: 'Unsupported file type' };
  const { relativePath } = await saveFile('expenses', Buffer.from(await file.arrayBuffer()), ext);
  return relativePath;
}

function formStrings(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

/** Add a fuel fill or a service; optionally log the cost as an expense too. */
export async function addVehicleLog(formData: FormData): Promise<Result> {
  await assertCanWrite();
  const parsed = LogSchema.safeParse(formStrings(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid entry' };
  const d = parsed.data;
  const checked = parseLogFields(d);
  if (!checked.ok) return checked;
  const f = checked.fields as { date: Date; cost: number; liters: number };
  return withRequestTenant(async () => {
    await connectDB();
    const [Vehicle, VehicleLog] = await Promise.all([currentModel(VehicleModel), currentModel(VehicleLogModel)]);
    const vehicle = await Vehicle.findById(d.vehicleId).lean();
    if (!vehicle) return { ok: false, error: 'Vehicle not found' };
    const filePath = await saveLogFile(formData);
    if (typeof filePath !== 'string') return { ok: false, error: filePath.error };
    let expenseId = '';
    if (d.logExpense === 'on' && f.cost > 0) {
      const res = await addExpense({
        kind: 'expense',
        vendor: d.shop || vehicle.name,
        category: d.kind === 'fuel' ? 'fuel' : 'transport',
        space: vehicle.space || '',
        amount: f.cost,
        date: f.date.toISOString(),
        notes: d.kind === 'fuel' ? `${vehicle.name}: ${f.liters} L` : `${vehicle.name}: ${d.description}`,
        verified: true,
      });
      if (res.ok && res.id) expenseId = res.id;
    }
    const doc = await VehicleLog.create({ vehicleId: d.vehicleId, ...checked.fields, filePath, expenseId });
    revalidateVehicle(d.vehicleId);
    if (expenseId) revalidatePath('/expenses');
    return { ok: true, id: String(doc._id) };
  });
}

/**
 * Edit a fuel fill or a service (#363). The kind and the vehicle stay; a linked expense is
 * its own record of money spent and is left as it is. A new file replaces the kept one.
 */
export async function updateVehicleLog(id: string, formData: FormData): Promise<Result> {
  await assertCanWrite();
  const parsed = LogSchema.safeParse(formStrings(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid entry' };
  return withRequestTenant(async () => {
    await connectDB();
    const VehicleLog = await currentModel(VehicleLogModel);
    const existing = await VehicleLog.findById(id).select('vehicleId kind filePath').lean();
    if (!existing) return { ok: false, error: 'Entry not found' };
    const checked = parseLogFields({ ...parsed.data, kind: existing.kind as 'fuel' | 'service' });
    if (!checked.ok) return checked;
    const filePath = await saveLogFile(formData);
    if (typeof filePath !== 'string') return { ok: false, error: filePath.error };
    const { kind: _kind, ...fields } = checked.fields;
    void _kind;
    await VehicleLog.updateOne({ _id: id }, { $set: { ...fields, ...(filePath ? { filePath } : {}) } });
    if (filePath && existing.filePath) await deleteFile(existing.filePath).catch(() => undefined);
    revalidateVehicle(String(existing.vehicleId));
    return { ok: true, id };
  });
}

/** Soft-delete one log. A linked expense stays: it is its own record of money spent. */
export async function deleteVehicleLog(id: string): Promise<Result> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const VehicleLog = await currentModel(VehicleLogModel);
    const log = await VehicleLog.findById(id).select('vehicleId').lean();
    await VehicleLog.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidateVehicle(log ? String(log.vehicleId) : undefined);
    return { ok: true };
  });
}

// ─── Camera scan (#363) ─────────────────────────────────────────────────────

export type VehicleScanResult =
  | { ok: true; kind: 'fuel'; data: FuelScan }
  | { ok: true; kind: 'service'; data: ServiceScan }
  | { ok: true; kind: 'odometer'; data: OdometerScan }
  | { ok: false; error: string };

/**
 * Read a pump receipt, a garage invoice or a dashboard photo into form values WITHOUT saving.
 * The user reviews the prefilled form; the file goes up again with the entry and is kept there.
 */
export async function scanVehicleDocument(kind: VehicleScanKind, formData: FormData): Promise<VehicleScanResult> {
  await assertCanWrite();
  if (!['fuel', 'service', 'odometer'].includes(kind)) return { ok: false, error: 'Unknown scan' };
  if (!(await isFeatureEnabled('vehicles'))) return { ok: false, error: 'Vehicle scanning (AI) is turned off. Turn it on in Settings → AI.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'File too large (max 15MB)' };
  const ext = extOf(file);
  if (!DOC_MIME[ext]) return { ok: false, error: 'Use a photo or a PDF' };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (kind === 'fuel') return { ok: true, kind, data: await scanVehicleFile('fuel', bytes, ext) };
    if (kind === 'service') return { ok: true, kind, data: await scanVehicleFile('service', bytes, ext) };
    return { ok: true, kind: 'odometer', data: await scanVehicleFile('odometer', bytes, ext) };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    return { ok: false, error: /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'AI not reachable (check the AI provider)' : `AI scan failed: ${msg.slice(0, 140)}` };
  }
}
