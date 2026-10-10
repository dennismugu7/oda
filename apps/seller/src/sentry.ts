// Error reporting with Sentry (M10 CP4, decisions #70, #81 b, #85). Off unless the build has
// EXPO_PUBLIC_SENTRY_DSN (EAS "preview" and "production" environments; a DSN is a public key)
// and is not a development build. sendDefaultPii is off and every event and breadcrumb goes
// through the shared scrubber first (no emails, phones, M-Pesa codes, tokens, bodies). The
// native module is in build 0.3.0 already; this is JavaScript only (an EAS Update).
import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubEvent } from '@oda/shared';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || null;

export const sentryEnabled = !!DSN && !__DEV__;

/** What the app reports as its version: the native version and the EAS Update it runs. */
export function appVersion(): { version: string; update: string; channel: string } {
  return {
    version: Constants.expoConfig?.version ?? '?',
    update: Updates.updateId ? Updates.updateId.slice(0, 8) : 'built-in',
    channel: Updates.channel || 'none',
  };
}

export function initSentry(): void {
  if (!sentryEnabled) return;
  const { version, channel } = appVersion();
  Sentry.init({
    dsn: DSN!,
    sendDefaultPii: false,
    environment: channel, // preview or production (the EAS Update channel)
    // Errors point at the exact JavaScript: the native version plus the EAS Update id (source
    // maps for each update are uploaded under the same release and dist).
    release: `oda-seller@${version}`,
    dist: Updates.updateId ?? 'embedded',
    tracesSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

/** Wraps the root component so render errors are reported (a no-op when Sentry is off). */
export const wrapRoot = (component: React.ComponentType<Record<string, unknown>>) =>
  sentryEnabled ? Sentry.wrap(component) : component;

/** Staging only: a deliberate error to check reporting end to end (review stop B). */
export const canSendTestError = sentryEnabled && !/production/i.test(appVersion().channel);

export function sendTestError(): void {
  if (!canSendTestError) return;
  Sentry.captureException(new Error('oda test error (sent from Help on purpose)'));
}
