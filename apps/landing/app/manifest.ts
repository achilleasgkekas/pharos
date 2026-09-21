import type { MetadataRoute } from 'next';

// PWA web manifest — lets PHAROS be added to a phone home screen with the
// right name, brand colours, and lighthouse mark. Served at
// /manifest.webmanifest and linked automatically via metadata.manifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PHAROS · Personal Hub',
    short_name: 'PHAROS',
    description:
      'One light over everything you run. A personal hub for inventory, receipts, expenses, installments, subscriptions, and your network. Self-hosted.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    categories: ['productivity', 'finance', 'utilities'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      {
        src: '/favicon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
        purpose: 'any',
      },
      {
        src: '/icon',
        type: 'image/png',
        sizes: '512x512',
        purpose: 'any',
      },
      {
        src: '/icon',
        type: 'image/png',
        sizes: '512x512',
        purpose: 'maskable',
      },
    ],
  };
}
