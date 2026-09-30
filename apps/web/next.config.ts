import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@oda/shared', '@oda/ui-tokens', '@oda/db'],
  // pg is Node-only; keep it out of the bundle.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
