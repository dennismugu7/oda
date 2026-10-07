import { NextResponse, type NextRequest } from 'next/server';
import { sentryIngestOrigin } from '@/lib/sentryOptions';
import { contentSecurityPolicy, newNonce, type CspConfig } from '@/server/securityHeaders';
import { storageDriver } from '@/server/storage';

// Every page gets a fresh nonce and the strict Content-Security-Policy (M10 CP1, decision
// #81 c). Next.js reads the nonce from the request's CSP header and puts it on its own
// scripts, so pages must render per request (they do: the root layout waits for one).
// The other security headers (and the API's CSP) come from next.config.ts.

let cached: Omit<CspConfig, 'dev'> | null = null;

function cspConfig(): CspConfig {
  if (!cached) {
    let driver: string | undefined;
    try {
      driver = storageDriver().driver;
    } catch {
      driver = undefined; // misconfigured storage: no upload origin (uploads fail anyway)
    }
    cached = {
      storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL,
      storageDriver: driver,
      s3Endpoint: process.env.STORAGE_S3_ENDPOINT,
      vercelBlobApiUrl: process.env.VERCEL_BLOB_API_URL,
      sentryIngest: sentryIngestOrigin(),
    };
  }
  return { ...cached, dev: process.env.NODE_ENV === 'development' };
}

export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const emailPreview = request.nextUrl.pathname.startsWith('/dev/outbox');
  const csp = contentSecurityPolicy(nonce, { ...cspConfig(), emailPreview });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API, Next's static files, or the link-preview images.
      source: '/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|.*opengraph-image).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
