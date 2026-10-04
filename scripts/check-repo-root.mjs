// Fails when Expo/EAS project files appear at the repo root: the app's config lives in
// apps/seller, and a root app.json means a command ran in the wrong folder (Step 49).
// Run by CI and by apps/seller/scripts/eas-update.mjs.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STRAY = ['app.json', 'app.config.js', 'app.config.ts', 'eas.json'];

export function strayRootFiles() {
  return STRAY.filter((name) => existsSync(resolve(root, name)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = strayRootFiles();
  if (found.length > 0) {
    console.error(
      `Found at the repo root: ${found.join(', ')}. Expo config belongs in apps/seller; delete these.`,
    );
    process.exit(1);
  }
  console.log('Repo root: no stray Expo/EAS files.');
}
