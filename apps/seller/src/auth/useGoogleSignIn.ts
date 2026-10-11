// The Google button's state on Sign in and Sign up (decision #107, plan §2.2):
// idle → starting (the button's own spinner, set in the same handler as the tap; covers the
// checks and Google's sheet) → signing-in (the "Signing you in…" overlay, from the moment an
// account is picked until the next screen replaces this one) → back to idle with a message, or
// silently when the sheet was closed.
import { useCallback, useRef, useState } from 'react';
import { isOnline } from '@/net';
import { authCall, authClient } from './client';
import { finishSignIn } from './finishSignIn';
import { googlePlayServicesReady, googleSignIn, googleSignOut } from './google';
import { runGoogleFlow } from './googleFlow';

export type GooglePhase = 'idle' | 'starting' | 'signing-in';

export function useGoogleSignIn() {
  const [phase, setPhase] = useState<GooglePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const start = useCallback(() => {
    if (running.current) return; // a second tap does nothing
    running.current = true;
    setError(null);
    setPhase('starting');
    runGoogleFlow(
      {
        isOnline,
        playServicesReady: googlePlayServicesReady,
        pickAccount: googleSignIn,
        sendIdToken: (token) =>
          authCall(() => authClient.signIn.social({ provider: 'google', idToken: { token } })),
        finish: finishSignIn,
        forgetAccount: googleSignOut,
      },
      () => setPhase('signing-in'),
    ).then((end) => {
      // Done: this screen is being replaced; the overlay stays until it unmounts.
      if (end.kind === 'done') return;
      running.current = false;
      setPhase('idle');
      if (end.kind === 'error') setError(end.message);
    });
  }, []);

  return { phase, busy: phase !== 'idle', error, start };
}
