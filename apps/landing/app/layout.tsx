import type { Metadata, Viewport } from 'next';
import './globals.css';

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
