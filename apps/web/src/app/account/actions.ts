'use server';
import { revalidatePath } from 'next/cache';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { getAppSettings } from '@/lib/appSettings';
import { ALERT_TYPE_KEYS, type NotifyTypes } from '@/lib/alertTypes';
import type { Role } from '@/lib/roles';

export type AccountUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type AccountData = {
  user: AccountUser;
  workspaceNotifyTypes: NotifyTypes;
  personalNotifyTypes: NotifyTypes;
  hasCustomSubscriptions: boolean;
};

/** Load the current signed-in user's profile and notification preferences (#383). */
export async function getAccountData(): Promise<AccountData> {
  const me = await requireUser();
  await connectDB();
  const user = await User.findById(me.id)
    .select('username name email role alertSubscriptions createdAt')
    .lean();

  if (!user) throw new Error('User not found');

  const settings = await getAppSettings();
  const workspaceNotifyTypes = settings.notifyTypes;

  const rawSubs = user.alertSubscriptions as Record<string, unknown> | undefined;
  const hasCustomSubscriptions = !!(rawSubs && Object.keys(rawSubs).length > 0);

  const personalNotifyTypes = { ...workspaceNotifyTypes };
  if (hasCustomSubscriptions && rawSubs) {
    for (const key of ALERT_TYPE_KEYS) {
      if (typeof rawSubs[key] === 'boolean') {
        personalNotifyTypes[key] = rawSubs[key] as boolean;
      }
    }
  }

  return {
    user: {
      id: String(user._id),
      username: user.username,
      name: user.name || '',
      email: user.email || '',
      role: (user.role as Role) || 'member',
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
    },
    workspaceNotifyTypes,
    personalNotifyTypes,
    hasCustomSubscriptions,
  };
}

/** Update personal profile details (display name and notification email). */
export async function updateProfile({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, error: 'Invalid email address' };
  }

  await connectDB();
  await User.updateOne(
    { _id: me.id },
    { $set: { name: cleanName, email: cleanEmail } }
  );

  revalidatePath('/account');
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Update personal alert category preferences.
 * Passing `null` resets subscriptions to inherit workspace defaults.
 */
export async function updateAlertSubscriptions(
  subscriptions: Record<string, boolean> | null
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  await connectDB();

  if (subscriptions === null) {
    await User.updateOne({ _id: me.id }, { $set: { alertSubscriptions: {} } });
  } else {
    const clean: Record<string, boolean> = {};
    for (const key of ALERT_TYPE_KEYS) {
      if (typeof subscriptions[key] === 'boolean') {
        clean[key] = subscriptions[key];
      }
    }
    await User.updateOne({ _id: me.id }, { $set: { alertSubscriptions: clean } });
  }

  revalidatePath('/account');
  revalidatePath('/settings');
  return { ok: true };
}
