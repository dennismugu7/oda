// Google sign-in on the phone (decision #107). Every call to the native Google module lives in
// this file, so moving from Google's legacy Android sign-in (the library's free "original" API)
// to Credential Manager changes this file only (docs/v2-ideas.md).
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as Sentry from '@sentry/react-native';
import { GOOGLE_WEB_CLIENT_ID } from '@/config';
import { sentryEnabled } from '@/sentry';

export type GoogleResult =
  | { kind: 'token'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: 'PLAY_SERVICES' | 'IN_PROGRESS' | 'FAILED' };

/** False when this build has no Google client ID: the screens then show no Google button. */
export function googleAvailable(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID;
}

let configured = false;
function configure(): void {
  if (configured || !GOOGLE_WEB_CLIENT_ID) return;
  // An ID token for the Web client (the server's audience); no server auth code, no scopes
  // beyond Google's default email + profile.
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
  configured = true;
}

/** Whether Google Play services can show the account chooser (no update dialog). */
export async function googlePlayServicesReady(): Promise<boolean> {
  try {
    return await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
  } catch {
    return false;
  }
}

/** Opens Google's account chooser and returns its ID token, or why there is none. */
export async function googleSignIn(): Promise<GoogleResult> {
  try {
    configure();
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return { kind: 'cancelled' };
    const idToken = response.data.idToken;
    if (idToken) return { kind: 'token', idToken };
    report('NO_ID_TOKEN');
    return { kind: 'error', code: 'FAILED' };
  } catch (error) {
    const code = isErrorWithCode(error) ? String(error.code) : 'UNKNOWN';
    if (code === statusCodes.SIGN_IN_CANCELLED) return { kind: 'cancelled' };
    if (code === statusCodes.IN_PROGRESS) return { kind: 'error', code: 'IN_PROGRESS' };
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { kind: 'error', code: 'PLAY_SERVICES' };
    }
    // DEVELOPER_ERROR (10) usually means this build's signing key isn't registered with Google.
    report(code);
    return { kind: 'error', code: 'FAILED' };
  }
}

/**
 * Forgets the Google account on this phone (not on Google), so the next tap shows the chooser
 * again instead of reusing the last account. Never throws.
 */
export async function googleSignOut(): Promise<void> {
  if (!GOOGLE_WEB_CLIENT_ID) return;
  try {
    configure();
    await GoogleSignin.signOut();
  } catch {
    // Nothing to forget, or Play services missing: either way the next tap asks again.
  }
}

/** Only the native error code goes to Sentry: never a token, email or name. */
function report(code: string): void {
  if (sentryEnabled) Sentry.captureMessage(`google sign-in failed: ${code}`, 'warning');
}
