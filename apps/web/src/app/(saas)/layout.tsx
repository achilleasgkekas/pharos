// User-facing SaaS segment shell — (saas)/login, (saas)/signup, and future workspace-settings
// panels. SELF-GATING: requireSaasUiEnabled() throws notFound() for the self-hosted app
// (SAAS_MODE off) or a fail-closed misconfig (no AUTH_SECRET), so this segment does not exist
// for the OSS build and it stays byte-for-byte unchanged.
//
// The segment carries no chrome of its own here (each page renders inside AuthShell); it exists
// so the whole (saas) tree shares one gate + force-dynamic (never cache the enabled/authz
// decision). In SaaS mode the root layout renders no SiteNav (there is no per-tenant `User`
// session), so these pages are correctly chrome-less.
import type { ReactNode } from 'react';
import { requireSaasUiEnabled } from '@/lib/tenancy/saasPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pharos',
  robots: { index: false, follow: false },
};

export default function SaasLayout({ children }: { children: ReactNode }) {
  requireSaasUiEnabled();
  return <>{children}</>;
}
