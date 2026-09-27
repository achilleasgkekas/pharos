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
import { assertKnownWorkspaceHost } from '@/lib/tenancy/request';
import { getAiConfig } from '@/lib/aiConfig';
import { AiOnboardingBanner } from '@/components/AiOnboardingBanner';
import { FirstRunTour } from '@/components/FirstRunTour';
import { getServerT } from '@/lib/i18n/server';
import { LocaleProvider } from '@/components/LocaleProvider';
import { sentryDsn, sentryEnvironment } from '@/lib/errorReporting';
import { saasMode } from '@/lib/tenancy/saasMode';
import { loadAttributionNames } from '@/lib/attribution';
import { AttributionProvider } from '@/components/CreatedBy';

export const metadata: Metadata = {
  title: 'PHAROS · Personal Hub',
  description: 'PHAROS, your Asset & Resource Oversight System. Oversight on everything you own: equipment, receipts, installments and price tracking. Self-hosted.',
  icons: {
    icon: [{ url: '/pharos-icon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/pharos-apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
  // P75: who added each record. Null (nothing shown) until the instance has a second user.
  const attribution = user ? await loadAttributionNames() : null;
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Error reporting config for instrumentation-client.ts — rendered ONLY when the operator set
            SENTRY_DSN, so self-hosted installs ship no reporting at all. Inline so it exists before
            any bundle runs (startup/hydration errors). JSON is escaped against </script> injection. */}
        {sentryDsn() && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__PHAROS_SENTRY__=${JSON.stringify({ dsn: sentryDsn(), environment: sentryEnvironment(saasMode()) }).replace(/</g, '\\u003c')};`,
            }}
          />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Manrope:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap&subset=greek,greek-ext,latin"
          rel="stylesheet"
        />
      </head>
      <body>
        <CurrencyInit symbol={symbol} />
        <LocaleProvider locale={locale} dict={dict} currency={currency}>
        <AttributionProvider names={attribution}>
        <Providers>
          {/* SiteNav renders only for signed-in users AND not on a chrome-less route (see
              ChromeGate). Keep `children` in a STABLE sibling position so flipping auth
              state or route doesn't remount the page subtree and reset client state. */}
          {user && (
            <ChromeGate>
              <SiteNav aiReady={aiReady} user={{ name: user.name || 'account', role: user.role }} />
              {banner && <AiOnboardingBanner reason={banner} />}
              <FirstRunTour />
            </ChromeGate>
          )}
          {children}
        </Providers>
        </AttributionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
