import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Linting belongs to CI (.github/workflows/lint.yml), not to the image build. Since #136 added
  // an eslint config, `next build` started linting too — it added ~2 minutes to every deploy and,
  // worse, it lints the BUILD CONTEXT: the server's checkout carries ~14k macOS AppleDouble
  // `._*` files, ESLint tried to parse them, and the deploy rolled back with "Parsing error:
  // Invalid character" on files nobody wrote (2026-09-17).
  eslint: { ignoreDuringBuilds: true },
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
