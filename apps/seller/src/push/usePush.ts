// Push in the running app (decision #65 a): register this phone once the seller reaches the
// tabs (right after sign-in), and open the order (or, for a new review, the Reviews screen at
// that review) when a notification is tapped — also when the tap started the app.
import { pushRoute } from '@oda/shared';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { nativePushDevice } from './native';
import { pushServer, tokenStore } from './server';
import { registerThisPhone } from './session';

let registered = false;

/** Registers this phone's token once per app run (best effort; no UI). */
export function usePushRegistration() {
  useEffect(() => {
    if (registered) return;
    registered = true;
    registerThisPhone(nativePushDevice, tokenStore, pushServer).then(
      (result) => {
        if (result !== 'registered') registered = false;
      },
      () => {
        registered = false;
      },
    );
  }, []);
}

/** Forget the "registered" flag on sign-out, so the next account registers again. */
export function resetPushRegistration() {
  registered = false;
}

/** Tapping a notification opens that order's detail, or the review (M7). */
export function usePushTaps() {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const route = pushRoute(response.notification.request.content.data);
    if (route) router.push(route);
  }, [response]);
}
