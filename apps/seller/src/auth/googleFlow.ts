// Google sign-in from tap to next screen (decision #107, plan §2.2), pure so every path is
// tested. Time limits: the network and Play services checks get 3 s each before Google's sheet
// opens; the sheet waits for the seller; once an account is picked, the server call gets 15 s and
// finishing (GET /api/me + the next screen's data) 5 s, so no wait after the sheet is longer
// than 20 s. Every path ends in navigation, silence (cancelled) or one message.
import { capCall, CALL_TIMEOUT_MS, withTimeout, type CallResult } from './call';
import { friendlyAuthError, OFFLINE_MESSAGE } from './errors';
import type { GoogleResult } from './google';

export const PRECHECK_TIMEOUT_MS = 3_000;

export const PLAY_SERVICES_MESSAGE =
  'Google sign-in needs Google Play services on this phone. Sign in with your email instead.';
export const GOOGLE_FAILED_MESSAGE =
  "Google sign-in isn't working right now. Sign in with your email instead.";

export interface GoogleFlowDeps {
  isOnline: () => Promise<boolean>;
  playServicesReady: () => Promise<boolean>;
  /** Google's account sheet: waits for the seller (the only wait without a limit). */
  pickAccount: () => Promise<GoogleResult>;
  /** POST /api/auth/sign-in/social with the ID token (stores the session cookie). */
  sendIdToken: (idToken: string) => Promise<CallResult<unknown>>;
  /** Next screen decided, preloaded and opened; or a message (src/auth/finishSignIn.ts). */
  finish: () => Promise<string | null>;
  /** Forget the Google account on this phone, so the next tap shows the chooser. */
  forgetAccount: () => Promise<void>;
  callTimeoutMs?: number;
}

export type GoogleFlowEnd =
  { kind: 'done' } | { kind: 'cancelled' } | { kind: 'error'; message: string };

const fail = (message: string): GoogleFlowEnd => ({ kind: 'error', message });

export async function runGoogleFlow(
  deps: GoogleFlowDeps,
  /** Called once the account is picked: the screen shows "Signing you in…". */
  onSigningIn: () => void,
): Promise<GoogleFlowEnd> {
  // Before the sheet: no point choosing an account to then fail offline.
  let online = true;
  try {
    online = await withTimeout(deps.isOnline(), PRECHECK_TIMEOUT_MS);
  } catch {
    online = true; // can't tell: the server call has its own limit
  }
  if (!online) return fail(OFFLINE_MESSAGE);

  let ready = false;
  try {
    ready = await withTimeout(deps.playServicesReady(), PRECHECK_TIMEOUT_MS);
  } catch {
    return fail(GOOGLE_FAILED_MESSAGE);
  }
  if (!ready) return fail(PLAY_SERVICES_MESSAGE);

  let picked: GoogleResult;
  try {
    picked = await deps.pickAccount();
  } catch {
    return fail(GOOGLE_FAILED_MESSAGE);
  }
  if (picked.kind === 'cancelled') return { kind: 'cancelled' };
  if (picked.kind === 'error') {
    if (picked.code === 'IN_PROGRESS') return { kind: 'cancelled' }; // the first sheet is still open
    return fail(picked.code === 'PLAY_SERVICES' ? PLAY_SERVICES_MESSAGE : GOOGLE_FAILED_MESSAGE);
  }

  onSigningIn();
  // The whole call, its own network check included, within 15 s.
  const sent = await capCall(
    deps.sendIdToken(picked.idToken),
    deps.callTimeoutMs ?? CALL_TIMEOUT_MS,
  );
  if (sent.error) {
    void deps.forgetAccount();
    return fail(friendlyAuthError(sent.error).message);
  }
  // Signed in: from here only finish() (5 s at most) stands between the seller and their shop.
  const problem = await deps.finish();
  return problem ? fail(problem) : { kind: 'done' };
}
