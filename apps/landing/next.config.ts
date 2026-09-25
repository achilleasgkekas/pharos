import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // Docker runner stage stays tiny: no full node_modules, no dev toolchain.
  output: 'standalone',
  experimental: {
    // Put the site's CSS in a <style> tag in the HTML instead of a separate render-blocking
    // stylesheet. The landing page is one small static document, so this saves a whole round
    // trip before the hero can paint, which is most of mobile LCP on a slow link (#158).
    inlineCss: true,
  },
};

export default nextConfig;
