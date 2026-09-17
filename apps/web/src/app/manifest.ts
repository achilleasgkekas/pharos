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
    // #123 — Pharos appears in the phone's Share sheet for PDFs and images. The POST lands on
    // /capture/share/receive (a page and a route handler cannot share one path in Next), which parks
    // the file and redirects to the picker at /capture/share.
    // iOS only offers this once Pharos is installed to the Home Screen.
    share_target: {
      action: '/capture/share/receive',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { files: [{ name: 'file', accept: ['application/pdf', 'image/*'] }] },
    },
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/pharos-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pharos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
