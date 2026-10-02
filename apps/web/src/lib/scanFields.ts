// Field parsers and wording shared by the document scans (vehicles, documents, bills, meters).
// A model may write 12.5, "12,50", "1.234,56" or "n/a"; these turn that into a number or null,
// and anything that is not a clean YYYY-MM-DD into '', rather than a wrong value.
import { z } from 'zod';

export function toNumber(v: unknown, wholeKm: boolean): number | null {
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
export const amount = z.preprocess((v) => toNumber(v, false), z.number().nonnegative().nullable()).catch(null);

/** A distance in km: a whole number, where "115.000" and "120,600" mean thousands. */
export const km = z.preprocess((v) => toNumber(v, true), z.number().nonnegative().nullable()).catch(null);

/** YYYY-MM-DD or ''. A model that writes anything else gets '' rather than a wrong day. */
export const isoDay = z
  .string()
  .default('')
  .transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : ''))
  .catch('');

export const shortText = (max: number) => z.string().default('').transform((s) => s.trim().slice(0, max)).catch('');


export const DATE_RULE = 'Dates are DAY-FIRST in most of the world (DD/MM/YYYY, all of Europe), MONTH-FIRST in the US; if the first group is >12 it is the day. Output YYYY-MM-DD.';
export const NUMBER_RULE = 'Numbers: a decimal comma or dot ("1.234,56" = 1234.56). Output a dot decimal. Use null when a value is not printed; never guess.';
