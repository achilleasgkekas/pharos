import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';
import { Providers } from '@/components/Providers';
import { CurrencyInit } from '@/components/CurrencyInit';
import { ChromeGate } from '@/components/ChromeGate';
import { getAppSettings } from '@/lib/appSettings';
import { currencySymbol } from '@/lib/money';
import { isAiReady } from '@/lib/ollama';
import { getSessionUser } from '@/lib/auth';
import { saasUiEnabled } from '@/lib/tenancy/saasPage';
import { assertKnownWorkspaceHost } from '@/lib/tenancy/request';
import { getAiConfig } from '@/lib/aiConfig';
import { AiOnboardingBanner } from '@/components/AiOnboardingBanner';
import { FirstRunTour } from '@/components/FirstRunTour';
import { getServerT } from '@/lib/i18n/server';
import { LocaleProvider } from '@/components/LocaleProvider';
import { headers } from 'next/headers';
import { SentryInit } from '@/components/SentryInit';
import { sentryDsn, sentryEnvironment } from '@/lib/errorReporting';
import { saasMode } from '@/lib/tenancy/saasMode';

export const metadata: Metadata = {
  title: 'PHAROS · Personal Hub',
  description: 'PHAROS, your Asset & Resource Oversight System. Oversight on everything you own: equipment, receipts, installments and price tracking. Self-hosted.',
  // PWA: installable from the phone's "Add to Home Screen" (pairs with app/manifest.ts)
  appleWebApp: { capable: true, title: 'PHAROS', statusBarStyle: 'black-translucent' },
};

// App-like on mobile: stop iOS from auto-zooming when you tap a small input and
// stop accidental pinch-zoom while editing a receipt. (This is a private PWA.)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Apply the saved theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth gate at the layout level: chrome (nav) only renders for signed-in users,
  // so /login and /setup are chrome-less. Middleware already blocks unauthenticated
  // navigation; this just keeps the shell consistent.
  // A host that names a workspace which does not exist is a 404, before anything renders.
  // The layout is the only place that wraps EVERY route, gated or not, so this is the one
  // spot where an unmigrated page cannot slip past it.
  await assertKnownWorkspaceHost();
  const user = await getSessionUser();
  // UI language for this request (cookie → default), handed to the client provider.
  const { locale, dict } = await getServerT();
  // Which surfaces must NOT wear the product's own chrome (/login, /setup, /capture, /admin,
  // (saas)/account) is now decided client-side by <ChromeGate>, not here — see its comment
  // for why: this layout is shared by every route, so a boolean computed once per request
  // from a headers()-read pathname stayed frozen across client-side navigation into or out
  // of those surfaces (confirmed live: the navbar kept rendering on /account/workspace after
  // clicking into it from a product page). ChromeGate reads next/navigation's usePathname(),
  // which updates on every navigation, soft or hard, back/forward included.
  // Read the display currency once per request → set server symbol + hand to the client.
  const { currency } = await getAppSettings();
  const symbol = currencySymbol(currency);
  // Navbar dot = EFFECTIVE AI state (master switch on AND a provider is reachable).
  // Onboarding nudge: show when signed in, AI isn't usable, and not yet dismissed.
  // Is this an operator (superadmin allowlist)? Decides whether the account menu offers the
  // console at all. The console re-checks for itself and 404s otherwise, so this is only
  // about not advertising a door that will not open.
  let operator = false;
  // SiteNav renders globally now, including on hosts with no tenant at all (app.<domain> —
  // /admin, /account/*). Its product-scoped links (Settings, Stuff/Money/Plan/Activity, the
  // logo) are plain relative paths that only resolve on a TENANT host — clicking one from here
  // hits the same no_tenant gate a real product page fetch does and bounces back to
  // /account/workspace. Confirmed live (2026-08-05): the account menu's Settings link, clicked
  // from /account/workspace, landed right back on /account/workspace.
  //
  // So when we're NOT on a tenant host, resolve the account's home workspace (same "first
  // membership" default the account pages themselves use) and hand its absolute subdomain URL
  // down as `productBaseUrl` — SiteNav/AiOnboardingBanner prefix their product-scoped hrefs
  // with it instead of leaving them relative. `undefined` (the tenant-host case) means "stay
  // relative", unchanged from before.
  let productBaseUrl: string | undefined;
  if (user && saasUiEnabled()) {
    const [
      { getCurrentAccount },
      { superadminAllowlist, isSuperadminEmail },
      { parseTenantSlug },
      { TENANT_HOST_HEADER },
      { accountTenants },
      { pickWorkspace },
      { workspaceUrl },
    ] = await Promise.all([
      import('@/lib/tenancy/accountSession'),
      import('@/lib/tenancy/superadmin'),
      import('@/lib/tenancy/host'),
      import('@/lib/tenancy/request'),
      import('@/lib/tenancy/saasApi'),
      import('@/components/saas/chooseWorkspace'),
      import('@/components/saas/workspaceUrl'),
    ]);
    const account = await getCurrentAccount().catch(() => null);
    operator = !!account && isSuperadminEmail(account.email, superadminAllowlist());

    const h = await headers();
    const host = h.get(TENANT_HOST_HEADER) || h.get('x-forwarded-host') || h.get('host');
    if (account && !parseTenantSlug(host)) {
      const tenants = await accountTenants(account.sub).catch(() => []);
      const home = pickWorkspace(tenants, null);
      if (home) productBaseUrl = workspaceUrl(home.slug, process.env.SAAS_PUBLIC_URL) || undefined;
    }
  }
  let aiReady = false;
  let banner: 'off' | 'no-provider' | null = null;
  if (user) {
    const cfg = await getAiConfig();
    const providerReady = await isAiReady();
    aiReady = cfg.aiEnabled && providerReady;
    if (!cfg.aiOnboardingDismissed) {
      if (!cfg.aiEnabled) banner = 'off';
      else if (!providerReady) banner = 'no-provider';
    }
  }
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Manrope:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap&subset=greek,greek-ext,latin"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Error reporting: only when the operator configured SENTRY_DSN (off for self-hosters by default). */}
        {sentryDsn() && <SentryInit dsn={sentryDsn()!} environment={sentryEnvironment(saasMode())} />}
        <CurrencyInit symbol={symbol} />
        <LocaleProvider locale={locale} dict={dict}>
        <Providers>
          {/* SiteNav renders only for signed-in users AND not on a chrome-less route (see
              ChromeGate). Keep `children` in a STABLE sibling position so flipping auth
              state or route doesn't remount the page subtree and reset client state. */}
          {user && (
            <ChromeGate>
              <SiteNav aiReady={aiReady} saas={saasUiEnabled()} operator={operator} user={{ name: user.name || 'account', role: user.role }} productBaseUrl={productBaseUrl} />
              {banner && <AiOnboardingBanner reason={banner} productBaseUrl={productBaseUrl} />}
              <FirstRunTour />
            </ChromeGate>
          )}
          {children}
        </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
