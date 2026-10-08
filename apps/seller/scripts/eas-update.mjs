// Publishes an EAS Update to the preview channel (decisions #47, #90) by starting the
// eas-update-preview workflow on the current branch and waiting for it: the update is built,
// published and its source maps uploaded to Sentry on the runner, never on the laptop.
//
//   pnpm --filter @oda/seller update:preview "What changed"
//   pnpm update:preview "What changed"   (from the repo root)
//
// The branch must be pushed and clean: the runner builds what GitHub has, not this folder.
import { spawnSync } from 'node:child_process';

const WORKFLOW = 'eas-update-preview.yml';
const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Give the update a message, e.g. pnpm update:preview "Fix the sign-in error"');
  process.exit(1);
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch === 'HEAD') stop('Check out a branch first (detached HEAD).');
if (run('git', ['status', '--porcelain'])) {
  stop('Commit or stash your changes first: the update is built from the pushed branch.');
}
run('git', ['fetch', '--quiet', 'origin', branch]);
const head = run('git', ['rev-parse', 'HEAD']);
if (head !== run('git', ['rev-parse', `origin/${branch}`])) {
  stop(`Push ${branch} first: GitHub's copy differs from this one.`);
}

const started = new Date(Date.now() - 5_000).toISOString();
run('gh', ['workflow', 'run', WORKFLOW, '--ref', branch, '-f', `message=${message}`]);
console.log(`Started ${WORKFLOW} on ${branch} (${head.slice(0, 7)}): "${message}"`);

// The run appears a few seconds after the dispatch.
let runId = '';
for (let i = 0; i < 30 && !runId; i++) {
  spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 2000)']);
  runId = run('gh', [
    'run',
    'list',
    '--workflow',
    WORKFLOW,
    '--branch',
    branch,
    '--event',
    'workflow_dispatch',
    '--limit',
    '5',
    '--json',
    'databaseId,headSha,createdAt',
    '--jq',
    `[.[] | select(.headSha == "${head}" and .createdAt >= "${started}")][0].databaseId // ""`,
  ]);
}
if (!runId) stop('The workflow run did not show up; see Actions → eas-update-preview.');

const watched = spawnSync('gh', ['run', 'watch', runId, '--exit-status', '--interval', '10'], {
  stdio: 'inherit',
});
const url = run('gh', ['run', 'view', runId, '--json', 'url', '--jq', '.url']);
if (watched.status !== 0) stop(`The update failed: ${url}`);
console.log(`Published; the update id and runtime are in the run's summary: ${url}`);

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) stop(`${cmd} ${args[0]} failed: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

function stop(text) {
  console.error(text);
  process.exit(1);
}
