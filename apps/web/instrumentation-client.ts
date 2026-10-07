import { SENTRY_DSN, sentryOptions } from '@/lib/sentryOptions';

// Error reporting in the buyer's browser (M10 CP4, decision #87). The SDK is ~55 KB of gzipped
// JavaScript, so it is loaded only when NEXT_PUBLIC_SENTRY_DSN is set, and only once the page
// is idle: it never delays a buyer's first view (errors in that first moment aren't reported).
// No tracing, no session replay, every event scrubbed first.
if (SENTRY_DSN && process.env.NODE_ENV === 'production') {
  const start = () => {
    import('@sentry/nextjs')
      .then((Sentry) => Sentry.init(sentryOptions('browser')))
      .catch(() => {});
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 2000);
}
