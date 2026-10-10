// Runs on the eas-update-preview and eas-update-production workflows' runners (decision #90),
// from apps/seller: checks the EAS environment of the same name, publishes the update to that
// channel (bundles and source maps land in dist/ for the Sentry upload step) and writes the
// update to the job summary. Reads CHANNEL (preview, the default, or production), EXPO_TOKEN
// and MESSAGE from the environment. Never run on the laptop: use `pnpm update:preview "What
// changed"` (or Actions → eas-update-production), which starts the workflow.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strayRootFiles } from '../../../scripts/check-repo-root.mjs';
import { parseEnvList, publicUrlProblems } from './public-urls.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const channel = process.env.CHANNEL || 'preview';
if (channel !== 'preview' && channel !== 'production') fail(`Unknown channel '${channel}'.`);
const message = (process.env.MESSAGE ?? '').trim();
if (!message) fail('The update needs a message.');
if (!process.env.EXPO_TOKEN) fail('EXPO_TOKEN is not set.');

const before = strayRootFiles();
if (before.length > 0) fail(`Stray files at the repo root: ${before.join(', ')}`);

// The update is built with the EAS environment of the same name: its URLs must be public https.
const envList = eas(['env:list', '--environment', channel]);
if (envList.status !== 0)
  fail(`Could not read the EAS "${channel}" environment; nothing was published.`);
const problems = publicUrlProblems(parseEnvList(envList.stdout));
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  fail(
    `Fix the EAS "${channel}" environment (expo.dev → Environment variables); nothing was published.`,
  );
}

const published = eas([
  'update',
  '--channel',
  channel,
  '--environment',
  channel,
  '--non-interactive',
  '--json',
  '--message',
  message,
]);
if (published.status !== 0) fail('eas update failed; nothing was published.');

const after = strayRootFiles();
if (after.length > 0) fail(`eas-cli left files at the repo root: ${after.join(', ')}`);

// --json prints one entry per platform of the same update group.
const updates = JSON.parse(published.stdout);
const lines = [
  `### EAS Update (${channel})`,
  '',
  `Message: ${message}`,
  ...updates.map(
    (u) => `- ${u.platform}: group \`${u.group}\`, runtime ${u.runtimeVersion}, update \`${u.id}\``,
  ),
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);

function eas(args) {
  // stdout is captured (env values, JSON); eas-cli's progress goes to stderr, shown live.
  const result = spawnSync('eas', args, {
    cwd: app,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    // Preview builds are the separate "oda staging" app (app.config.ts, decision #93 D6).
    env: channel === 'preview' ? { ...process.env, APP_VARIANT: 'preview' } : process.env,
  });
  if (result.error) fail(String(result.error));
  return result;
}

function fail(text) {
  console.error(`::error::${text}`);
  process.exit(1);
}
