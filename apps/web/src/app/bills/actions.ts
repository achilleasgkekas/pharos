'use server';
import { connectDB } from '@/lib/db';
import { Bill } from '@/models/Bill';
import { nextBillDue } from '@/lib/bill';
import { safeDateOrNull } from '@/lib/dates';
import { addExpense } from '@/app/expenses/actions';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// P28 — CRUD + lifecycle (mark paid / unpaid) for bills / payables. Deterministic,
// no AI. Status (paid/overdue/due-soon) is derived on read, never stored.

const CYCLES = ['', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

const BillFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  vendor: z.string().default(''),
  amount: z.coerce.number().min(0).default(0),
  dueDate: z.string().min(1, 'Due date required'),
  category: z.string().default('other'),
  cycle: z.enum(CYCLES).default(''),
  notes: z.string().default(''),
});

export async function createBill(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const parsed = BillFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  const raw = parsed.data;
  const due = safeDateOrNull(raw.dueDate);
  if (!due) return { ok: false, error: 'Invalid due date' };
  await connectDB();
  await Bill.create({ ...raw, dueDate: due, paidAt: null, archived: false });
  revalidatePath('/bills');
  return { ok: true };
}

export async function updateBill(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const parsed = BillFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
  const raw = parsed.data;
  const due = safeDateOrNull(raw.dueDate);
  if (!due) return { ok: false, error: 'Invalid due date' };
  await connectDB();
  await Bill.findByIdAndUpdate(id, { ...raw, dueDate: due });
  revalidatePath('/bills');
  return { ok: true };
}

export async function setBillArchived(id: string, archived: boolean): Promise<{ ok: boolean }> {
  await connectDB();
  await Bill.findByIdAndUpdate(id, { archived });
  revalidatePath('/bills');
  return { ok: true };
}

export async function deleteBill(id: string): Promise<{ ok: boolean }> {
  await connectDB();
  // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
  await Bill.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath('/bills');
  return { ok: true };
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
  await connectDB();
  const bill = await Bill.findById(id).lean();
  if (!bill) return { ok: false, error: 'Bill not found' };
  const wasPaid = !!bill.paidAt;
  const paidAt = safeDateOrNull(opts?.paidDate || '') ?? new Date();

  let linkedExpenseId = bill.linkedExpenseId || '';
  if (opts?.logExpense && !wasPaid && !linkedExpenseId && (bill.amount ?? 0) > 0) {
    const res = await addExpense({
      kind: 'expense',
      vendor: bill.vendor || bill.title,
      category: bill.category || 'other',
      amount: bill.amount ?? 0,
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
}

/** Undo a payment (does not touch any expense that was logged). */
export async function markBillUnpaid(id: string): Promise<{ ok: boolean }> {
  await connectDB();
  await Bill.findByIdAndUpdate(id, { paidAt: null });
  revalidatePath('/bills');
  return { ok: true };
}
