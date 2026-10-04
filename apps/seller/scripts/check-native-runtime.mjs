// Guards EAS Update's `appVersion` runtime policy (decision #48): a JS update reaches every
// build with the same app version, so the version MUST change whenever native code does.
// This compares the app's native modules (direct dependencies with Android code) and its
// app config (plugins, package, icons…) with native-runtime.json, the snapshot taken at the
// current version. A native change without a version bump fails; after a bump, refresh the
// snapshot with `node scripts/check-native-runtime.mjs --write`.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(app, 'package.json'));
const snapshotPath = resolve(app, 'native-runtime.json');

const pkg = JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8'));
const config = readFileSync(resolve(app, 'app.config.ts'), 'utf8').replace(/\r\n/g, '\n');
const version = /^\s*version:\s*'([^']+)'/m.exec(config)?.[1];
if (!version) {
  console.error('Could not read `version` from app.config.ts');
  process.exit(1);
}

/** Direct dependencies that ship Android code (autolinked native modules). */
function nativeModules() {
  const native = {};
  for (const name of Object.keys(pkg.dependencies ?? {}).sort()) {
    let dir;
    try {
      dir = dirname(require.resolve(`${name}/package.json`));
    } catch {
      continue;
    }
    const isNative =
      existsSync(resolve(dir, 'android')) ||
      existsSync(resolve(dir, 'ReactAndroid')) || // react-native itself
      existsSync(resolve(dir, 'expo-module.config.json'));
    if (isNative)
      native[name] = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).version;
  }
  return native;
}

const current = {
  version,
  // The whole app config: almost every change to it reaches the native project via prebuild.
  appConfigSha256: createHash('sha256').update(config).digest('hex'),
  nativeModules: nativeModules(),
};

if (process.argv.includes('--write')) {
  writeFileSync(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`native-runtime.json updated for version ${version}.`);
  process.exit(0);
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const nativeChanged =
  snapshot.appConfigSha256 !== current.appConfigSha256 ||
  JSON.stringify(snapshot.nativeModules) !== JSON.stringify(current.nativeModules);

if (!nativeChanged && snapshot.version === version) {
  console.log(`Native runtime unchanged for version ${version} (EAS Update runtime).`);
  process.exit(0);
}

const changes = [];
if (snapshot.appConfigSha256 !== current.appConfigSha256) changes.push('app.config.ts changed');
const names = new Set([
  ...Object.keys(snapshot.nativeModules),
  ...Object.keys(current.nativeModules),
]);
for (const name of [...names].sort()) {
  const before = snapshot.nativeModules[name];
  const after = current.nativeModules[name];
  if (before !== after) changes.push(`${name}: ${before ?? '(none)'} → ${after ?? '(removed)'}`);
}

if (snapshot.version === version) {
  console.error(`Native code changed but the app version is still ${version}:`);
  for (const change of changes) console.error(`  - ${change}`);
  console.error(
    'EAS Update would send new JS to old builds (decision #48). Bump `version` in app.config.ts,',
  );
} else {
  console.error(`App version is now ${version} (snapshot: ${snapshot.version}).`);
  for (const change of changes) console.error(`  - ${change}`);
}
console.error(
  'then run `node scripts/check-native-runtime.mjs --write` and commit native-runtime.json.',
);
process.exit(1);
