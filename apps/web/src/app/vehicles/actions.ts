'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCanWrite } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { safeDateOrNull } from '@/lib/dates';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { Vehicle as VehicleModel } from '@/models/Vehicle';
import { VehicleLog as VehicleLogModel } from '@/models/VehicleLog';
import { addExpense } from '@/app/expenses/actions';

type Result = { ok: boolean; id?: string; error?: string };

const optionalDate = z.string().max(40).default('');

const VehicleSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(100),
  plate: z.string().trim().max(30).default(''),
  make: z.string().trim().max(60).default(''),
  model: z.string().trim().max(60).default(''),
  year: z.union([z.literal(''), z.coerce.number().int().min(1900).max(2100)]).default(''),
  space: z.string().trim().max(100).default(''),
  notes: z.string().max(2000).default(''),
  motUntil: optionalDate,
  insuranceUntil: optionalDate,
  roadTaxUntil: optionalDate,
  emissionsUntil: optionalDate,
});

function vehicleFields(d: z.output<typeof VehicleSchema>) {
  return {
    name: d.name,
    plate: d.plate,
    make: d.make,
    model: d.model,
    year: d.year === '' ? null : d.year,
    space: d.space,
    notes: d.notes,
    motUntil: safeDateOrNull(d.motUntil),
    insuranceUntil: safeDateOrNull(d.insuranceUntil),
    roadTaxUntil: safeDateOrNull(d.roadTaxUntil),
    emissionsUntil: safeDateOrNull(d.emissionsUntil),
  };
}

/** Create a vehicle, or update it when the form carries an `id`. */
export async function saveVehicle(formData: FormData): Promise<Result> {
  await assertCanWrite();
  const raw = Object.fromEntries(formData);
  const parsed = VehicleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid vehicle' };
  const id = typeof raw.id === 'string' ? raw.id : '';
  return withRequestTenant(async () => {
    await connectDB();
    const Vehicle = await currentModel(VehicleModel);
    const fields = vehicleFields(parsed.data);
    if (id) {
      const res = await Vehicle.updateOne({ _id: id }, { $set: fields });
      if (res.matchedCount === 0) return { ok: false, error: 'Vehicle not found' };
    } else {
      const doc = await Vehicle.create(fields);
      revalidatePath('/vehicles');
      return { ok: true, id: String(doc._id) };
    }
    revalidatePath('/vehicles');
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
    revalidatePath('/vehicles');
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
    revalidatePath('/vehicles');
    return { ok: true };
  });
}

const LogSchema = z.object({
  vehicleId: z.string().min(1),
  kind: z.enum(['fuel', 'service']),
  date: z.string().min(1, 'Date required'),
  odometer: z.union([z.literal(''), z.coerce.number().finite().min(0)]).default(''),
  cost: z.union([z.literal(''), z.coerce.number().finite().min(0)]).default(''),
  liters: z.union([z.literal(''), z.coerce.number().finite().min(0)]).default(''),
  fullTank: z.string().optional(),
  description: z.string().trim().max(500).default(''),
  shop: z.string().trim().max(100).default(''),
  logExpense: z.string().optional(),
});

/** Add a fuel fill or a service; optionally log the cost as an expense too. */
export async function addVehicleLog(formData: FormData): Promise<Result> {
  await assertCanWrite();
  const parsed = LogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid entry' };
  const d = parsed.data;
  const date = safeDateOrNull(d.date);
  if (!date) return { ok: false, error: 'Invalid date' };
  const odometer = d.odometer === '' ? null : d.odometer;
  const liters = d.liters === '' ? 0 : d.liters;
  const cost = d.cost === '' ? 0 : d.cost;
  // Consumption is measured between odometer readings, so a fill without one is useless.
  if (d.kind === 'fuel' && (odometer === null || !(liters > 0))) return { ok: false, error: 'Odometer and litres are required for a fuel fill' };
  if (d.kind === 'service' && !d.description) return { ok: false, error: 'Describe the service' };
  return withRequestTenant(async () => {
    await connectDB();
    const [Vehicle, VehicleLog] = await Promise.all([currentModel(VehicleModel), currentModel(VehicleLogModel)]);
    const vehicle = await Vehicle.findById(d.vehicleId).lean();
    if (!vehicle) return { ok: false, error: 'Vehicle not found' };
    let expenseId = '';
    if (d.logExpense === 'on' && cost > 0) {
      const res = await addExpense({
        kind: 'expense',
        vendor: d.shop || vehicle.name,
        category: d.kind === 'fuel' ? 'fuel' : 'transport',
        space: vehicle.space || '',
        amount: cost,
        date: date.toISOString(),
        notes: d.kind === 'fuel' ? `${vehicle.name}: ${liters} L` : `${vehicle.name}: ${d.description}`,
        verified: true,
      });
      if (res.ok && res.id) expenseId = res.id;
    }
    const doc = await VehicleLog.create({
      vehicleId: d.vehicleId,
      kind: d.kind,
      date,
      odometer,
      cost,
      liters: d.kind === 'fuel' ? liters : 0,
      fullTank: d.kind === 'fuel' ? d.fullTank === 'on' : true,
      description: d.description,
      shop: d.shop,
      expenseId,
    });
    revalidatePath('/vehicles');
    if (expenseId) revalidatePath('/expenses');
    return { ok: true, id: String(doc._id) };
  });
}

/** Soft-delete one log. A linked expense stays: it is its own record of money spent. */
export async function deleteVehicleLog(id: string): Promise<Result> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const VehicleLog = await currentModel(VehicleLogModel);
    await VehicleLog.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/vehicles');
    return { ok: true };
  });
}
