import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';
import { Providers } from '@/components/Providers';
import { CurrencyInit } from '@/components/CurrencyInit';
import { getAppSettings } from '@/lib/appSettings';
import { currencySymbol } from '@/lib/money';
import { isAiReady } from '@/lib/ollama';
import { getCurrentUser } from '@/lib/auth';
import { getAiConfig } from '@/lib/aiConfig';
import { AiOnboardingBanner } from '@/components/AiOnboardingBanner';
import { headers } from 'next/headers';
import { getServerT } from '@/lib/i18n/server';
import { LocaleProvider } from '@/components/LocaleProvider';

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
  const user = await getCurrentUser();
  // UI language for this request (cookie → default), handed to the client provider.
  const { locale, dict } = await getServerT();
  // Keep /login and /setup chrome-less even when signed in — the setup wizard signs
  // you in at step 1, so `user` alone would leak the navbar onto steps 2-4. The path
  // comes from middleware (x-pathname header). /capture is the bookmarklet's small
  // same-origin popup window — a navbar would waste half its 440x640 real estate.
  const pathname = (await headers()).get('x-pathname') || '';
  const chromeless = pathname === '/login' || pathname === '/setup' || pathname === '/capture';
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
        <CurrencyInit symbol={symbol} />
        <LocaleProvider locale={locale} dict={dict}>
        <Providers>
          {/* SiteNav renders only for signed-in users AND not on /login or /setup
              (those stay chrome-less even mid-wizard, once step 1 signs you in).
              Keep `children` in a STABLE sibling position so flipping auth state
              doesn't remount the page subtree and reset client state. */}
          {user && !chromeless && <SiteNav aiReady={aiReady} user={{ name: user.name || 'account', role: user.role }} />}
          {user && !chromeless && banner && <AiOnboardingBanner reason={banner} />}
          {children}
        </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
