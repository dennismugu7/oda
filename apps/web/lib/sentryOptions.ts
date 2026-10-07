// Sentry options shared by the server, edge and browser runtimes (M10 CP4, decisions #81 b, #87).
// Off unless NEXT_PUBLIC_SENTRY_DSN is set (a DSN is a public key; Vercel Production and
// Preview). Privacy first: sendDefaultPii off, every event and breadcrumb through the shared
// scrubber (packages/shared/src/sentry.ts), no tracing, no session replay.
import { scrubBreadcrumb, scrubEvent } from '@oda/shared';

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

export function sentryOptions(runtime: 'server' | 'edge' | 'browser') {
  return {
    dsn: SENTRY_DSN,
    enabled: !!SENTRY_DSN && process.env.NODE_ENV === 'production',
    // Vercel: "production" for staging (until M11), "preview" for branch previews.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? 'local',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    initialScope: { tags: { runtime } },
    beforeSend: <T>(event: T) => scrubEvent(event),
    beforeSendTransaction: <T>(event: T) => scrubEvent(event),
    beforeBreadcrumb: <T>(breadcrumb: T) => scrubBreadcrumb(breadcrumb),
  };
}

/** The ingest origin the browser posts errors to, for the Content-Security-Policy. */
export function sentryIngestOrigin(dsn: string | undefined = SENTRY_DSN): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}
