import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // Docker runner stage stays tiny: no full node_modules, no dev toolchain.
  output: 'standalone',
};

export default nextConfig;
