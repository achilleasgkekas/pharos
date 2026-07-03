import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://ph-aros.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'PHAROS · Personal Hub',
  description:
    'One light over everything you run. PHAROS is a self-hosted personal hub: inventory, receipts with AI, expenses, credit-card installments, subscriptions, and your network, in one private dashboard.',
  keywords: [
    'self-hosted',
    'personal hub',
    'home dashboard',
    'receipt scanner',
    'expense tracker',
    'inventory',
    'homelab',
    'privacy',
  ],
  authors: [{ name: 'Achilleas' }],
  manifest: '/manifest.webmanifest',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title: 'PHAROS · Personal Hub',
    description:
      'One light over everything you run. Self-hosted, private, AI-assisted oversight on everything you own.',
    siteName: 'PHAROS',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PHAROS · Personal Hub',
    description: 'One light over everything you run. Self-hosted personal hub.',
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
