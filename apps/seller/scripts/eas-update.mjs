// Publishes an EAS Update to the preview channel (decision #47), always from apps/seller,
// whatever the current directory: a run from the repo root once made eas-cli create an
// empty app.json there (Step 49). Refuses to run while a stray app.json exists at the root.
//
//   pnpm --filter @oda/seller update:preview "What changed"
//   pnpm update:preview "What changed"   (from the repo root)
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strayRootFiles } from '../../../scripts/check-repo-root.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Give the update a message, e.g. pnpm update:preview "Fix the sign-in error"');
  process.exit(1);
}

const before = strayRootFiles();
if (before.length > 0) {
  console.error(`Remove these from the repo root first: ${before.join(', ')}`);
  process.exit(1);
}

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'eas',
    'update',
    '--channel',
    'preview',
    '--environment',
    'preview',
    '--non-interactive',
    '--message',
    message,
  ],
  { cwd: app, stdio: 'inherit', shell: process.platform === 'win32' },
);

const after = strayRootFiles();
if (after.length > 0) {
  console.error(`eas-cli left files at the repo root: ${after.join(', ')}. Delete them.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
