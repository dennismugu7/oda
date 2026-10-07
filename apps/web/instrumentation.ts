import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentryOptions';

// Error reporting on the server and edge runtimes (M10 CP4, decision #87): on only with
// NEXT_PUBLIC_SENTRY_DSN, every event scrubbed first (lib/sentryOptions.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') Sentry.init(sentryOptions('server'));
  if (process.env.NEXT_RUNTIME === 'edge') Sentry.init(sentryOptions('edge'));
}

// Errors thrown while rendering pages and in route handlers that don't catch them.
export const onRequestError = Sentry.captureRequestError;
