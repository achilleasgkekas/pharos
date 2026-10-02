// The AI inbox on Home: drop any file (a receipt photo, a screenshot from a food delivery
// app, a bill PDF, a card statement, a passport scan) and the AI says where it belongs, with
// two or three other places it could go. You pick; the file is then saved by that page's own
// import, so it lands with the record exactly as if you had dropped it there. Pure.
import { z } from 'zod';

export const INBOX_DESTINATIONS = ['receipt', 'expense', 'income', 'bill', 'statement', 'document'] as const;
export type InboxDestination = (typeof INBOX_DESTINATIONS)[number];

/** Where each destination opens once saved. */
export const INBOX_HREF: Record<InboxDestination, string> = {
  receipt: '/receipts',
  expense: '/expenses',
  income: '/income',
  bill: '/expenses/to-pay',
  statement: '/statements',
  document: '/documents',
};

/** A card statement is only ever read from a PDF. */
export function allowedFor(dest: InboxDestination, isPdf: boolean): boolean {
  return dest !== 'statement' || isPdf;
}

export const INBOX_PROMPT = `You sort a household's incoming files. Look at the file and say where it belongs. Return ONLY JSON, no markdown:
{ "destination": "<one of: receipt, expense, income, bill, statement, document>", "alternatives": ["<up to 2 other plausible destinations>"], "title": "<the shop, company or document name>", "amount": <total in the currency shown, or null>, "date": "YYYY-MM-DD or null", "why": "<one short sentence>" }
Destinations:
- receipt: a till receipt from a shop or supermarket with line items.
- expense: proof of something already paid that is not a till receipt: an online order or food delivery confirmation (including app screenshots), an invoice marked paid, a booking, a ticket.
- income: a payslip, a salary or payment received, a refund confirmation.
- bill: something still to pay: a utility bill (electricity, water, gas, phone, internet), a building fee notice, an invoice with a due date and a payment code.
- statement: a credit card statement listing many transactions over a month.
- document: a personal document: ID card, passport, driving licence, insurance policy, vehicle registration, a contract or certificate with an expiry date.
Rules: pick the single best destination; alternatives must differ from it; never invent an amount or a date.`;

export const InboxGuessSchema = z.object({
  destination: z.enum(INBOX_DESTINATIONS).catch('expense'),
  alternatives: z.array(z.string()).catch([]),
  title: z.string().max(120).catch(''),
  amount: z.coerce.number().nonnegative().nullable().catch(null),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  why: z.string().max(240).catch(''),
});
export type InboxGuess = z.infer<typeof InboxGuessSchema> & { alternatives: InboxDestination[] };

/** Fallback order for alternatives when the AI gives fewer than it should. */
const NEXT_BEST: Record<InboxDestination, InboxDestination[]> = {
  receipt: ['expense', 'bill'],
  expense: ['receipt', 'bill'],
  income: ['expense', 'document'],
  bill: ['expense', 'document'],
  statement: ['expense', 'bill'],
  document: ['bill', 'expense'],
};

/** Clean a guess: a valid destination the file can go to, 2-3 distinct alternatives. */
export function normalizeGuess(raw: unknown, isPdf: boolean): InboxGuess {
  const g = InboxGuessSchema.parse(raw ?? {});
  const valid = (d: string): d is InboxDestination => (INBOX_DESTINATIONS as readonly string[]).includes(d) && allowedFor(d as InboxDestination, isPdf);
  const destination: InboxDestination = valid(g.destination) ? g.destination : 'expense';
  const alts: InboxDestination[] = [];
  for (const d of [...g.alternatives.map((a) => String(a).trim().toLowerCase()), ...NEXT_BEST[destination]]) {
    if (valid(d) && d !== destination && !alts.includes(d)) alts.push(d);
    if (alts.length === 3) break;
  }
  return { ...g, destination, alternatives: alts };
}
