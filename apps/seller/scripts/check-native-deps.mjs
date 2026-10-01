// Fails when any installed copy of a package that Expo pins for this SDK
// (bundledNativeModules.json) is outside the expected range, including
// transitive copies. `expo install --check` and expo-doctor only look at the
// app's direct dependencies, so a mismatched native module pulled in as an
// auto-installed peer only surfaced in the Gradle build (decision #18).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, '../package.json'));
const expoRequire = createRequire(require.resolve('expo/package.json'));
const semver = expoRequire('semver');
const expected = expoRequire('./bundledNativeModules.json');

const lockfile = readFileSync(resolve(here, '../../../pnpm-lock.yaml'), 'utf8');
// pnpm's lockfile can hold several YAML documents, each with its own `packages:` section.
const packagesSections = lockfile
  .split(/^packages:$/m)
  .slice(1)
  .map((section) => section.split(/^\S/m)[0])
  .join('\n');

const installed = new Map();
for (const [, key] of packagesSections.matchAll(/^ {2}'?(.+?)'?:$/gm)) {
  const at = key.lastIndexOf('@');
  if (at <= 0) continue;
  const name = key.slice(0, at);
  const version = key.slice(at + 1);
  if (!installed.has(name)) installed.set(name, []);
  installed.get(name).push(version);
}

const problems = [];
for (const [name, range] of Object.entries(expected)) {
  for (const version of installed.get(name) ?? []) {
    if (!semver.satisfies(version, range))
      problems.push(`${name}@${version} (SDK expects ${range})`);
  }
}

if (problems.length > 0) {
  console.error('Installed packages that do not match this Expo SDK:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    'Fix with `npx expo install <package>` in apps/seller (see docs/decisions.md #18).',
  );
  process.exit(1);
}
console.log(
  `All installed Expo SDK packages match bundledNativeModules.json (${Object.keys(expected).length} checked).`,
);
