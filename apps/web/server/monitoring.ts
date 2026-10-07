import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { describeError } from './safeLog';

// Unexpected errors from API handlers (M10 CP4, decision #87). toResponse() answers them with a
// plain 500, so Sentry would never see them: this reports them, but never the raw error object
// (a database error's message carries the query's values: names, phones, addresses). Sentry
// gets the same log-safe description as the logs (describeError), with the original stack
// frames, and the scrubber runs on top. A no-op when Sentry isn't set up (tests, local).

export function reportUnexpected(error: unknown): void {
  if (!Sentry.getClient()) return;
  const original = error instanceof Error ? error : null;
  const [summary] = describeError(error).split('\n');
  const safe = new Error(summary);
  safe.name = original?.name ?? 'Error';
  if (original?.stack) {
    // Keep the frames ("at …" lines), drop the first line (the raw message).
    const frames = original.stack.split('\n').filter((line) => line.trimStart().startsWith('at '));
    safe.stack = [`${safe.name}: ${summary}`, ...frames].join('\n');
  }
  Sentry.captureException(safe);
}
