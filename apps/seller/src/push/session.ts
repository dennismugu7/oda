// Push on this phone (decision #65 a): the Expo push token is registered with the server on
// sign-in (after the Android 13+ permission prompt) and removed on sign-out, so a phone that
// signs out gets no more pushes. Pure orchestration over small interfaces, so it is unit-tested
// without the native module; the expo-notifications adapter joins with the 0.3.0 build.

export type Permission = 'granted' | 'denied' | 'undetermined';

/** What the notifications module can do on this phone. */
export interface PushDevice {
  permission(): Promise<Permission>;
  /** Shows the system prompt; true when allowed. */
  request(): Promise<boolean>;
  /** This phone's Expo push token, or null (no Play services, no network…). */
  token(): Promise<string | null>;
}

/** Where this phone remembers the token it registered (SecureStore in the app). */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PushServer {
  register(token: string): Promise<boolean>;
  unregister(token: string): Promise<boolean>;
}

export type RegisterResult = 'registered' | 'denied' | 'no_token' | 'failed';

/** After sign-in: ask once if needed, then send the token (again, if it changed). */
export async function registerThisPhone(
  device: PushDevice,
  store: TokenStore,
  server: PushServer,
): Promise<RegisterResult> {
  let permission = await device.permission();
  if (permission === 'undetermined') permission = (await device.request()) ? 'granted' : 'denied';
  if (permission !== 'granted') return 'denied';
  const token = await device.token();
  if (!token) return 'no_token';
  // Always tell the server: the token may have moved to this account from another one.
  if (!(await server.register(token))) return 'failed';
  await store.set(token);
  return 'registered';
}

/**
 * Before sign-out (while the session still works): remove this phone's token from the
 * account. Best effort; the local copy is forgotten either way.
 */
export async function unregisterThisPhone(store: TokenStore, server: PushServer): Promise<void> {
  const token = await store.get();
  if (!token) return;
  await server.unregister(token).catch(() => false);
  await store.clear();
}
