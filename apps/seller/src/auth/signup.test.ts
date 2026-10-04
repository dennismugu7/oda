// Sign-up attempts on the phone (decision #49): the attempt id lives in SecureStore until the
// code is entered, so a killed app reopens on the code screen; it's cleared on verify,
// expiry and sign-out. Real modules, React Native and Expo mocked, a fake oda server.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = new Map<string, string>();
let online = true;

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
  getNetworkStateAsync: async () => ({ isConnected: online, isInternetReachable: online }),
  addNetworkStateListener: () => ({ remove() {} }),
}));
vi.mock('expo-secure-store', () => ({
  getItem: (k: string) => secureStore.get(k) ?? null,
  getItemAsync: async (k: string) => secureStore.get(k) ?? null,
  setItem: (k: string, v: string) => void secureStore.set(k, v),
  setItemAsync: async (k: string, v: string) => void secureStore.set(k, v),
  deleteItemAsync: async (k: string) => void secureStore.delete(k),
}));

const EMAIL = 'amani@example.test';
const PASSWORD = 'kitenge2026';
const TOKEN = 'sess_abc.signature';
const COOKIE = `__Secure-better-auth.session_token=${TOKEN}`;

interface FakeState {
  attempts: Map<string, { email: string; password: string }>;
  accounts: Map<string, string>;
  starts: { attemptId?: string }[];
}

function fakeServer(state: FakeState) {
  let next = 1;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const cookie = new Headers(init?.headers).get('cookie') ?? '';
    const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      });
    switch (url.pathname) {
      case '/api/signup/start': {
        state.starts.push({ attemptId: body.attemptId });
        const known = body.attemptId && state.attempts.get(body.attemptId);
        const attemptId = known ? body.attemptId : `attempt-${next++}`;
        state.attempts.set(attemptId, { email: body.email, password: body.password });
        return json({
          attemptId,
          email: body.email,
          resumed: !!known,
          retryAfter: 0,
          codeSent: true,
        });
      }
      case '/api/signup/verify': {
        const attempt = state.attempts.get(body.attemptId);
        if (!attempt) {
          return json(
            { error: { code: 'not_found', message: 'This sign-up has expired. Start again.' } },
            404,
          );
        }
        if (body.code !== '482913') {
          return json({ error: { code: 'INVALID_OTP', message: 'Invalid' } }, 422);
        }
        state.accounts.set(attempt.email, attempt.password);
        state.attempts.clear();
        return json({ email: attempt.email });
      }
      case '/api/auth/sign-in/email':
        return state.accounts.get(body.email) === body.password
          ? json({ token: TOKEN, user: { email: body.email } }, 200, {
              'set-cookie': `${COOKIE}; Max-Age=5184000; Path=/; HttpOnly; Secure; SameSite=Lax`,
            })
          : json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401);
      case '/api/auth/sign-out':
        return json({ success: true }, 200, {
          'set-cookie': '__Secure-better-auth.session_token=; Max-Age=0; Path=/',
        });
      case '/api/auth/get-session':
        return json(
          cookie.includes(COOKIE) ? { session: { token: TOKEN }, user: { email: EMAIL } } : null,
        );
      case '/api/me':
        return cookie.includes(COOKIE)
          ? json({
              email: EMAIL,
              emailVerified: true,
              onboarding: { step: 1, done: false },
              shop: null,
            })
          : new Response(null, { status: 401 });
      default:
        return new Response(null, { status: 404 });
    }
  });
}

let state: FakeState;

beforeEach(() => {
  secureStore.clear();
  online = true;
  state = { attempts: new Map(), accounts: new Map(), starts: [] };
  vi.resetModules();
  vi.stubGlobal('fetch', fakeServer(state));
});

async function loadApp() {
  const signup = await import('./signup');
  const client = await import('./client');
  const { fetchMe } = await import('../api');
  const { resolveStart } = await import('./start');
  const gate = () =>
    resolveStart({
      getCookie: () => client.authClient.getCookie(),
      fetchMe,
      signOutLocal: client.signOutLocal,
      getPendingSignup: signup.getPendingSignup,
    });
  return { ...signup, ...client, gate };
}

