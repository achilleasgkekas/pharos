// SaaS "forgot password" page (SAAS_MODE only; the segment gate 404s otherwise). Unauthenticated
// by design — the user forgot their password. The form POSTs to api/saas/account/reset/request,
// which answers neutrally regardless of whether the email is registered (anti-enumeration).
import Link from 'next/link';
import { requireSaasUiEnabled } from '@/lib/tenancy/saasPage';
import { AuthShell } from '@/components/saas/AuthShell';
import { ResetRequestForm } from '@/components/saas/ResetRequestForm';

export const dynamic = 'force-dynamic';

export default async function ResetRequestPage() {
  requireSaasUiEnabled(); // 404 when SaaS off / AUTH_SECRET missing

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we'll send a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link
            href="/account/login"
            className="font-medium text-[color:var(--color-accent)] hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      <ResetRequestForm />
    </AuthShell>
  );
}
