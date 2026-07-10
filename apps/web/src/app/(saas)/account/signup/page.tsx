// SaaS signup page (SAAS_MODE only; the segment layout 404s otherwise). Creating an account
// provisions a first workspace with an owner Membership (see api/saas/auth/signup). An already-
// signed-in viewer is redirected to the sanitized `next` target instead of seeing the form.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { safeNextPath } from '@/components/saas/authValidation';
import { AuthShell } from '@/components/saas/AuthShell';
import { AuthForm } from '@/components/saas/AuthForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Default post-signup destination is the account home (/account) — the new owner lands on the
  // workspace chooser, which redirects into their sole workspace. An explicit safe `next` wins.
  const target = safeNextPath(next, '/account');
  const explicitNext = target !== '/account';

  const viewer = await getSaasViewer();
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
