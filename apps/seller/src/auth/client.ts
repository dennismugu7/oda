import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '@/config';
import { isOnline } from '@/net';
import { CALL_TIMEOUT_MS, guardedCall, type CallResult } from './call';
import type { AuthError } from './errors';

// Better Auth's Expo client (decision #43): the session cookie lives in SecureStore and is
// sent as a Cookie header, with `expo-origin: oda://` (server: the oda:// origin plugin).
const STORAGE_PREFIX = 'oda';

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { timeout: CALL_TIMEOUT_MS },
  plugins: [
    expoClient({ scheme: 'oda', storagePrefix: STORAGE_PREFIX, storage: SecureStore }),
    emailOTPClient(),
  ],
});

/**
 * Runs a Better Auth call with the offline check and the 15 s timeout (src/auth/call.ts).
 * Screens use this for every auth action, so a lost connection shows a message, never an
 * endless spinner.
 */
export function authCall<T>(
  run: () => Promise<{ data?: T | null; error?: AuthError | null }>,
): Promise<CallResult<T>> {
  return guardedCall(run, { isOnline });
}

/**
 * Signs out on this phone even when the server can't be told (expired or revoked session,
 * no network): asks the server, then removes the stored cookie and session cache.
 */
export async function signOutLocal(): Promise<void> {
  await guardedCall(() => authClient.signOut(), { isOnline });
  await SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_cookie`).catch(() => {});
  await SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_session_data`).catch(() => {});
}
