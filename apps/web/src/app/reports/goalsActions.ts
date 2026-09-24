'use server';
import { connectDB } from '@/lib/db';
import { Goal } from '@/models/Goal';
import { safeDateOrNull } from '@/lib/dates';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { isMonthKey, sweepNote } from '@/lib/budgetSweep';

// P12 — CRUD + per-contribution add/remove for savings / financial goals.
// Deterministic, no AI. `current` is derived (Σ contributions), never stored.
//
// Two pages render goals — the Reports card these actions were written for and the Save
// tab, which runs each goal through the forecast (lib/savingsPlan.ts) — so every mutation
// revalidates both. A contribution added on one page that left the other showing the old
// figure would look like the app had lost the money.
//
// TENANCY: every action runs inside `withRequestTenant` and reaches Goal through
// `currentModel`, the same shape as receipts/items/expenses/tasks. Without it these wrote to
// the DEFAULT database in SaaS mode, so one workspace's savings goals would appear in — and be
// editable from — every other workspace. Self-hosted is unchanged: `withRequestTenant` resolves
// to the default tenant with zero work, and `currentModel` hands back the same model as before.
const GoalFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  targetAmount: z.coerce.number().min(0).default(0),
  targetDate: z.string().optional().default(''),
  category: z.string().default(''),
  notes: z.string().default(''),
});

function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid data';
  // Zod v4 changed the error message for missing/invalid types; normalize for UX
  if (issue.code === 'invalid_type' && issue.message?.includes('received undefined')) return 'Required';
  return issue.message || 'Invalid data';
}

export async function createGoal(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    const parsed = GoalFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
    const raw = parsed.data;
    await connectDB();
    const Model = await currentModel(Goal);
    await Model.create({ ...raw, targetDate: safeDateOrNull(raw.targetDate), contributions: [], archived: false });
    revalidatePath('/reports');
    revalidatePath('/savings');
    revalidatePath('/');
    return { ok: true };
  });
}

export async function updateGoal(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    const parsed = GoalFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
    const raw = parsed.data;
    await connectDB();
    const Model = await currentModel(Goal);
    await Model.findByIdAndUpdate(id, { ...raw, targetDate: safeDateOrNull(raw.targetDate) });
    revalidatePath('/reports');
    revalidatePath('/savings');
    revalidatePath('/');
    return { ok: true };
  });
}

/** Manually close a goal (reached / abandoned) without deleting its history. */
export async function setGoalArchived(id: string, archived: boolean): Promise<{ ok: boolean }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    await connectDB();
    const Model = await currentModel(Goal);
    await Model.findByIdAndUpdate(id, { archived });
    revalidatePath('/reports');
    revalidatePath('/savings');
    revalidatePath('/');
    return { ok: true };
  });
}

export async function deleteGoal(id: string): Promise<{ ok: boolean }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    await connectDB();
    const Model = await currentModel(Goal);
    // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
    await Model.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    revalidatePath('/reports');
    revalidatePath('/savings');
    revalidatePath('/');
    return { ok: true };
  });
}

/** Record a manual contribution toward the goal. */
export async function addGoalContribution(id: string, amount: number, note = '', dateStr = ''): Promise<{ ok: boolean; error?: string }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Enter a positive amount' };
    await connectDB();
    const Model = await currentModel(Goal);
    await Model.findByIdAndUpdate(id, {
      $push: { contributions: { amount: Math.round(amt * 100) / 100, note: String(note || '').slice(0, 200), date: safeDateOrNull(dateStr) ?? new Date() } },
    });
    revalidatePath('/reports');
    revalidatePath('/savings');
    revalidatePath('/');
    return { ok: true };
  });
}

/** Remove a single (mistaken) contribution entry. */
export async function removeGoalContribution(id: string, contributionId: string): Promise<{ ok: boolean }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    await connectDB();
    const Model = await currentModel(Goal);
    await Model.findByIdAndUpdate(id, { $pull: { contributions: { _id: contributionId } } });
    revalidatePath('/reports');
    revalidatePath('/savings');
    revalidatePath('/');
    return { ok: true };
  });
}

/**
 * P83 — move a budget category's unspent leftover of one month into a goal.
 *
 * Deliberately NOT a new kind of record: it pushes an ordinary GoalContribution
 * carrying the deterministic `sweepNote` note, so the money shows up in the goal's
 * ledger like any manual entry and a mistaken sweep is undone with the same
 * per-contribution delete button. The amount is computed by the same pure helper
 * (`sweepableLeftover`) that the Reports budget card uses to label the button, and
 * it is no more privileged than `addGoalContribution` above — the caller could
 * always type that number by hand.
 *
 * The guard that DOES matter is the one below: one sweep per category+month, checked
 * across every goal, so a double click (or a second goal) cannot move the same
 * leftover twice.
 */
export async function sweepBudgetLeftoverToGoal(
  goalId: string,
  category: string,
  monthKey: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    const cat = String(category || '').trim();
    const mk = String(monthKey || '').trim();
    const amt = Number(amount);
    if (!cat) return { ok: false, error: 'Pick a budget category' };
    if (!isMonthKey(mk)) return { ok: false, error: 'Invalid month' };
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Nothing left to sweep' };
    await connectDB();
    const Model = await currentModel(Goal);
    const note = sweepNote(cat, mk);
    // Across ALL goals, not just this one: the leftover is a single pot, so it may
    // only land once no matter which goal it was aimed at.
    const already = await Model.exists({ contributions: { $elemMatch: { note } } });
    if (already) return { ok: false, error: 'This month was already swept' };
    await Model.findByIdAndUpdate(goalId, {
      $push: { contributions: { amount: Math.round(amt * 100) / 100, note, date: new Date() } },
    });
    revalidatePath('/reports');
    revalidatePath('/savings');
    revalidatePath('/');
    return { ok: true };
  });
}
