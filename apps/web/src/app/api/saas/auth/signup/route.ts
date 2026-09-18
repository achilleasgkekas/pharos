import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { hashPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { signupAllowed } from '@/lib/tenancy/signupGate';
import { rateLimit, clientIp } from '@/lib/apiAuth';
import { saasAuthGate, saasGuard, accountTenants } from '@/lib/tenancy/saasApi';
import { setAccountCookie } from '@/lib/tenancy/accountSession';
import { provisionTenant, compensate, slugify } from '@/lib/tenancy/provision';
import { Tenant } from '@/models/Tenant';
import { RESERVED_SLUGS } from '@/lib/tenancy/host';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Minimal password policy — enough to block empties/typos without being annoying.
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/saas/auth/signup  { email, password, name?, workspace? }
 *   → creates a global Account (scrypt-hashed password), provisions a first Tenant with an
 *     owner Membership, sets the account session cookie, and returns the account + tenants.
 * SaaS-mode only (404 when SAAS_MODE off). Does not touch the self-hosted User/bearer path.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    // Rate limit BEFORE the mode gate, like login: an unauthenticated stranger can hit this
    // endpoint, and signup is a write that creates an Account, provisions a Tenant and a
    // database. Unlimited, it is a way to fill the registry with junk workspaces, burn the slug
    // namespace, and drive the mail provider's send volume from someone else's browser.
    // Own key prefix so signup abuse cannot exhaust the login bucket or vice versa.
    const limited = rateLimit(`saas-signup:${clientIp(req)}`);
    if (limited) return limited;

    const gate = saasAuthGate();
    if (gate) return gate;

    const b = await readBody(req);
    const email = strField(b, 'email', '', true).toLowerCase();
    const password = strField(b, 'password');
    const name = strField(b, 'name', '', true);
    const workspace = strField(b, 'workspace', '', true);

    // Private beta: the door itself. Checked BEFORE any validation feedback, so a stranger
    // without a code learns nothing about which emails are taken. An invite token bypasses it
    // — an invitation is already an authorisation from someone inside the workspace, and
    // requiring a code on top would make every invite look broken. No-op when
    // SAAS_SIGNUP_CODES is unset (open signup, the default).
    if (!signupAllowed(strField(b, 'code'), !!strField(b, 'invite').trim())) {
      return NextResponse.json(
        { error: 'Pharos is in private beta — you need an invite code to sign up' },
        { status: 403 }
      );
    }

    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 });
    }
    // A workspace name is REQUIRED: it becomes the permanent subdomain, and letting it default
    // to the account name silently produced surprise addresses (e.g. "achilleas"). It must also
    // yield at least one usable slug character after slugify (a name of only symbols does not).
    if (!workspace.trim() || !slugify(workspace)) {
      return NextResponse.json({ error: 'A workspace name is required' }, { status: 400 });
    }

    await connectDB();

    // If a workspace name was chosen, its slug becomes the PERMANENT subdomain (immutable after
    // provisioning). Reject a taken/reserved address here — before creating the account — so the
    // person picks another instead of silently landing on "<name>-2". Mirrors the live check the
    // signup form does against /api/saas/auth/workspace-available; re-checked here to close the
    // gap between that check and this submit. Left blank → the fallback name is auto-slugged and
    // de-duplicated by provisionTenant as before (not a deliberate choice, so "-2" is fine there).
    const chosenSlug = slugify(workspace);
    if (workspace.trim() && chosenSlug && (RESERVED_SLUGS.has(chosenSlug) || (await Tenant.exists({ slug: chosenSlug })))) {
      return NextResponse.json(
        { error: 'That workspace address is taken — pick a different workspace name', code: 'slug_taken' },
        { status: 409 }
      );
    }

    // Uniqueness pre-check + a race-safe fallback on the unique index (11000).
    if (await Account.exists({ email })) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    let account;
    try {
      account = await Account.create({ email, name, passwordHash: hashPassword(password) });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
      }
      throw e;
    }

    const accountId = String(account._id);
    try {
      await provisionTenant({
        accountId,
        workspaceName: workspace,
        // Pin the exact slug the person saw as available; provisionTenant still de-dupes as a
        // race-safe fallback if it was taken in the gap above.
        slugHint: chosenSlug,
      });
    } catch (err) {
      // Signup is two writes (Account, then workspace) and used to be atomic in neither
      // direction. When provisioning failed the Account survived, so the customer was told
      // "something went wrong", tried again, and was told their email ALREADY EXISTS — for an
      // account they never knowingly created and that owns no workspace. A dead end reached by
      // doing exactly the right thing twice.
      //
      // Undo our own half instead. `provisionTenant` already rolls its own tenant back, so after
      // this the request leaves nothing behind and "please try again" is true rather than a
      // polite lie.
      await compensate(`account ${email} (${accountId})`, () =>
        Account.deleteOne({ _id: account._id }),
      );
      console.error('[signup] provisioning failed, account rolled back:', err);
      return NextResponse.json(
        { error: 'Could not create your workspace. Nothing was saved, please try again.' },
        { status: 500 }
      );
    }

    await setAccountCookie({ sub: accountId, email, epoch: 0 });

    return NextResponse.json(
      {
        account: { id: accountId, email, name: account.name || '' },
        tenants: await accountTenants(accountId),
      },
      { status: 201 }
    );
  });
}
