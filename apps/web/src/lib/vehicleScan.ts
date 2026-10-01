// Vehicle scans (#363): a pump receipt, a garage invoice, or a dashboard photo for the odometer.
// Schemas and prompts only (no AI calls, no DB), so tests can pin what a model answer turns into.
// The calls live in vehicleScan.server.ts.
import { z } from 'zod';
import { ENGLISH_OUTPUT_RULE } from './promptRules';
import { VEHICLE_FUEL_TYPES } from './vehicles';

function toNumber(v: unknown, wholeKm: boolean): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null; // "n/a", "unreadable": no value, not 0
  if (wholeKm && /^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, ''); // "115.000" km = 115000
  // "1.234,56" → 1234.56; "1,234.56" → 1234.56; "12,5" → 12.5
  else if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A money / litre figure the model may send as 12.5, "12,50", "1.234,56" or null. */
const amount = z.preprocess((v) => toNumber(v, false), z.number().nonnegative().nullable()).catch(null);

/** A distance in km: a whole number, where "115.000" and "120,600" mean thousands. */
const km = z.preprocess((v) => toNumber(v, true), z.number().nonnegative().nullable()).catch(null);

/** YYYY-MM-DD or ''. A model that writes anything else gets '' rather than a wrong day. */
const isoDay = z
  .string()
  .default('')
  .transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : ''))
  .catch('');

const shortText = (max: number) => z.string().default('').transform((s) => s.trim().slice(0, max)).catch('');

export const FuelScanSchema = z.object({
  date: isoDay,
  station: shortText(100),
  liters: amount,
  pricePerLiter: amount,
  total: amount,
  fuelType: z.enum(VEHICLE_FUEL_TYPES).catch(''),
  odometer: km,
});
export type FuelScan = z.infer<typeof FuelScanSchema>;

export const ServiceScanSchema = z.object({
  date: isoDay,
  garage: shortText(100),
  odometer: km,
  total: amount,
  description: shortText(500),
  items: z
    .array(
      z.object({
        description: shortText(200),
        kind: z.enum(['part', 'labor', 'other']).catch('other'),
        cost: amount.transform((n) => n ?? 0),
      })
    )
    .max(100)
    .catch([]),
  nextServiceKm: km,
  nextServiceDate: isoDay,
});
export type ServiceScan = z.infer<typeof ServiceScanSchema>;

export const OdometerScanSchema = z.object({ odometer: km });
export type OdometerScan = z.infer<typeof OdometerScanSchema>;

export type VehicleScanKind = 'fuel' | 'service' | 'odometer';

const DATE_RULE = 'Dates are DAY-FIRST in most of the world (DD/MM/YYYY, all of Europe), MONTH-FIRST in the US; if the first group is >12 it is the day. Output YYYY-MM-DD.';
const NUMBER_RULE = 'Numbers: a decimal comma or dot ("1.234,56" = 1234.56). Output a dot decimal. Use null when a value is not printed; never guess.';

export const FUEL_SCAN_PROMPT = `${ENGLISH_OUTPUT_RULE}
You read a fuel station receipt (a photo or PDF, in ANY language). Return ONLY JSON, no markdown:
{
  "date": "YYYY-MM-DD of the purchase",
  "station": "the station or brand, e.g. 'Shell', 'BP Kifisias'",
  "liters": <number of litres (or kWh for a charging receipt), or null>,
  "pricePerLiter": <price per litre / kWh, or null>,
  "total": <the total paid, tax included, or null>,
  "fuelType": one of: ${VEHICLE_FUEL_TYPES.filter(Boolean).join(', ')}, or "" when unclear,
  "odometer": <km if the receipt prints it (some fleet cards do), else null>
}
Rules:
- ${DATE_RULE}
- ${NUMBER_RULE}
- fuelType: "unleaded"/"benzine"/"αμόλυβδη"/"super" = petrol; "diesel"/"πετρέλαιο κίνησης" = diesel; "autogas" = lpg; a charging session = electric.`;

export const SERVICE_SCAN_PROMPT = `${ENGLISH_OUTPUT_RULE}
You read a garage / service invoice for a car (a photo or PDF, in ANY language). Return ONLY JSON, no markdown:
{
  "date": "YYYY-MM-DD of the invoice",
  "garage": "the garage or dealer name",
  "odometer": <km printed on the invoice, or null>,
  "total": <the total paid, tax included, or null>,
  "description": "a short summary of the work, e.g. 'Oil and filter change, front brake pads'",
  "items": [ { "description": "one line of the invoice", "kind": "part" | "labor" | "other", "cost": <line total> } ],
  "nextServiceKm": <km of the next service if printed, else null>,
  "nextServiceDate": "YYYY-MM-DD of the next service if printed, else ''"
}
Rules:
- ${DATE_RULE}
- ${NUMBER_RULE}
- items: the invoice lines with their totals; parts (oil, filters, pads, tyres) = "part", work hours / labour = "labor", anything else (disposal fees, diagnostics) = "other". Leave the list empty if there are no lines.`;

export const ODOMETER_SCAN_PROMPT = `You read a photo of a car's dashboard / instrument cluster. Return ONLY JSON, no markdown:
{ "odometer": <the total distance (ODO) in km as a whole number, or null> }
Rules:
- Read the ODO total, not a trip meter (TRIP A/B) and not the range left.
- If the display is in miles, convert to km (× 1.609) and round.
- If you cannot read it clearly, return null.`;
