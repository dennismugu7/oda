import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './server/securityHeaders';

const dev = process.env.NODE_ENV === 'development';
const toList = (headers: Record<string, string>) =>
  Object.entries(headers).map(([key, value]) => ({ key, value }));

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
  // Security headers (M10 CP1, decision #81 c). Pages get their nonce CSP from proxy.ts; API
  // answers are data, never rendered, so their CSP allows nothing at all.
  async headers() {
    return [
      { source: '/:path*', headers: toList(staticSecurityHeaders(dev)) },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default config;
