import type { Metadata } from 'next';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';
import { Providers } from '@/components/Providers';
import { CurrencyInit } from '@/components/CurrencyInit';
import { getAppSettings } from '@/lib/appSettings';
import { currencySymbol } from '@/lib/money';
import { isAiReady } from '@/lib/ollama';

export const metadata: Metadata = {
  title: 'PHAROS · Personal Hub',
  description: 'PHAROS, your Asset & Resource Oversight System. Oversight on everything you own: equipment, receipts, installments, network. Self-hosted.',
};

// Apply the saved theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the display currency once per request → set server symbol + hand to the client.
  const { currency } = await getAppSettings();
  const symbol = currencySymbol(currency);
  // AI status for the navbar dot (provider-aware: Anthropic = has key; Ollama = reachable).
  const aiReady = await isAiReady();
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
          <SiteNav aiReady={aiReady} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
