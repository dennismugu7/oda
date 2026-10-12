// Signing out on this phone (More, Settings → Log out, and after deleting the account):
// this phone stops getting pushes, the stored session goes, and every in-memory copy of the
// seller's data is emptied so another account on this phone never sees it.
import { signOutLocal } from '@/auth/client';
import { googleSignOut } from '@/auth/google';
import { meCache } from '@/auth/useMe';
import { deliveryCache } from '@/delivery/api';
import { homeCache, notificationsCache } from '@/home/api';
import { clearOnboardingState } from '@/onboarding/useOnboarding';
import { ordersCache } from '@/orders/api';
import { pushServer, tokenStore } from '@/push/server';
import { unregisterThisPhone } from '@/push/session';
import { resetPushRegistration } from '@/push/usePush';
import { reviewsCache } from '@/reviews/cache';
import { insightsCache } from '@/insights/cache';
import { paymentsCache } from './api';
import { clearSettingsCaches } from './useLoaded';

export async function signOutOnThisPhone(): Promise<void> {
  // Asked while the session still works (decision #65 a).
  await unregisterThisPhone(tokenStore, pushServer);
  resetPushRegistration();
  // Works offline too: the stored session is removed either way.
  await signOutLocal();
  // The next Google sign-in asks which account again (shared phones; decision #107).
  await googleSignOut();
  clearOnboardingState();
  meCache.set(null);
  ordersCache.clear();
  deliveryCache.set(null);
  homeCache.set(null);
  notificationsCache.set(null);
  reviewsCache.clear();
  paymentsCache.set(null);
  clearSettingsCaches();
  insightsCache.clear();
}