describe('sign-up in progress on the phone', () => {
  it('a killed app reopens on the code screen for the same attempt', async () => {
    let app = await loadApp();
    const started = await app.startSignup(EMAIL, PASSWORD);
    expect(started.data?.attemptId).toBe('attempt-1');

    vi.resetModules(); // the app is killed; SecureStore survives
    app = await loadApp();
    expect(await app.gate()).toEqual({ to: '/verify', email: EMAIL });
    expect(await app.getPendingSignup()).toEqual({ attemptId: 'attempt-1', email: EMAIL });
  });

  it('signing up again with the same email resumes this attempt; another email starts a new one', async () => {
    const app = await loadApp();
    await app.startSignup(EMAIL, 'first-pass-1');
    const again = await app.startSignup(EMAIL, PASSWORD);
    expect(again.data).toMatchObject({ attemptId: 'attempt-1', resumed: true });
    await app.startSignup('other@example.test', PASSWORD);
    expect(state.starts.map((s) => s.attemptId)).toEqual([undefined, 'attempt-1', undefined]);
  });

  it('the right code clears the attempt; signing in with the typed password lands on the placeholder', async () => {
    const app = await loadApp();
    const { data } = await app.startSignup(EMAIL, PASSWORD);
    const verified = await app.verifySignupCode(data!.attemptId, '482913');
    expect(verified.error).toBeNull();
    expect(await app.getPendingSignup()).toBeNull();

    const password = app.passwordFor(EMAIL);
    expect(password).toBe(PASSWORD);
    const signedIn = await app.authCall(() =>
      app.authClient.signIn.email({ email: EMAIL, password: password! }),
    );
    expect(signedIn.error).toBeNull();
    expect(await app.gate()).toEqual({ to: '/start' });
  });

  it('after a restart the password is gone (never stored): the seller signs in once', async () => {
    let app = await loadApp();
    const { data } = await app.startSignup(EMAIL, PASSWORD);
    vi.resetModules();
    app = await loadApp();
    expect((await app.verifySignupCode(data!.attemptId, '482913')).error).toBeNull();
    expect(app.passwordFor(EMAIL)).toBeNull();
    expect([...secureStore.values()].join()).not.toContain(PASSWORD);
  });

  it('an expired attempt is forgotten', async () => {
    const app = await loadApp();
    const { data } = await app.startSignup(EMAIL, PASSWORD);
    state.attempts.clear(); // e.g. deleted after 7 days
    const result = await app.verifySignupCode(data!.attemptId, '482913');
    expect(result.error).toMatchObject({ status: 404, code: 'not_found' });
    expect(await app.getPendingSignup()).toBeNull();
    expect(await app.gate()).toEqual({ to: '/welcome' });
  });

  it('a wrong code keeps the attempt', async () => {
    const app = await loadApp();
    const { data } = await app.startSignup(EMAIL, PASSWORD);
    expect((await app.verifySignupCode(data!.attemptId, '000000')).error?.code).toBe('INVALID_OTP');
    expect(await app.getPendingSignup()).not.toBeNull();
  });

  it('sign-out clears the attempt', async () => {
    const app = await loadApp();
    await app.startSignup(EMAIL, PASSWORD);
    await app.signOutLocal();
    expect(await app.getPendingSignup()).toBeNull();
    expect(await app.gate()).toEqual({ to: '/welcome' });
  });

  it('offline: nothing is sent or stored, and the message says so', async () => {
    online = false;
    const app = await loadApp();
    const result = await app.startSignup(EMAIL, PASSWORD);
    expect(result.error).toEqual({ status: 0, code: 'OFFLINE' });
    expect(state.starts).toHaveLength(0);
    expect(await app.getPendingSignup()).toBeNull();
  });
});
