// The bridge between the two identity systems.
//
// The app has always identified people with a `User` document and a `pharos_session` cookie. A
// hosted customer is an `Account` with a `pharos_account` cookie and a `Membership` in a
// workspace, and has NO `User` at all. Nothing joined the two, so in SaaS mode every gate built
// on `getCurrentUser()` saw "nobody signed in":
//
//   Settings → requireAdmin → getCurrentUser() null → redirect /login
//   /login   → User.countDocuments() === 0 → redirect /setup
//   /setup   → "create your admin account"
//
// A paying customer, correctly signed in, was handed the self-hosted first-run wizard. The same
// null was why the navbar never rendered. One missing bridge, several symptoms — which is the
// argument for having exactly ONE answer to "who is signed in" rather than a special case per
// surface.
//
// NODE-only. Returns null whenever SAAS_MODE is off, so the self-hosted path is untouched and
// pays for nothing.
import { cache } from 'react';
import { headers } from 'next/headers';
import type { Role } from '@/lib/roles';
import { saasMode } from './saasMode';
import { getCurrentAccount } from './accountSession';
import { accountTenants } from './saasApi';
import { parseTenantSlug } from './host';
import { TENANT_HOST_HEADER } from './request';

/**
 * Map a SaaS organisation role onto the three in-app roles.
 *
 * `owner` has no self-hosted counterpart and `admin` is the closest true statement: both mean
 * "may change things here". This DOES gate in-app permissions (requireAdmin reads it), so it is
 * deliberately conservative — anything unrecognised becomes `viewer`, the least privileged, rather
 * than defaulting open.
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

export type SaasSessionUser = { id: string; role: Role; name: string };

/**
 * The signed-in hosted customer, shaped like a self-hosted session user, or null.
 *
 * `cache()` dedupes it within a single render: the root layout and the page both call
 * getCurrentUser(), and without this that is two membership queries per page view.
 *
 * Returns null when the account is not a member of the workspace named in the host. That is the
 * important branch — the data-plane gate already turns such a request into a 404, and returning a
 * user here would let a page-level `requireUser()` believe otherwise.
 */
export const saasSessionUser = cache(async function saasSessionUser(): Promise<SaasSessionUser | null> {
  if (!saasMode()) return null;

  const account = await getCurrentAccount();
  if (!account) return null;

  const h = await headers();
  const host = h.get(TENANT_HOST_HEADER) || h.get('x-forwarded-host') || h.get('host');
  const slug = parseTenantSlug(host);

  // No workspace in the host: the account area (app.*, the apex). They are signed in, but not
  // "inside" anything, so there is no workspace role to claim. `viewer` keeps every in-app admin
  // gate closed on a host where those pages do not belong anyway.
  if (!slug) return { id: account.sub, role: 'viewer', name: account.email };

  try {
    const tenants = await accountTenants(account.sub);
    const membership = tenants.find((t) => t.slug === slug);
    if (!membership) return null;
    return { id: account.sub, role: navRole(membership.role), name: account.email };
  } catch {
    // A control-plane hiccup must not silently PROMOTE anyone. Denying is the safe direction:
    // the page shows a login redirect rather than granting a role we could not verify.
    return null;
  }
});
