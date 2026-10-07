import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  newNonce,
  staticSecurityHeaders,
  uploadOrigins,
} from './securityHeaders';

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy', () => {
  const staging = {
    storagePublicBaseUrl: 'https://abc123.public.blob.vercel-storage.com/',
    storageDriver: 'vercel-blob',
    dev: false,
  };

  it('scripts and styles only with the nonce; no eval, plugins, frames or framing', () => {
    const csp = contentSecurityPolicy('n0nce', staging);
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'nonce-n0nce' 'strict-dynamic'");
    expect(directive(csp, 'style-src')).toBe("style-src 'self' 'nonce-n0nce'");
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    for (const d of ["object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'"]) {
      expect(csp).toContain(d);
    }
    expect(directive(csp, 'form-action')).toBe("form-action 'self'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
  });

  it('images from the configured store; uploads to the driver’s endpoint only', () => {
    const csp = contentSecurityPolicy('n', staging);
    expect(directive(csp, 'img-src')).toBe(
      "img-src 'self' data: blob: https://abc123.public.blob.vercel-storage.com",
    );
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://vercel.com");
  });

  it('R2 (s3 driver): the account endpoint and its bucket subdomains', () => {
    expect(
      uploadOrigins({
        storageDriver: 's3',
        s3Endpoint: 'https://acc.r2.cloudflarestorage.com',
        dev: false,
      }),
    ).toEqual(['https://acc.r2.cloudflarestorage.com', 'https://*.acc.r2.cloudflarestorage.com']);
  });

  it('local: same origin only; development allows eval and the dev server socket', () => {
    const csp = contentSecurityPolicy('n', { storageDriver: 'local', dev: true });
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' ws: wss:");
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob:");
  });

  it('only the local email outbox may load the Google Fonts stylesheet', () => {
    const page = contentSecurityPolicy('n', { dev: false });
    expect(page).not.toContain('fonts.g');
    const outbox = contentSecurityPolicy('n', { dev: false, emailPreview: true });
    expect(directive(outbox, 'style-src')).toBe(
      "style-src 'self' 'nonce-n' https://fonts.googleapis.com",
    );
    expect(directive(outbox, 'font-src')).toBe("font-src 'self' https://fonts.gstatic.com");
    expect(directive(outbox, 'script-src')).toBe(directive(page, 'script-src'));
  });

  it('the browser may report errors to Sentry’s ingest host, and nothing else new', () => {
    const csp = contentSecurityPolicy('n', {
      ...staging,
      sentryIngest: 'https://o123.ingest.de.sentry.io',
    });
    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://vercel.com https://o123.ingest.de.sentry.io",
    );
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'nonce-n' 'strict-dynamic'");
  });

  it('a broken storage URL adds nothing', () => {
    const csp = contentSecurityPolicy('n', { storagePublicBaseUrl: 'not a url', dev: false });
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob:");
  });
});

describe('other headers', () => {
  it('HSTS outside development, and the fixed set', () => {
    const prod = staticSecurityHeaders(false);
    expect(prod['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(prod['X-Content-Type-Options']).toBe('nosniff');
    expect(prod['X-Frame-Options']).toBe('DENY');
    expect(prod['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(prod['Permissions-Policy']).toContain('geolocation=()');
    expect(staticSecurityHeaders(true)['Strict-Transport-Security']).toBeUndefined();
  });

  it('nonces are random, 128 bits', () => {
    const a = newNonce();
    expect(Buffer.from(a, 'base64')).toHaveLength(16);
    expect(newNonce()).not.toBe(a);
  });
});
