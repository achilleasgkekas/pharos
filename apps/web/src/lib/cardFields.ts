import type { Body } from '@/lib/apiBody';

/** Payment-card field validation shared by POST /api/v1/cards and PATCH /api/v1/cards/:id.
 *
 *  Both routes coerce the same body shape into a `$set` object with identical guards.
 *  `partial` controls whether `name` is required (create) or optional (update); every
 *  other field is "set only if present and valid", so the semantics match a partial
 *  update. Behaviour is byte-identical to the two inline copies this replaces. */

const KINDS = ['credit', 'debit'];
const TYPES = ['mastercard', 'visa', 'amex', 'maestro', 'other'];

/** Build a validated card `$set` from a JSON body. Returns `null` when `name` is
 *  missing on create (`partial === false`); an empty object is possible on update. */
export function cardFieldsFromBody(b: Body, partial: boolean): Record<string, unknown> | null {
  const set: Record<string, unknown> = {};
  if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.trim();
  else if (!partial) return null; // name required on create
  if (typeof b.last4 === 'string') set.last4 = b.last4.replace(/\D/g, '').slice(0, 4);
  if (typeof b.bank === 'string') set.bank = b.bank.trim();
  if (typeof b.kind === 'string' && KINDS.includes(b.kind)) set.kind = b.kind;
  if (typeof b.type === 'string' && TYPES.includes(b.type)) set.type = b.type;
  if (typeof b.color === 'string' && b.color.trim()) set.color = b.color.trim();
  if (b.creditLimit != null && Number.isFinite(Number(b.creditLimit))) set.creditLimit = Math.max(0, Number(b.creditLimit));
  if (typeof b.notes === 'string') set.notes = b.notes.trim();
  if (typeof b.active === 'boolean') set.active = b.active;
  return set;
}
