// The app side of afterSignIn (src/auth/afterSignIn.ts): the real calls, caches and navigation.
// Used by Sign in (email and Google) and Sign up (Google).
import { router, type Href } from 'expo-router';
import { fetchMe } from '@/api';
import { homeApi, homeCache } from '@/home/api';
import { onboardingApi } from '@/onboarding/api';
import { clearOnboardingState, setOnboardingState } from '@/onboarding/useOnboarding';
import { ordersApi, ordersCache } from '@/orders/api';
import { landing } from '@/restore/start';
import { afterSignIn } from './afterSignIn';
import { clearPendingSignup } from './signup';
import { meCache } from './useMe';

/**
 * Decides and preloads the next screen, then leaves the sign-in screen once. Returns null after
 * navigating, or a message to show on the same screen (nothing navigates then).
 */
export async function finishSignIn(): Promise<string | null> {
  // Whoever is signed in now: no earlier account's onboarding answers or sign-up in progress.
  clearOnboardingState();
  // Not awaited: nothing outside afterSignIn's 5 s may hold the seller up.
  void clearPendingSignup().catch(() => {});
  const next = await afterSignIn({
    fetchMe,
    landing,
    primeMe: (me) => meCache.set(me),
    primeHome: async () => {
      const [home, todo] = await Promise.all([homeApi.get(), ordersApi.list('todo')]);
      if (home.data) homeCache.set(home.data);
      if (todo.data) ordersCache.setList('todo', todo.data);
    },
    primeOnboarding: async () => {
      const { data } = await onboardingApi.get();
      if (data) setOnboardingState(data);
    },
  });
  if (next.kind === 'problem') return next.message;
  router.replace(next.to.route as Href);
  if (next.to.screen) router.push(next.to.screen as Href);
  return null;
}
