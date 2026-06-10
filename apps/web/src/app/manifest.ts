import type { MetadataRoute } from 'next';

// PWA manifest → "Add to Home Screen" installs PHAROS like an app (standalone,
// dark splash, lighthouse icon). Served at /manifest.webmanifest automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PHAROS · Personal Hub',
    short_name: 'PHAROS',
    description: 'Asset & Resource Oversight System — oversight on everything you own.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
