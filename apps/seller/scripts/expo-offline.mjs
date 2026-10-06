// Runs an Expo tool against the Expo SDK that is INSTALLED (EXPO_OFFLINE=1: its
// bundledNativeModules.json), not Expo's online list (decision #80): a new SDK patch on npm must
// not fail every branch's checks. Used by `deps:check` (expo install --check) and `doctor`
// (expo-doctor). A package that doesn't match our SDK still fails. Newer SDK patches are a
// planned upgrade (version bump + native build), checked online then.
//   node scripts/expo-offline.mjs expo install --check
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/expo-offline.mjs <command> [args…]');
  process.exit(2);
}
const result = spawnSync('pnpm', ['exec', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXPO_OFFLINE: '1' },
});
process.exit(result.status ?? 1);
