'use server';
import { connectDB } from '@/lib/db';
import { Bill as BillModel } from '@/models/Bill';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { nextBillDue } from '@/lib/bill';
import { safeDateOrNull } from '@/lib/dates';
import { addExpense } from '@/app/expenses/actions';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx } from '@/lib/fx';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';

// P28 — CRUD + lifecycle (mark paid / unpaid) for bills / payables. Deterministic,
// no AI. Status (paid/overdue/due-soon) is derived on read, never stored.

const CYCLES = ['', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

const BillFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  vendor: z.string().default(''),
  // P9: read as the PRINTED figure. resolveFx() converts it to base currency below.
  amount: z.coerce.number().min(0).default(0),
  currency: z.string().default('EUR'),
  // Base units per 1 unit of `currency`; 0/absent = single-currency form (or rate still unknown).
  fxRate: z.coerce.number().min(0).default(0),
  dueDate: z.string().min(1, 'Due date required'),
  category: z.string().default('other'),
  cycle: z.enum(CYCLES).default(''),
  notes: z.string().default(''),
});

/**
 * P9 for Bills. A bill has ONE money field, so this is the plain `resolveFx` case: the form
 * hands over what the paper prints, and what gets stored in `amount` is always base currency
 * (an unknown rate is never guessed as 1:1 — see lib/fx.ts). A single-currency deployment
 * passes straight through with origAmount/fxRate 0, exactly as before this existed.
 */
async function resolveBillFx(raw: { amount: number; currency: string; fxRate: number }) {
  const fx = resolveFx({ amount: raw.amount, currency: raw.currency, fxRate: raw.fxRate }, (await getAppSettings()).currency);
  return { amount: fx.amount, currency: fx.currency, origAmount: fx.origAmount, fxRate: fx.fxRate };
}

/** The printed figure behind a stored bill: what a person reads off the paper. */
function printedAmount(bill: { amount?: number | null; origAmount?: number | null }): number {
  return (Number(bill.origAmount) || 0) > 0 ? Number(bill.origAmount) : Number(bill.amount) || 0;
}

export async function createBill(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const parsed = BillFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  const raw = parsed.data;
  const due = safeDateOrNull(raw.dueDate);
  if (!due) return { ok: false, error: 'Invalid due date' };
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    await Bill.create({ ...raw, ...(await resolveBillFx(raw)), dueDate: due, paidAt: null, archived: false });
    revalidatePath('/bills');
    return { ok: true };
  });
}

export async function updateBill(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const parsed = BillFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  const raw = parsed.data;
  const due = safeDateOrNull(raw.dueDate);
  if (!due) return { ok: false, error: 'Invalid due date' };
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    // The form always shows the PRINTED amount (see BillsClient), so re-saving an unchanged
    // foreign bill re-resolves to the same stored figure instead of converting it twice.
    await Bill.findByIdAndUpdate(id, { ...raw, ...(await resolveBillFx(raw)), dueDate: due });
    revalidatePath('/bills');
    return { ok: true };
  });
}

export async function setBillArchived(id: string, archived: boolean): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    await Bill.findByIdAndUpdate(id, { archived });
    revalidatePath('/bills');
    return { ok: true };
  });
}

export async function deleteBill(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
    await Bill.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/bills');
    return { ok: true };
  });
}

/**
 * Mark a bill paid. Optionally logs a matching expense (opt-in), and — for a
 * recurring bill (cycle set) — spawns the NEXT pending instance one cycle ahead,
 * so the series keeps rolling without a background generator. Idempotent on the
 * recurring spawn: it only creates the next instance the first time this bill is
 * paid (guarded by paidAt), never on a re-mark.
 */
export async function markBillPaid(
  id: string,
  opts?: { logExpense?: boolean; paidDate?: string }
): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
  await connectDB();
  const Bill = await currentModel(BillModel);
  const bill = await Bill.findById(id).lean();
  if (!bill) return { ok: false, error: 'Bill not found' };
  const wasPaid = !!bill.paidAt;
  const paidAt = safeDateOrNull(opts?.paidDate || '') ?? new Date();

  let linkedExpenseId = bill.linkedExpenseId || '';
  if (opts?.logExpense && !wasPaid && !linkedExpenseId && (bill.amount ?? 0) > 0) {
    // addExpense opens its OWN withRequestTenant, which re-resolves to the same context we are
    // already inside (the wrapper is re-entrant and host-derived), so the logged expense lands
    // in the same tenant DB as the bill. Nothing extra needs threading through.
    const res = await addExpense({
      kind: 'expense',
      vendor: bill.vendor || bill.title,
      category: bill.category || 'other',
      // P9: addExpense runs its OWN resolveFx, so it must be handed the PRINTED figure plus
      // the bill's currency + rate. Passing the already-converted `bill.amount` here would
      // convert it a second time and log a foreign bill at rate².
      amount: printedAmount(bill),
      currency: bill.currency || undefined,
      fxRate: bill.fxRate || 0,
      date: paidAt.toISOString(),
      notes: `Bill: ${bill.title}`,
      verified: true,
    });
    if (res.ok && res.id) linkedExpenseId = res.id;
  }

  await Bill.findByIdAndUpdate(id, { paidAt, linkedExpenseId });

  // Roll the recurring series forward exactly once (on the first payment).
  if (!wasPaid && bill.cycle && bill.dueDate) {
    await Bill.create({
      title: bill.title,
      vendor: bill.vendor,
      amount: bill.amount,
      // P9: the next instance inherits the currency AND the last known rate, deliberately.
      // The spawned bill is a projection of a charge that has not arrived yet, so carrying
      // the rate keeps `amount` base-denominated (an estimate the totals can sum) instead of
      // dropping a rate-less foreign row into every "needs an exchange rate" audit each cycle.
      // The user corrects both figures when the real bill lands.
      currency: bill.currency,
      origAmount: bill.origAmount,
      fxRate: bill.fxRate,
      dueDate: nextBillDue(bill.dueDate, bill.cycle),
      paidAt: null,
      category: bill.category,
      cycle: bill.cycle,
      notes: bill.notes,
      archived: false,
    });
  }

  revalidatePath('/bills');
  return { ok: true };
  });
}

/** Undo a payment (does not touch any expense that was logged). */
export async function markBillUnpaid(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    await Bill.findByIdAndUpdate(id, { paidAt: null });
    revalidatePath('/bills');
    return { ok: true };
  });
}
