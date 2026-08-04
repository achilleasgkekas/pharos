'use server';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { verifyPassword, setSessionCookie, clearSessionCookie } from '@/lib/auth';
import { authConfigured } from '@/lib/session';
import { saasMode } from '@/lib/tenancy/saasMode';

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

/**
 * Sign out from inside the product, in EITHER shape.
 *
 * This used to clear only `pharos_session` and send you to `/login`, which is the
 * self-hosted pair. A hosted customer holds `pharos_account` instead, so pressing Sign out
 * in the navbar cleared a cookie they never had, left the real session alive, and dropped
 * them on the self-hosted login page — from which they were still signed in and bounced
 * straight back into the workspace. Reported as "I log out and it takes me back to the
 * workspace, and I have to log out there too". They did have to: this button had not
 * actually logged them out of anything.
 *
 * Both cookies are cleared unconditionally. Clearing one that was never set is a no-op, and
 * "log me out" should not leave a second session behind on a machine that happens to have
 * both (a self-hosted instance and the hosted app share nothing but the browser).
 */
export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  if (saasMode()) {
    // Domain-scoped (.ph-aros.com): clearAccountCookie carries the same Domain, without
    // which the browser keeps the cookie and every workspace subdomain stays signed in.
    const { clearAccountCookie } = await import('@/lib/tenancy/accountSession');
    await clearAccountCookie();
  }
  redirect(saasMode() ? '/account/login' : '/login');
}
