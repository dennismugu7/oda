// Step 47, fix 3: after the right code the seller must land in the app (signed in: onboarding step 1),
// also after killing and reopening the app. Runs the real Better Auth Expo client (session
// cookie in SecureStore) against a fake oda server, with React Native and Expo mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = new Map<string, string>();

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { scheme: 'oda' }, platform: {} } }));
vi.mock('expo-linking', () => ({
  createURL: (path: string, opts?: { scheme?: string }) =>
    `${opts?.scheme ?? 'oda'}://${path.replace(/^\//, '')}`,
}));
vi.mock('expo-web-browser', () => ({}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: () => ({ remove() {} }),
}));
vi.mock('expo-secure-store', () => ({
  getItem: (k: string) => secureStore.get(k) ?? null,
  getItemAsync: async (k: string) => secureStore.get(k) ?? null,
  setItem: (k: string, v: string) => void secureStore.set(k, v),
  setItemAsync: async (k: string, v: string) => void secureStore.set(k, v),
  deleteItemAsync: async (k: string) => void secureStore.delete(k),
}));

const TOKEN = 'sess_abc.signature';
const ME = {
  email: 'amani@example.test',
  emailVerified: true,
  onboarding: { step: 1, done: false },
  shop: null,
};

/** Fake oda server: verify-email signs in with a cookie; /api/me needs that cookie. */
function fakeServer() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : ((input as Request).url ?? String(input)),
    );
    const headers = new Headers(init?.headers ?? (input as Request).headers);
    const cookie = headers.get('cookie') ?? '';
    const signedIn = cookie.includes(`__Secure-better-auth.session_token=${TOKEN}`);
    switch (url.pathname) {
      case '/api/auth/email-otp/verify-email':
        return new Response(
          JSON.stringify({ status: true, token: TOKEN, user: { email: ME.email } }),
          {
            headers: {
              'content-type': 'application/json',
              // What staging sends (https → __Secure- prefix), 60 days.
              'set-cookie': `__Secure-better-auth.session_token=${TOKEN}; Max-Age=5184000; Path=/; HttpOnly; Secure; SameSite=Lax`,
            },
          },
        );
      case '/api/auth/get-session':
        return Response.json(signedIn ? { session: { token: TOKEN }, user: ME } : null);
      case '/api/me':
        return signedIn ? Response.json(ME) : new Response(null, { status: 401 });
      default:
        return new Response(null, { status: 404 });
    }
  });
}

beforeEach(() => {
  secureStore.clear();
  vi.resetModules();
  vi.stubGlobal('fetch', fakeServer());
});

async function loadApp() {
  const client = await import('./client');
  const { fetchMe } = await import('../api');
  const { resolveStart } = await import('./start');
  const gate = () =>
    resolveStart({
      getCookie: () => client.authClient.getCookie(),
      fetchMe,
      signOutLocal: client.signOutLocal,
    });
  return { ...client, gate };
}

describe('after the right code', () => {
  it('stores the session cookie before verifyEmail resolves', async () => {
    const { authClient, authCall } = await loadApp();
    const { error } = await authCall(() =>
      authClient.emailOtp.verifyEmail({ email: ME.email, otp: '482913' }),
    );
    expect(error).toBeNull();
    expect(await authClient.getCookie()).toContain(`session_token=${TOKEN}`);
  });

  it('opens on onboarding, not Welcome', async () => {
    const { authClient, authCall, gate } = await loadApp();
    await authCall(() => authClient.emailOtp.verifyEmail({ email: ME.email, otp: '482913' }));

    // The cause of the bug: Better Auth's session atom only refreshes ~10 ms later, so a gate
    // that read it right after the code saw "signed out" and went to Welcome.
    expect(authClient.$store.atoms.session!.get().data).toBeNull();

    expect(await gate()).toEqual({ to: '/onboarding/what-you-sell' });
  });

  it('stays signed in after the app is killed and reopened', async () => {
    let app = await loadApp();
    await app.authCall(() =>
      app.authClient.emailOtp.verifyEmail({ email: ME.email, otp: '482913' }),
    );
    vi.resetModules(); // a fresh JS runtime; SecureStore survives
    app = await loadApp();
    expect(await app.gate()).toEqual({ to: '/onboarding/what-you-sell' });
  });

  it('goes to Welcome without a session, and forgets a session the server rejects', async () => {
    let app = await loadApp();
    expect(await app.gate()).toEqual({ to: '/welcome' });

    secureStore.set(
      'oda_cookie',
      JSON.stringify({ '__Secure-better-auth.session_token': { value: 'revoked', expires: null } }),
    );
    app = await loadApp();
    expect(await app.gate()).toEqual({ to: '/welcome' });
    expect(secureStore.has('oda_cookie')).toBe(false);
  });
});
