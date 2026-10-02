// Vehicle scans (#363): a pump receipt, a garage invoice, or a dashboard photo for the odometer.
// Schemas and prompts only (no AI calls, no DB), so tests can pin what a model answer turns into.
// The calls live in vehicleScan.server.ts.
import { z } from 'zod';
import { ENGLISH_OUTPUT_RULE } from './promptRules';
import { VEHICLE_FUEL_TYPES } from './vehicles';

import { amount, isoDay, km, shortText, DATE_RULE, NUMBER_RULE } from './scanFields';

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
