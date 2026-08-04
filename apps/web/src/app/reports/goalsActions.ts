'use server';
import { connectDB } from '@/lib/db';
import { Goal } from '@/models/Goal';
import { safeDateOrNull } from '@/lib/dates';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanWrite } from '@/lib/auth';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';

// P12 — CRUD + per-contribution add/remove for savings / financial goals.
// Deterministic, no AI. `current` is derived (Σ contributions), never stored.
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

export async function createGoal(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    const parsed = GoalFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
    const raw = parsed.data;
    await connectDB();
    const Model = await currentModel(Goal);
    await Model.create({ ...raw, targetDate: safeDateOrNull(raw.targetDate), contributions: [], archived: false });
    revalidatePath('/reports');
    revalidatePath('/');
    return { ok: true };
  });
}

export async function updateGoal(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  return withRequestTenant(async () => {
    await assertCanWrite();
    const parsed = GoalFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid data' };
    const raw = parsed.data;
    await connectDB();
    const Model = await currentModel(Goal);
    await Model.findByIdAndUpdate(id, { ...raw, targetDate: safeDateOrNull(raw.targetDate) });
    revalidatePath('/reports');
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
    revalidatePath('/');
    return { ok: true };
  });
}
