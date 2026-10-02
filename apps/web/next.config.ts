import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  serverExternalPackages: ['mongoose', 'pdfjs-dist', 'sharp'],
  experimental: {
    serverActions: {
      bodySizeLimit: '45mb', // uploads up to 40 MB (a printed Gmail PDF with images runs 20-30 MB) plus multipart overhead
    },
    // src/middleware.ts makes Next buffer every request body for it, capped at 10 MB by
    // default. A bigger upload reached the server action cut short ("Unexpected end of
    // form", shown in production as React error #441), so the cap matches the one above.
    proxyClientMaxBodySize: '45mb',
    // Tree-shake barrel imports so we ship only the icons/chart pieces we use,
    // not the whole library, on every route. Big win for lucide-react (icons
    // everywhere) and recharts.
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
