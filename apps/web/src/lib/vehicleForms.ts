// Vehicle fuel / service form parsing (#363), shared by add and edit. Pure (no DB), so tests pin it.
import { z } from 'zod';
import { safeDateOrNull } from './dates';
import { VEHICLE_FUEL_TYPES } from './vehicles';

const optionalDate = z.string().max(40).default('');
/** '' (not set) or a non-negative number, as a number input sends it. */
const optionalNumber = z.union([z.literal(''), z.coerce.number().finite().min(0)]).default('');
const text = (max: number) => z.string().trim().max(max).default('');
const num = (v: '' | number) => (v === '' ? null : v);

export type LogFields = {
  kind: 'fuel' | 'service';
  date: Date;
  odometer: number | null;
  cost: number;
  liters: number;
  pricePerLiter: number | null;
  fuelType: string;
  fullTank: boolean;
  description: string;
  shop: string;
  items: { description: string; kind: 'part' | 'labor' | 'other'; cost: number }[];
  nextServiceKm: number | null;
  nextServiceDate: Date | null;
};

export const LogItemSchema = z.object({
  description: z.string().trim().max(200).default(''),
  kind: z.enum(['part', 'labor', 'other']).default('other'),
  cost: z.coerce.number().finite().min(0).default(0),
});

export const LogSchema = z.object({
  vehicleId: z.string().min(1),
  kind: z.enum(['fuel', 'service']),
  date: z.string().min(1, 'Date required'),
  odometer: optionalNumber,
  cost: optionalNumber,
  liters: optionalNumber,
  pricePerLiter: optionalNumber,
  fuelType: z.enum(VEHICLE_FUEL_TYPES).default(''),
  fullTank: z.string().optional(),
  description: text(500),
  shop: text(100),
  // service: invoice lines as JSON (the scan fills them; the form shows and edits them)
  items: z.string().max(20000).default('[]'),
  nextServiceKm: optionalNumber,
  nextServiceDate: optionalDate,
  logExpense: z.string().optional(),
});

export type LogInput = z.output<typeof LogSchema>;

/** Validate a fuel/service form into the fields a log stores, or say what is wrong. */
export function parseLogFields(d: LogInput): { ok: true; fields: LogFields } | { ok: false; error: string } {
  const date = safeDateOrNull(d.date);
  if (!date) return { ok: false, error: 'Enter a valid date' };
  if (d.nextServiceDate.trim() && !safeDateOrNull(d.nextServiceDate)) return { ok: false, error: 'Enter a valid date' };
  const odometer = num(d.odometer);
  const liters = d.liters === '' ? 0 : d.liters;
  const cost = d.cost === '' ? 0 : d.cost;
  // Consumption is measured between odometer readings, so a fill without one is useless.
  if (d.kind === 'fuel' && (odometer === null || !(liters > 0))) return { ok: false, error: 'Odometer and litres are required for a fuel fill' };
  if (d.kind === 'service' && !d.description) return { ok: false, error: 'Describe the service' };
  let items: z.output<typeof LogItemSchema>[] = [];
  try {
    const parsed = z.array(LogItemSchema).max(100).safeParse(JSON.parse(d.items || '[]'));
    if (!parsed.success) return { ok: false, error: 'Invalid invoice lines' };
    items = parsed.data.filter((i) => i.description || i.cost > 0);
  } catch {
    return { ok: false, error: 'Invalid invoice lines' };
  }
  const fuel = d.kind === 'fuel';
  return {
    ok: true,
    fields: {
      kind: d.kind,
      date,
      odometer,
      cost,
      liters: fuel ? liters : 0,
      pricePerLiter: fuel ? num(d.pricePerLiter) : null,
      fuelType: fuel ? d.fuelType : '',
      fullTank: fuel ? d.fullTank === 'on' : true,
      description: d.description,
      shop: d.shop,
      items: fuel ? [] : items,
      nextServiceKm: fuel ? null : num(d.nextServiceKm),
      nextServiceDate: fuel ? null : safeDateOrNull(d.nextServiceDate),
    },
  };
}

