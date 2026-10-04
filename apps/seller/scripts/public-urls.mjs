// Release builds and EAS Updates must point the app at public https:// URLs, never
// localhost, an emulator or LAN address: shared shop links have to work for buyers
// (owner Step 58). Same rule as isPublicBaseUrl in @oda/shared (kept in sync by its test).
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\])$|\.local$/i;

export const PUBLIC_URL_VARS = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SHOP_BASE_URL'];

export function isPublicBaseUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && !!hostname && !PRIVATE_HOST.test(hostname);
  } catch {
    return false;
  }
}

/** Problems with the URL variables (names only, plus the bad value: these aren't secrets). */
export function publicUrlProblems(env) {
  return PUBLIC_URL_VARS.filter((name) => !isPublicBaseUrl(env[name] ?? '')).map(
    (name) => `${name} must be a public https:// URL, not "${env[name] ?? '(unset)'}"`,
  );
}

/** Parses `eas env:list` output (KEY=value lines). */
export function parseEnvList(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

// `node scripts/public-urls.mjs`: run by EAS before a build (package.json
// "eas-build-pre-install"); fails a non-development build with localhost URLs.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const profile = process.env.EAS_BUILD_PROFILE;
  const problems = profile && profile !== 'development' ? publicUrlProblems(process.env) : [];
  for (const problem of problems) console.error(`EAS ${profile} build: ${problem}`);
  process.exit(problems.length > 0 ? 1 : 0);
}
