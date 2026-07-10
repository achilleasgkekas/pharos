// SaaS reset-confirm page (SAAS_MODE only; the segment gate 404s otherwise). Reached from the
// emailed reset link (?token=…). Unauthenticated — the token proves ownership. The token is read
// server-side and handed to the client form, which POSTs to api/saas/account/reset/confirm.
import Link from 'next/link';
import { requireSaasUiEnabled } from '@/lib/tenancy/saasPage';
import { AuthShell } from '@/components/saas/AuthShell';
import { ResetConfirmForm } from '@/components/saas/ResetConfirmForm';

export const dynamic = 'force-dynamic';

export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  requireSaasUiEnabled(); // 404 when SaaS off / AUTH_SECRET missing
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Set a new password for your Pharos account."
      footer={
        <>
          Need a new link?{' '}
          <Link
            href="/account/reset"
            className="font-medium text-[color:var(--color-accent)] hover:underline"
          >
            Request another
          </Link>
        </>
      }
    >
      <ResetConfirmForm token={token ?? ''} />
    </AuthShell>
  );
}
