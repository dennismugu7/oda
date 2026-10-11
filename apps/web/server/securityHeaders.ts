// Security headers for every web page and API answer (M10 CP1, decision #81 c). Pure functions:
// proxy.ts calls them per request, the tests call them directly.
//
// The Content-Security-Policy is strict: scripts only with this request's nonce (Next.js puts
// it on its own scripts, docs/…/content-security-policy.md), no inline <style> without it, no
// plugins, no framing, forms only to oda. Images and the browser's photo uploads (review
// photos) may also reach the configured storage origins, read from config, never hardcoded.

export interface CspConfig {
  /** STORAGE_PUBLIC_BASE_URL: where product, logo and review photos are read from. */
  storagePublicBaseUrl?: string;
  /** The storage driver in use: decides where the browser PUTs presigned review-photo uploads. */
  storageDriver?: string;
  /** STORAGE_S3_ENDPOINT (R2): the s3 driver's presigned PUTs go there. */
  s3Endpoint?: string;
  /** VERCEL_BLOB_API_URL, if set; otherwise Vercel Blob's own API. */
  vercelBlobApiUrl?: string;
  /** Sentry's ingest origin, from NEXT_PUBLIC_SENTRY_DSN: where the browser reports errors. */
  sentryIngest?: string | null;
  dev: boolean;
  /**
   * The local email outbox (/dev/outbox, 404 on Vercel) previews emails, which link the
   * Google Fonts stylesheet (Inter, Bricolage Grotesque): only that page may load it.
   */
  emailPreview?: boolean;
}

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

const VERCEL_BLOB_API = 'https://vercel.com/api/blob';

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Where the browser sends presigned uploads, by storage driver. */
export function uploadOrigins(config: CspConfig): string[] {
  switch (config.storageDriver) {
    case 'vercel-blob':
      return [origin(config.vercelBlobApiUrl ?? VERCEL_BLOB_API)!].filter(Boolean);
    case 's3': {
      // R2 presigned URLs are virtual-hosted or path style on the account's endpoint.
      const endpoint = origin(config.s3Endpoint);
      if (!endpoint) return [];
      const { protocol, host } = new URL(endpoint);
      return [endpoint, `${protocol}//*.${host}`];
    }
    default:
      return []; // local driver: same origin (/api/dev-uploads)
  }
}

export function contentSecurityPolicy(nonce: string, config: CspConfig): string {
  const storage = origin(config.storagePublicBaseUrl);
  const images = ["'self'", 'data:', 'blob:', ...(storage ? [storage] : [])];
  const connect = [
    "'self'",
    ...uploadOrigins(config),
    ...(config.sentryIngest ? [config.sentryIngest] : []),
  ];
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${config.dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${config.emailPreview ? ` ${GOOGLE_FONTS_CSS}` : ''}`,
    // style="" attributes (React's style prop) can't carry a nonce; they can't run code.
    "style-src-attr 'unsafe-inline'",
    `img-src ${images.join(' ')}`,
    `font-src 'self'${config.emailPreview ? ` ${GOOGLE_FONTS_FILES}` : ''}`,
    `connect-src ${connect.join(' ')}${config.dev ? ' ws: wss:' : ''}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // No upgrade-insecure-requests: every resource is already https on Vercel (HSTS), and it
    // would break the production build served over http on localhost (Playwright).
  ];
  return directives.join('; ');
}

/** Headers every answer gets (pages and API). */
export function staticSecurityHeaders(dev: boolean): Record<string, string> {
  return {
    ...(dev ? {} : { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/** A fresh, unguessable nonce per request (128 random bits, base64). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
