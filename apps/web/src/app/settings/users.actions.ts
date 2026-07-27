'use server';
import { revalidatePath } from 'next/cache';
import { parseRole, type Role } from '@/lib/roles';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { hashPassword, verifyPassword, requireAdmin, requireUser } from '@/lib/auth';

export type UserRow = { id: string; username: string; name: string; role: Role };

export async function listUsers(): Promise<UserRow[]> {
  await requireAdmin();
  await connectDB();
  const users = await User.find().sort({ createdAt: 1 }).lean();
  return users.map((u) => ({
    id: String(u._id),
    username: u.username,
    name: u.name || '',
    role: u.role === 'admin' ? 'admin' : 'member',
  }));
}

export async function createUser(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || 'member') === 'admin' ? 'admin' : 'member';
  if (username.length < 2 || !/^[a-z0-9._-]+$/.test(username)) return { ok: false, error: 'Username: letters, numbers, . _ - (min 2).' };
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  await connectDB();
  if (await User.findOne({ username }).lean()) return { ok: false, error: 'Username already taken.' };
  await User.create({ username, name, passwordHash: hashPassword(password), role });
  revalidatePath('/settings');
  return { ok: true };
}

export async function deleteUser(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  if (id === me.id) return { ok: false, error: 'You cannot delete your own account.' };
  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) return { ok: false, error: 'User not found.' };
  if (target.role === 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) {
    return { ok: false, error: 'Cannot delete the last admin.' };
  }
  await User.deleteOne({ _id: id });
  revalidatePath('/settings');
  return { ok: true };
}

export async function setUserRole(id: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  // Parse rather than coerce: the old `role === 'admin' ? 'admin' : 'member'` silently
  // turned any unknown value into a writer, which with a third role would quietly promote
  // a viewer. An unrecognised role is rejected instead.
  const next = parseRole(role);
  if (!next) return { ok: false, error: 'Unknown role.' };
  await connectDB();
  const target = await User.findById(id).lean();
  if (!target) return { ok: false, error: 'User not found.' };
  // Any move OFF admin counts as a demotion, not just admin→member. With a third role in
  // play, checking only for 'member' would let the last admin become a viewer and lock
  // every writer out of the instance.
  if (target.role === 'admin' && next !== 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) {
    return { ok: false, error: 'Cannot demote the last admin.' };
  }
  await User.updateOne({ _id: id }, { $set: { role: next } });
  revalidatePath('/settings');
  return { ok: true };
}

/** Admin resets another user's password (no old-password needed). */
export async function changeUserPassword(id: string, password: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  await connectDB();
  const res = await User.updateOne({ _id: id }, { $set: { passwordHash: hashPassword(password) } });
  if (!res.matchedCount) return { ok: false, error: 'User not found.' };
  return { ok: true };
}

/** Any signed-in user changes their own password (must confirm the current one). */
export async function changeOwnPassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  if (newPassword.length < 8) return { ok: false, error: 'New password must be at least 8 characters.' };
  await connectDB();
  const user = await User.findById(me.id).lean();
  if (!user || !verifyPassword(oldPassword, user.passwordHash)) return { ok: false, error: 'Current password is wrong.' };
  await User.updateOne({ _id: me.id }, { $set: { passwordHash: hashPassword(newPassword) } });
  return { ok: true };
}
