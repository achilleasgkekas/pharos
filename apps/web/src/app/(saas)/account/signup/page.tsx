// SaaS signup page (SAAS_MODE only; the segment layout 404s otherwise). Creating an account
// provisions a first workspace with an owner Membership (see api/saas/auth/signup). An already-
// signed-in viewer is redirected to the sanitized `next` target instead of seeing the form.
//
// Doubles as the workspace-INVITE landing page (?invite=<token>, the link
// lib/tenancy/mailer.ts's inviteEmail/inviteLinkUrl point at): that branch previews the invite
// (email/workspace/role) server-side for display only — POST /api/saas/invites/accept
// re-validates authoritatively — and renders InviteAcceptForm instead of the plain signup form.
// It intentionally does NOT bounce an already-signed-in viewer away (the accept route is
// unauthenticated by design and always resolves to the invite's own email, not the caller's
// current session), so a logged-in visitor can still redeem an invite sent to a different
// address of theirs.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { safeNextPath } from '@/components/saas/authValidation';
import { AuthShell } from '@/components/saas/AuthShell';
import { AuthForm } from '@/components/saas/AuthForm';
import { InviteAcceptForm } from '@/components/saas/InviteAcceptForm';
import { Invite, type InviteDoc } from '@/models/Invite';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { hashInviteToken, isInviteValid } from '@/lib/tenancy/invites';

export const dynamic = 'force-dynamic';

type InvitePreview = { email: string; workspaceName: string; valid: boolean };

/** Resolve a presented invite token to display-only fields (email/workspace name). Never a
 *  security decision — the accept POST re-validates the token from scratch. Returns null for an
 *  unknown token so the caller can show a single "not available" message for any bad link. */
async function loadInvitePreview(token: string): Promise<InvitePreview | null> {
  await connectDB();
  const invite = (await Invite.findOne({ tokenHash: hashInviteToken(token) })
    .select('email status expires tenant')
    .lean()) as Pick<InviteDoc, 'email' | 'status' | 'expires' | 'tenant'> | null;
  if (!invite) return null;
  const tenant = (await Tenant.findById(invite.tenant).select('name slug').lean()) as Pick<
    TenantDoc,
    'name' | 'slug'
  > | null;
  return {
    email: invite.email,
    workspaceName: tenant?.name || tenant?.slug || 'a workspace',
    valid: isInviteValid(invite.status, invite.expires),
  };
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string }>;
}) {
  const { next, invite } = await searchParams;
  // Default post-signup destination is the account home (/account) — the new owner lands on the
  // workspace chooser, which redirects into their sole workspace. An explicit safe `next` wins.
  const target = safeNextPath(next, '/account');
  const explicitNext = target !== '/account';
  const inviteToken = (invite ?? '').trim();

  const viewer = await getSaasViewer();

  if (inviteToken) {
    const preview = await loadInvitePreview(inviteToken);
    const usable = !!preview?.valid;
    return (
      <AuthShell
        title={usable ? `Join ${preview!.workspaceName}` : 'Invitation not available'}
        subtitle={
          usable
            ? `You've been invited as ${preview!.email}.` +
              (viewer && viewer.email !== preview!.email
                ? ' Accepting will switch your session to this account.'
                : '')
            : 'This invitation link is invalid or has expired. Ask whoever invited you to send a new one.'
        }
        footer={
          <Link
            href="/account/login"
            className="font-medium text-[color:var(--color-accent)] hover:underline"
          >
            Sign in instead
          </Link>
        }
      >
        {usable ? (
          <InviteAcceptForm token={inviteToken} next={target} />
        ) : (
          <p className="text-sm text-[color:var(--color-text-dim)]">
            You can still create a new account or sign in below.
          </p>
        )}
      </AuthShell>
    );
  }

  if (viewer) redirect(target);

  const loginHref = explicitNext
    ? `/account/login?next=${encodeURIComponent(target)}`
    : '/account/login';

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="One account, one workspace to start. Invite others later."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={loginHref}
            className="font-medium text-[color:var(--color-accent)] hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <AuthForm mode="signup" next={target} />
    </AuthShell>
  );
}
