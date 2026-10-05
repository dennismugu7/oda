// The seller app's calls to /api/me/push-tokens and the SecureStore copy of this phone's token.
import * as SecureStore from 'expo-secure-store';
import { apiJson } from '@/api';
import type { PushServer, TokenStore } from './session';

const KEY = 'oda_push_token';

export const pushServer: PushServer = {
  register: async (token) =>
    !(await apiJson<object>('/api/me/push-tokens', { body: { token } })).error,
  unregister: async (token) =>
    !(await apiJson<object>('/api/me/push-tokens', { method: 'DELETE', body: { token } })).error,
};

export const tokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(KEY).catch(() => null),
  set: (token) => SecureStore.setItemAsync(KEY, token).catch(() => {}),
  clear: () => SecureStore.deleteItemAsync(KEY).catch(() => {}),
};
