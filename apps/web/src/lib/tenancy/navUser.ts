// Who the NAVBAR should show in SaaS mode.
//
// The self-hosted app identifies people with a `User` document; a hosted customer is an `Account`
// with a different cookie and no `User` at all. The root layout only rendered the navbar when a
// `User` existed, so on every workspace page in SaaS mode the product came up with no navigation
// whatsoever — reachable, usable, and with no way to get anywhere. Reported as "the top menu is
// missing", which is exactly what it was.
//
// NODE-only. Returns null whenever SAAS_MODE is off, so the self-hosted path never reaches any of
// this and pays for none of it.
import { headers } from 'next/headers';
import type { Role } from '@/lib/roles';
import { saasMode } from './saasMode';
import { getCurrentAccount } from './accountSession';
import { accountTenants } from './saasApi';
import { parseTenantSlug } from './host';
import { TENANT_HOST_HEADER } from './request';

/**
 * Map a SaaS organisation role onto the three roles the navbar knows how to display.
 *
 * `owner` has no counterpart in the self-hosted vocabulary and `admin` is the closest true
 * statement: both mean "can change things here". Deliberately NOT a privilege decision — the
 * navbar only prints this string, and every actual permission check happens server-side against
 * the membership. If that ever stops being true, this mapping must not be the thing that decides
 * it.
 */
export function navRole(orgRole: string | undefined): Role {
  switch ((orgRole || '').toLowerCase()) {
    case 'owner':
    case 'admin':
      return 'admin';
    case 'member':
      return 'member';
    default:
      return 'viewer';
  }
}

export type NavUser = { name: string; role: Role };

/**
 * The signed-in account, shaped for the navbar, or null.
 *
 * Costs one indexed membership query, and only in SaaS mode with a session cookie present. It
 * runs in the root layout, so it is deliberately the cheapest thing that can still tell the truth
 * about which workspace you are in: the slug comes from the HOST (no DB), and the role from the
 * membership list we would need anyway.
 */
export async function saasNavUser(): Promise<NavUser | null> {
  if (!saasMode()) return null;

  const account = await getCurrentAccount();
  if (!account) return null;

  const h = await headers();
  const host = h.get(TENANT_HOST_HEADER) || h.get('x-forwarded-host') || h.get('host');
  const slug = parseTenantSlug(host);

  // On the account area (app.*, the apex) there is no workspace in the host, so there is no role
  // to state. Show the account with the least-privileged label rather than inventing one.
  if (!slug) return { name: account.email, role: 'viewer' };

  try {
    const tenants = await accountTenants(account.sub);
    const membership = tenants.find((t) => t.slug === slug);
    // Not a member of the workspace named in the host: the data-plane gate will already be turning
    // this request into a 404, so the navbar must not imply access either.
    if (!membership) return null;
    return { name: account.email, role: navRole(membership.role) };
  } catch {
    // The navbar is not worth failing a page render over. Show the account without a role rather
    // than blanking the whole shell again.
    return { name: account.email, role: 'viewer' };
  }
}
