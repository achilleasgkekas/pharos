'use server';
import { revalidatePath } from 'next/cache';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';


export type ProfileData = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  alertSubscriptions: Record<string, boolean> | null;
};

export async function getProfile(): Promise<ProfileData> {
  const me = await requireUser();
  await connectDB();
  const user = await User.findById(me.id).select('username name email role mfaEnabled alertSubscriptions').lean();
  if (!user) throw new Error('User not found');
  return {
    id: String(user._id),
    username: user.username,
    name: user.name || '',
    email: (user as { email?: string }).email || '',
    role: user.role === 'admin' ? 'admin' : user.role === 'viewer' ? 'viewer' : 'member',
    mfaEnabled: !!user.mfaEnabled,
    alertSubscriptions: (user as { alertSubscriptions?: Record<string, boolean> | null }).alertSubscriptions ?? null,
  };
}

export async function updateProfile(data: { name?: string; email?: string }): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  await connectDB();
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (name.length > 100) return { ok: false, error: 'Name is too long.' };
    update.name = name;
  }
  if (data.email !== undefined) {
    const email = data.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Invalid email address.' };
    update.email = email;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: 'Nothing to update.' };
  await User.updateOne({ _id: me.id }, { $set: update });
  revalidatePath('/profile');
  return { ok: true };
}

export async function updateAlertSubscriptions(
  subscriptions: Record<string, boolean> | null
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  await connectDB();
  await User.updateOne({ _id: me.id }, { $set: { alertSubscriptions: subscriptions } });
  revalidatePath('/profile');
  return { ok: true };
}
