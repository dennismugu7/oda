// Local release builds of the production app while GitHub Actions and EAS cloud builds are not
// used (decision #113). Only on the owner's go: never upload the result without it.
//
//   pnpm --filter @oda/seller build:apk <versionCode>   release APK for the owner's phone (arm64)
//   pnpm --filter @oda/seller build:aab <versionCode>   signed bundle for Play (arm64 + armv7)
//
// Needs, outside the repo or gitignored:
//   ODA_LOCAL_SIGNING        the Play upload key: the EAS credentials.json (or a properties file)
//   .env.production.local    the production EXPO_PUBLIC_* values (`eas env:pull`, see docs)
// The versionCode must be higher than every build already made (EAS's remote counter included);
// after the build, set EAS's counter to it (`eas build:version:set`) so the next EAS build skips it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const [kind, code] = process.argv.slice(2);
const KINDS = {
  apk: {
    task: 'assembleRelease',
    abis: 'arm64-v8a',
    out: 'app/build/outputs/apk/release/app-release.apk',
  },
  aab: {
    task: 'bundleRelease',
    abis: 'arm64-v8a,armeabi-v7a',
    out: 'app/build/outputs/bundle/release/app-release.aab',
  },
};
const target = KINDS[kind];
if (!target) stop('Use build:apk or build:aab.');
if (!/^\d+$/.test(code ?? ''))
  stop('Give the versionCode, e.g. pnpm --filter @oda/seller build:apk 6');

const signing = process.env.ODA_LOCAL_SIGNING;
if (!signing || !existsSync(signing)) {
  stop(
    'Set ODA_LOCAL_SIGNING to the upload key file; without it the build would use the public debug key.',
  );
}

const envFile = join(app, '.env.production.local');
if (!existsSync(envFile))
  stop('Missing apps/seller/.env.production.local (production EXPO_PUBLIC_* values).');
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [
      line.slice(0, line.indexOf('=')),
      line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, ''),
    ]),
);
for (const name of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SHOP_BASE_URL']) {
  if (!env[name]?.startsWith('https://'))
    stop(`${name} in .env.production.local must be an https:// address.`);
}
// 0.5.0 has Google sign-in; without the client ID the button would quietly disappear.
if (!env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
  stop('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing from .env.production.local.');

if (run('git', ['status', '--porcelain'], { capture: true }))
  stop('Commit or stash your changes first.');
const commit = run('git', ['rev-parse', '--short', 'HEAD'], { capture: true });

// Passed explicitly: the process environment wins over .env.local (local dev addresses).
const publicEnv = Object.fromEntries(
  Object.entries(env).filter(([name]) => name.startsWith('EXPO_PUBLIC_')),
);
const buildEnv = {
  ...process.env,
  ...publicEnv,
  NODE_ENV: 'production',
  ODA_VERSION_CODE: code,
  ODA_UPDATES_CHANNEL: 'production',
};
console.log(`Building ${kind} · versionCode ${code} · channel production · commit ${commit}`);
run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], {
  env: buildEnv,
});
run(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  [target.task, `-PreactNativeArchitectures=${target.abis}`],
  {
    env: buildEnv,
    cwd: join(app, 'android'),
  },
);
console.log(
  `Done: apps/seller/android/${target.out} (versionCode ${code}, commit ${commit}). Not uploaded.`,
);

function run(cmd, args, { capture = false, env = process.env, cwd = app } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    shell: process.platform === 'win32',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) stop(`${cmd} ${args.join(' ')} failed (exit ${result.status}).`);
  return capture ? result.stdout.trim() : '';
}

function stop(message) {
  console.error(message);
  process.exit(1);
}
