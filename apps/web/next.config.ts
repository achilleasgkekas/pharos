import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  serverExternalPackages: ['mongoose', 'pdfjs-dist', 'sharp'],
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb', // για receipt uploads
    },
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
