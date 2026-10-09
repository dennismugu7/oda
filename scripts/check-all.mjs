// `pnpm check:all` (owner Step 61): every local check, strictly one after another, so checks
// never run in parallel by accident. Each step's full output is shown; the run stops at the
// first failure and ends with a summary of each step's result.
//
// Steps: format → lint → typecheck → tests → repo root → Expo dependencies + native runtime
// → Android JS bundle → web build + Playwright. Turbo runs each package one at a time too (--concurrency=1), and the
// tests always run for real (--force: the database tests depend on more than the files).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = mkdtempSync(join(tmpdir(), 'oda-check-bundle-'));

const steps = [
  ['format', 'pnpm', ['format:check']],
  ['lint', 'pnpm', ['exec', 'turbo', 'run', 'lint', '--concurrency=1']],
  ['typecheck', 'pnpm', ['exec', 'turbo', 'run', 'typecheck', '--concurrency=1']],
  ['tests', 'pnpm', ['exec', 'turbo', 'run', 'test', '--concurrency=1', '--force']],
  ['repo root', 'node', ['scripts/check-repo-root.mjs']],
  ['workflows', 'node', ['scripts/check-workflows.mjs']],
  ['expo deps + native runtime', 'pnpm', ['--filter', '@oda/seller', 'deps:check']],
  [
    'android bundle',
    'pnpm',
    [
      '--filter',
      '@oda/seller',
      'exec',
      'expo',
      'export',
      '--platform',
      'android',
      '--output-dir',
      bundleDir,
    ],
  ],
  // Builds the web app and runs Playwright (390 × 844), as CI does.
  ['web build + playwright', 'pnpm', ['test:e2e']],
];

const results = [];
let failed = false;
for (const [name, command, args] of steps) {
  console.log(`\n▶ ${name}: ${command} ${args.join(' ')}\n`);
  const started = Date.now();
  const run = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const ok = run.status === 0;
  results.push(`${ok ? '✔' : '✘'} ${name} (${seconds} s${ok ? '' : `, exit ${run.status}`})`);
  console.log(`\n${results.at(-1)}`);
  if (!ok) {
    failed = true;
    break;
  }
}
rmSync(bundleDir, { recursive: true, force: true });

const skipped = steps.slice(results.length).map(([name]) => `– ${name} (not run)`);
console.log(`\ncheck:all ${failed ? 'FAILED' : 'passed'}`);
for (const line of [...results, ...skipped]) console.log(`  ${line}`);
process.exit(failed ? 1 : 0);
