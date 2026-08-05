'use server';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import {
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  setMfaPendingCookie,
  clearMfaPendingCookie,
  getMfaPendingUserId,
} from '@/lib/auth';
import { authConfigured } from '@/lib/session';
import { saasMode } from '@/lib/tenancy/saasMode';
import { verifyUserMfaLogin } from '@/lib/userMfaStore';
import { rateHit, rateLimitConfig, rateStore } from '@/lib/apiRateLimit';

export async function loginAction(formData: FormData): Promise<{ ok: boolean; error?: string; mfaRequired?: boolean }> {
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
  // P79: a correct password alone must not hand out a real session when MFA is enabled — stash
  // "this password just verified for this user" in a short-lived, separately-cookied pending
  // token instead (mirrors POST /api/saas/auth/login's mfaRequired branch).
  if (user.mfaEnabled) {
    await setMfaPendingCookie(String(user._id));
    return { ok: true, mfaRequired: true };
  }
  await setSessionCookie({
    sub: String(user._id),
    role: user.role === 'admin' ? 'admin' : 'member',
    name: user.name || user.username,
  });
  return { ok: true };
}

/** Rate-limit key is per-user, not per-IP — the user id is the real scarce resource being
 *  brute-forced (a 6-digit TOTP code or an 8-char recovery code), and IP-keying would leave
 *  distributed guessing from many IPs at the same account wide open. Config-gated off by default
 *  (API_RATE_LIMIT unset), same shared config as /api/v1 and the SaaS MFA route — mirrors the fix
 *  for the SaaS side's identical gap (WEB_DEBT.md, fixed 2026-07-24) so this one ships closed
 *  from day one instead of needing the same follow-up. */
function mfaLoginRateLimited(userId: string): boolean {
  const cfg = rateLimitConfig();
  if (!cfg.enabled) return false;
  const res = rateHit(rateStore, `self-mfa:${userId}`, Date.now(), cfg.limit, cfg.windowMs);
  return !res.allowed;
}

/** Login step 2: submit the code from the pending-MFA cookie set by `loginAction`. Never reads
 *  the user id from the client — only from the signed cookie — so a caller can't name an
 *  arbitrary account to attack. */
export async function verifyMfaLoginAction(code: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getMfaPendingUserId();
  if (!userId) return { ok: false, error: 'Your sign-in session expired. Please log in again.' };
  if (mfaLoginRateLimited(userId)) return { ok: false, error: 'Too many attempts — wait a bit and try again.' };

  await connectDB();
  const result = await verifyUserMfaLogin(userId, code);
  if (!result.ok) {
    const msg =
      result.reason === 'not_enabled'
        ? 'Two-factor authentication is no longer required on this account — please log in again.'
        : result.reason === 'crypto_unavailable'
          ? 'Two-factor authentication is not available on this server right now.'
          : 'That code did not match. Check the time on your device and try again.';
    return { ok: false, error: msg };
  }

  const user = await User.findById(userId).select('role name username').lean();
  if (!user) return { ok: false, error: 'Account not found.' };
  await clearMfaPendingCookie();
  await setSessionCookie({
    sub: userId,
    role: user.role === 'admin' ? 'admin' : 'member',
    name: user.name || user.username,
  });
  return { ok: true };
}

/** "Use a different account" — abandon the pending MFA step and go back to the password form. */
export async function cancelMfaLoginAction(): Promise<void> {
  await clearMfaPendingCookie();
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
