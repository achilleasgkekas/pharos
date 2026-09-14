'use server';
import { connectDB } from '@/lib/db';
import { RECURRING_CYCLE_VALUES } from '@/lib/billingCycle';
import { Bill as BillModel } from '@/models/Bill';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { billIsSettledByPayments, billPaidAmount, billRemaining } from '@/lib/bill';
import { safeDateOrNull } from '@/lib/dates';
import { spawnNextBillOnce } from '@/lib/billRecurrence';
import { addExpense } from '@/app/expenses/actions';
import { getAppSettings } from '@/lib/appSettings';
import { resolveFx } from '@/lib/fx';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';

// P28 — CRUD + lifecycle (mark paid / unpaid) for bills / payables. Deterministic,
// no AI. Status (paid/overdue/due-soon) is derived on read, never stored.

const CYCLES = RECURRING_CYCLE_VALUES;

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

  // Roll the recurring series forward exactly once. `wasPaid` alone is not enough: Undo
  // clears paidAt, so the helper also refuses when this bill already has a successor (#33).
  // It runs BEFORE the expense and the paidAt write on purpose: the spawn is idempotent, so a
  // failure further down is safely retried, whereas a bill persisted as paid first would never
  // get another chance to spawn (see lib/billRecurrence.ts).
  if (!wasPaid) await spawnNextBillOnce(Bill, bill);

  // P61: when instalments were already logged, "mark paid" settles what is LEFT, so an
  // opt-in expense books the remaining balance rather than the full amount a second time.
  // Such a bill is base-denominated by definition (see logBillPayment), hence no fx here.
  const partlyPaid = billPaidAmount(bill.payments) > 0;
  const owed = billRemaining(bill.amount, bill.payments, null);

  let linkedExpenseId = bill.linkedExpenseId || '';
  if (opts?.logExpense && !wasPaid && !linkedExpenseId && partlyPaid && owed > 0) {
    const res = await addExpense({
      kind: 'expense',
      vendor: bill.vendor || bill.title,
      category: bill.category || 'other',
      amount: owed,
      date: paidAt.toISOString(),
      notes: `Bill: ${bill.title} (final payment)`,
      verified: true,
    });
    if (res.ok && res.id) linkedExpenseId = res.id;
  } else if (opts?.logExpense && !wasPaid && !linkedExpenseId && (bill.amount ?? 0) > 0) {
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

  revalidatePath('/bills');
  return { ok: true };
  });
}

/** Undo a payment. Leaves any logged expense alone, and leaves P61 instalments in
 *  place: undoing a settled bill returns it to partially-paid, not to zero. */
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

// ---------------------------------------------------------------------------
// P61 — partial payments. "Mark paid" above stays the one-click action for an
// ordinary bill (a bill with no instalments behaves exactly as it did before this
// existed); logging a partial payment is a SECOND action beside it, not a
// replacement. The bill settles itself the moment the instalments cover `amount`,
// so there is never a second manual step to remember.
// ---------------------------------------------------------------------------

const PaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  date: z.string().default(''),
  note: z.string().default(''),
  logExpense: z.boolean().default(false),
});

/**
 * Log one instalment toward a bill. `amount` is in the deployment's BASE currency
 * (the same denomination as the stored `Bill.amount`), which is what makes the
 * remaining balance plain subtraction even for a foreign-currency bill.
 *
 * When the instalments reach the bill's amount, the bill is settled right here:
 * paidAt is stamped with THIS payment's date, and a recurring bill spawns its next
 * instance through the same markBillPaid path, so the series keeps rolling exactly
 * as it does for a one-click payment. The opt-in expense is logged PER payment
 * (that is the point: each hand-over is its own outgoing), so the settling call
 * deliberately passes logExpense:false and never double-books the final instalment.
 */
export async function logBillPayment(
  id: string,
  data: { amount: number; date?: string; note?: string; logExpense?: boolean }
): Promise<{ ok: boolean; error?: string; settled?: boolean }> {
  await assertCanWrite();
  const parsed = PaymentSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid payment' };
  const p = parsed.data;

  const settleWith = await withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    const bill = await Bill.findById(id).lean();
    if (!bill) return { ok: false as const, error: 'Bill not found' };
    if (bill.paidAt) return { ok: false as const, error: 'Bill is already paid' };

    const paidOn = safeDateOrNull(p.date) ?? new Date();

    let expenseId = '';
    if (p.logExpense) {
      // Instalments are stored base-denominated, so this is the plain single-currency
      // case: no currency/fxRate is handed over, and addExpense's own resolveFx passes
      // it straight through. Passing the bill's rate here would convert an already
      // converted figure a second time.
      const res = await addExpense({
        kind: 'expense',
        vendor: bill.vendor || bill.title,
        category: bill.category || 'other',
        amount: p.amount,
        date: paidOn.toISOString(),
        notes: `Bill: ${bill.title}${p.note ? ` (${p.note})` : ''}`,
        verified: true,
      });
      if (res.ok && res.id) expenseId = res.id;
    }

    await Bill.updateOne(
      { _id: id },
      { $push: { payments: { amount: p.amount, date: paidOn, note: p.note, expenseId } } }
    );

    const after = await Bill.findById(id).lean();
    const settled = !!after && billIsSettledByPayments(after.amount, after.payments);
    revalidatePath('/bills');
    return { ok: true as const, settled, paidOn: settled ? paidOn.toISOString() : '' };
  });

  if (!settleWith.ok) return settleWith;
  // Reuse the one-click path for the settling half (recurring spawn + paidAt stamp).
  // logExpense:false — this payment already logged its own, if it was asked to.
  if (settleWith.settled) await markBillPaid(id, { logExpense: false, paidDate: settleWith.paidOn });
  return { ok: true, settled: settleWith.settled };
}

/**
 * Remove a logged instalment (a typo, or one entered twice). Any expense it logged is
 * left alone, exactly like markBillUnpaid: deleting money records as a side effect of
 * an edit elsewhere is the kind of thing you cannot undo. If dropping it means the
 * instalments no longer cover the bill, an automatic settlement is rolled back too,
 * so the status never claims more than the numbers support.
 */
export async function removeBillPayment(id: string, paymentId: string): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    const bill = await Bill.findById(id).lean();
    if (!bill) return { ok: false, error: 'Bill not found' };

    await Bill.updateOne({ _id: id }, { $pull: { payments: { _id: paymentId } } });

    const after = await Bill.findById(id).lean();
    if (after?.paidAt && (after.payments?.length ?? 0) > 0 && !billIsSettledByPayments(after.amount, after.payments)) {
      await Bill.updateOne({ _id: id }, { $set: { paidAt: null } });
    }
    revalidatePath('/bills');
    return { ok: true };
  });
}
