'use server';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { verifyPassword, setSessionCookie, clearSessionCookie } from '@/lib/auth';
import { authConfigured } from '@/lib/session';

export async function loginAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  if (!authConfigured()) {
    return { ok: false, error: 'Server is missing AUTH_SECRET. Set it in .env and restart.' };
  }
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  if (!username || !password) return { ok: false, error: 'Enter your username and password.' };

  await connectDB();
  const user = await User.findOne({ username }).lean();
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: 'Wrong username or password.' };
  }
  await setSessionCookie({
    sub: String(user._id),
    role: user.role === 'admin' ? 'admin' : 'member',
    name: user.name || user.username,
  });
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}
