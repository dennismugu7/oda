// The restore store on this phone: SecureStore (encrypted, already in the native build; no
// new native module). Drafts and the last screen never leave the phone (decision #100).
import * as SecureStore from 'expo-secure-store';
import { createRestoreStore } from './store';

export const restoreStore = createRestoreStore({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
});
