import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import { homeRedirects } from './lib/home';
import { assertDeploymentConfig, indexable, odaEnvironment } from './server/deployment';
import { staticSecurityHeaders } from './server/securityHeaders';

const dev = process.env.NODE_ENV === 'development';
// A production build without its config fails here, so the running deployment stays up.
if (process.env.VERCEL) assertDeploymentConfig();
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
  // Production's root goes to oda's product page on mugu-labs.com (decision #99): "/" only,
  // so shop pages, /privacy, /terms, /delete-account and /api are untouched. Staging keeps
  // its landing page.
  async redirects() {
    return homeRedirects(odaEnvironment());
  },
  // Security headers (M10 CP1, decision #81 c). Pages get their nonce CSP from proxy.ts; API
  // answers are data, never rendered, so their CSP allows nothing at all.
  async headers() {
    return [
      { source: '/:path*', headers: toList(staticSecurityHeaders(dev)) },
      // Only production is indexed: staging and previews tell search engines to stay away.
      ...(indexable()
        ? []
        : [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]),
      {
        source: '/api/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

// Sentry (decision #87): readable stack traces from source maps uploaded during the Vercel
// build, only when SENTRY_AUTH_TOKEN is set there (never on the laptop); the maps are deleted
// from the deployment after upload, so browsers never get them.
export default withSentryConfig(config, {
  org: 'mugu-labs',
  project: 'oda-web',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI && !process.env.VERCEL,
  telemetry: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: false,
});
