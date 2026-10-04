// Where the app opens (start gate). It reads the stored session cookie and asks GET /api/me;
// it never waits on Better Auth's session atom, which refreshes ~10 ms after a sign-in or a
// verified code and made the gate send freshly verified sellers to Welcome (Step 47, fix 3).
import { withTimeout } from './call';
import { startRoute, type MeResult, type StartRoute } from './route';

export interface StartDeps {
  /** The session cookie from SecureStore (empty when signed out). */
  getCookie: () => Promise<string | null | undefined>;
  fetchMe: () => Promise<MeResult>;
  /** Forget a session the server no longer accepts. */
  signOutLocal: () => Promise<void>;
  /** This phone's sign-up in progress (decision #49), if any. */
  getPendingSignup?: () => Promise<{ email: string } | null>;
}

export const START_TIMEOUT_MS = 20_000;

export async function resolveStart(deps: StartDeps): Promise<StartRoute> {
  try {
    return await withTimeout(decide(deps), START_TIMEOUT_MS);
  } catch {
    return { to: 'unreachable' };
  }
}

async function decide(deps: StartDeps): Promise<StartRoute> {
  const cookie = await deps.getCookie();
  const hasSession = !!cookie && /session_token=/.test(cookie);
  if (!hasSession) {
    // A killed app reopens on the code screen of its sign-up in progress.
    const pending = await deps.getPendingSignup?.();
    return pending ? { to: '/verify', email: pending.email } : startRoute(false, null);
  }
  const me = await deps.fetchMe();
  if (me.kind === 'signed-out') await deps.signOutLocal().catch(() => {});
  return startRoute(true, me);
}
