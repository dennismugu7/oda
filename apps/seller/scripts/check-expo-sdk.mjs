// `expo install --check` against the Expo SDK that is INSTALLED (its bundledNativeModules.json),
// not Expo's online list (owner Step 87): a new SDK patch on npm must not break every branch's
// check. Upgrading to newer SDK patches is a planned step (it changes native code: version bump
// + native build). Still fails when an installed package doesn't match our SDK.
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['exec', 'expo', 'install', '--check'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXPO_OFFLINE: '1' },
});
process.exit(result.status ?? 1);
