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

export const metadata: Metadata = {
  title: 'PHAROS · Personal Hub',
  description: 'PHAROS, your Asset & Resource Oversight System. Oversight on everything you own: equipment, receipts, installments, network. Self-hosted.',
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
    <html lang="en" suppressHydrationWarning>
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
        <Providers>
          {/* SiteNav renders only for signed-in users (chrome-less /login, /setup).
              Keep `children` in a STABLE sibling position so flipping auth state
              (e.g. when the setup wizard signs you in mid-flow) doesn't remount the
              page subtree and reset client state. */}
          {user && <SiteNav aiReady={aiReady} user={{ name: user.name || 'account', role: user.role }} />}
          {user && banner && <AiOnboardingBanner reason={banner} />}
          {children}
        </Providers>
      </body>
    </html>
  );
}
