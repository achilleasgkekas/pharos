// SaaS sign-in page (SAAS_MODE only; the segment layout 404s otherwise). An already-signed-in
// viewer is bounced straight to the sanitized `next` target — no reason to show a login form to
// someone who is logged in (this is also how a superadmin reaches /admin: sign in here, then go).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { safeNextPath } from '@/components/saas/authValidation';
import { AuthShell } from '@/components/saas/AuthShell';
import { AuthForm } from '@/components/saas/AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Default post-login destination is the account home (/account) — the workspace chooser — not
  // the self-hosted root. A logged-in viewer is bounced straight there; an explicit safe `next`
  // still wins.
  const target = safeNextPath(next, '/account');
  const explicitNext = target !== '/account';

  const viewer = await getSaasViewer(); // gate + current claims (throws notFound when SaaS off)
  if (viewer) redirect(target);

  const signupHref = explicitNext
    ? `/account/signup?next=${encodeURIComponent(target)}`
    : '/account/signup';

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to your Pharos workspace."
      footer={
        <>
          No account yet?{' '}
          <Link
            href={signupHref}
            className="font-medium text-[color:var(--color-accent)] hover:underline"
          >
            Create one
          </Link>
          <br />
          <Link
            href="/account/reset"
            className="font-medium text-[color:var(--color-accent)] hover:underline"
          >
            Forgot your password?
          </Link>
        </>
      }
    >
      <AuthForm mode="login" next={target} />
    </AuthShell>
  );
}
