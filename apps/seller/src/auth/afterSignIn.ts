// What happens right after a successful sign-in (email or Google, decision #107): decide the next
// screen from GET /api/me and load that screen's first data, all while the sign-in screen is
// still showing (its button spinner, or the "Signing you in…" overlay). The screen then leaves
// once, with router.replace, so there's no blank frame and no flash of Welcome or the start
// gate. Pure: the calls are injected. At most PRIME_TIMEOUT_MS (plan §2.2: 15 s + 5 s).
import { OFFLINE_MESSAGE, UNREACHABLE_MESSAGE } from './errors';
import { withTimeout } from './call';
import { startRoute, type Me, type MeResult } from './route';

export const PRIME_TIMEOUT_MS = 5_000;

export interface Destination {
  /** A tab or onboarding step: replaces the sign-in screen. */
  route: string;
  /** A screen opened on top of the tab (state restoration, decision #100). */
  screen: string | null;
}

export type AfterSignIn = { kind: 'go'; to: Destination } | { kind: 'problem'; message: string };

export interface AfterSignInDeps {
  fetchMe: () => Promise<MeResult>;
  /** The tab (and screen) a signed-in seller with a shop opens on. */
  landing: () => Promise<{ tab: string; screen: string | null }>;
  /** Keeps /api/me in memory, so the next screen has the shop at once. */
  primeMe: (me: Me) => void;
  /** Loads Home's first data into its cache. Never throws. */
  primeHome: () => Promise<unknown>;
  /** Loads the onboarding state into memory. Never throws. */
  primeOnboarding: () => Promise<unknown>;
  timeoutMs?: number;
}

export const SIGNED_IN_PROBLEM = "You're signed in, but we couldn't open your shop. Try again.";

export async function afterSignIn(deps: AfterSignInDeps): Promise<AfterSignIn> {
  let destination: Destination | null = null;
  let problem: string | null = null;
  try {
    await withTimeout(
      (async () => {
        const me = await deps.fetchMe();
        const start = startRoute(true, me);
        if (me.kind !== 'ok') {
          problem =
            start.to === 'offline'
              ? OFFLINE_MESSAGE
              : start.to === 'unreachable'
                ? UNREACHABLE_MESSAGE
                : SIGNED_IN_PROBLEM;
          return;
        }
        deps.primeMe(me.me);
        if (start.to === '/home') {
          const { tab, screen } = await deps.landing();
          // Known now: if Home's data is slow, we still go and Home shows its own loading state.
          destination = { route: tab, screen };
          await deps.primeHome();
        } else {
          destination = { route: start.to, screen: null };
          await deps.primeOnboarding();
        }
      })(),
      deps.timeoutMs ?? PRIME_TIMEOUT_MS,
    );
  } catch {
    // Out of time: go if the next screen is known, otherwise say so on this screen.
  }
  if (destination) return { kind: 'go', to: destination };
  return { kind: 'problem', message: problem ?? UNREACHABLE_MESSAGE };
}
