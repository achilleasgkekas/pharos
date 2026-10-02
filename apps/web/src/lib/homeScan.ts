// Scans for the home papers: a personal document (ID, licence, policy), a utility bill, and a
// photo of a meter. Schemas and prompts only (no AI calls, no DB), so tests can pin what a model
// answer turns into. The calls live in homeScan.server.ts. Nothing here saves: the caller
// prefills a form the user confirms.
import { z } from 'zod';
import { amount, isoDay, shortText, toNumber, DATE_RULE, NUMBER_RULE } from './scanFields';

export type HomeScanKind = 'document' | 'bill' | 'meter';

export const DocumentScanSchema = z.object({
  title: shortText(120),
  type: shortText(60),
  holder: shortText(120),
  number: shortText(80),
  issuedAt: isoDay,
  expiryDate: isoDay,
});
export type DocumentScan = z.infer<typeof DocumentScanSchema>;

export const BillScanSchema = z.object({
  vendor: shortText(100),
  title: shortText(120),
  amount,
  dueDate: isoDay,
  periodFrom: isoDay,
  periodTo: isoDay,
  paymentCode: shortText(80),
  consumption: amount,
  consumptionUnit: z.enum(['kWh', 'm3', 'GB', 'min', '']).catch(''),
  category: z.enum(['electricity', 'water', 'gas', 'phone', 'internet', 'other']).catch('other'),
});
export type BillScan = z.infer<typeof BillScanSchema>;

/** A meter shows a running total: digits only, decimals allowed (a red wheel or after a dot). */
export const MeterScanSchema = z.object({
  value: z.preprocess((v) => toNumber(v, false), z.number().nonnegative().nullable()).catch(null),
  unit: z.enum(['kWh', 'm3', '']).catch(''),
  meterNumber: shortText(60),
});
export type MeterScan = z.infer<typeof MeterScanSchema>;

const KEEP_LANGUAGE =
  'Write names, titles and types in the language printed on the document (do not translate a Greek document into English).';

export const DOCUMENT_SCAN_PROMPT = `You read a personal document (a photo or PDF, in ANY language): an ID card, passport, driving licence, residence permit, vehicle registration, roadworthiness test (KTEO/MOT), insurance policy, warranty or similar. Return ONLY JSON, no markdown:
{
  "title": "a short name for the list, e.g. 'Διαβατήριο', 'Δίπλωμα οδήγησης', 'Ασφάλεια αυτοκινήτου Golf'",
  "type": "the kind of document in one or two words, e.g. 'passport', 'ταυτότητα', 'ασφάλεια'",
  "holder": "the person (or vehicle plate) it belongs to, as printed, or ''",
  "number": "the document / policy number, or ''",
  "issuedAt": "YYYY-MM-DD of issue, or ''",
  "expiryDate": "YYYY-MM-DD it expires / must be renewed, or ''"
}
Rules:
- ${KEEP_LANGUAGE}
- ${DATE_RULE}
- expiryDate is the "valid until" / "λήξη" / "ισχύς έως" date. An insurance policy: the end of the cover. Never invent a date.
- Do not output any other personal data (address, birth date, tax number).`;

export const BILL_SCAN_PROMPT = `You read a household bill (a photo or PDF, in ANY language): electricity, water, gas, phone, internet, common charges and the like. Return ONLY JSON, no markdown:
{
  "vendor": "who issued it, e.g. 'ΔΕΗ', 'ΕΥΔΑΠ', 'Cosmote'",
  "title": "a short name for the list, e.g. 'ΔΕΗ ρεύμα Μαΐου'",
  "amount": <the amount to pay now, tax included, or null>,
  "dueDate": "YYYY-MM-DD the payment is due, or ''",
  "periodFrom": "YYYY-MM-DD the billed period starts, or ''",
  "periodTo": "YYYY-MM-DD the billed period ends, or ''",
  "paymentCode": "the payment code / RF code / reference to pay with, exactly as printed, or ''",
  "consumption": <the consumption in the period, or null>,
  "consumptionUnit": "kWh" | "m3" | "GB" | "min" | "",
  "category": "electricity" | "water" | "gas" | "phone" | "internet" | "other"
}
Rules:
- ${KEEP_LANGUAGE}
- ${DATE_RULE}
- ${NUMBER_RULE}
- amount: the total due for THIS bill ("Ποσό πληρωμής", "Σύνολο πληρωτέο"), not a previous balance on its own.`;

export const METER_SCAN_PROMPT = `You read a photo of a utility meter (electricity, water or gas). Return ONLY JSON, no markdown:
{ "value": <the current reading as a number, or null>, "unit": "kWh" | "m3" | "", "meterNumber": "the meter's serial / number if printed, or ''" }
Rules:
- Read the main register (the running total), not the date, time, tariff code or the serial number.
- Digits on a red background or after a decimal mark are decimals (e.g. 01234 then red 56 = 1234.56).
- A display that cycles through values: use the one labelled as the total (1.8.0 / T1+T2 for electricity).
- If you cannot read it clearly, return null.`;
