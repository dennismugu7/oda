import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@oda/shared', '@oda/ui-tokens', '@oda/db'],
  // pg is Node-only; keep it out of the bundle.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  // The link-preview images read their fonts from disk at runtime (decision #59).
  // Keys are route globs, so the brackets of [slug] are escaped.
  outputFileTracingIncludes: {
    '/\\[slug\\]/opengraph-image': ['./assets/fonts/*.ttf'],
    '/\\[slug\\]/p/\\[id\\]/opengraph-image': ['./assets/fonts/*.ttf'],
  },
  reactStrictMode: true,
};

export default config;
