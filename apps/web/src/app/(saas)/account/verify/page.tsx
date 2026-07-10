// SaaS email-verification page (SAAS_MODE only; the segment gate 404s otherwise). Reached from
// the emailed verification link (?token=…) or navigated to directly. With a token, the client
// panel auto-confirms via api/saas/account/verify/confirm (unauthenticated — the token proves
// ownership). Without one, a signed-in viewer can resend. `getSaasViewer` gates AND tells us
// whether a session is present so we can offer the authenticated resend action.
import Link from 'next/link';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { AuthShell } from '@/components/saas/AuthShell';
import { VerifyEmail } from '@/components/saas/VerifyEmail';

export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const viewer = await getSaasViewer(); // gate (404 when SaaS off) + current claims or null
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Verify your email"
      footer={
        <Link
          href={viewer ? '/account/workspace' : '/account/login'}
          className="font-medium text-[color:var(--color-accent)] hover:underline"
        >
          {viewer ? 'Back to workspace' : 'Back to sign in'}
        </Link>
      }
    >
      <VerifyEmail token={token ?? ''} loggedIn={!!viewer} />
    </AuthShell>
  );
}
