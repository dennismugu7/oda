import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '@/config';

// Better Auth's Expo client (decision #43): the session cookie lives in SecureStore and is
// sent as a Cookie header, with `expo-origin: oda://` (server: the oda:// origin plugin).
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: 'oda', storagePrefix: 'oda', storage: SecureStore }),
    emailOTPClient(),
  ],
});
