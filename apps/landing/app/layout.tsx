import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Manrope, Outfit } from 'next/font/google';
import './globals.css';

// next/font downloads these at build time and serves them from this origin with a preload.
// The old `@import` of fonts.googleapis.com in globals.css was render-blocking and chained
// three requests (our CSS, Google's CSS, the font files) before the hero text could paint,
// which is what held mobile LCP at ~3.6s (#158). Self-hosting also means no request to Google.
//
// The two hero faces use `optional`, not `swap`: a late swap re-lays out the headline, shifts the
// hero paragraph (CLS) and counts as a new, later LCP paint. With the preload they normally
// arrive in time; on a slow first visit the size-matched fallback stays up until the next load.
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'optional',
  variable: '--font-outfit',
});
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'optional',
  variable: '--font-manrope',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-plex-mono',
  // Only small labels use the mono face, never the hero headline or paragraph, so its three
  // static weights are not worth competing with the LCP fonts for early bandwidth.
  preload: false,
});

const SITE_URL = 'https://ph-aros.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'PHAROS · Personal Hub',
  // Google truncates around 155 characters; the old one ran to ~200 and lost its ending mid-list.
  description:
    'A self-hosted hub for your household: inventory, receipts, expenses, bills, subscriptions, vehicles and documents. Free software with optional AI.',
  keywords: [
    'self-hosted',
    'personal hub',
    'home dashboard',
    'receipt scanner',
    'bill tracker',
    'vehicle log',
    'expense tracker',
    'inventory',
    'homelab',
    'privacy',
  ],
  // url points at /humans.txt so Next emits the conventional
  // <link rel="author" href="/humans.txt"> alongside <meta name="author">.
  authors: [{ name: 'Pharos contributors', url: '/humans.txt' }],
  manifest: '/manifest.webmanifest',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title: 'PHAROS · Personal Hub',
    description:
      'One light over everything you run. Private, AI-assisted oversight on everything you own. Self-hosted software with optional AI.',
    siteName: 'PHAROS',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PHAROS · Personal Hub',
    description:
      'One light over everything you run. A personal hub you run on your own hardware.',
  },
  icons: {
    // SVG favicon for modern browser tabs; generated PNG for platforms that
    // can't render SVG icons; apple-touch-icon for iOS home screens (iOS
    // ignores SVG favicons). /icon and /apple-icon are next/og routes.
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon', type: 'image/png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${manrope.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
