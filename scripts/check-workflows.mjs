// Checks the GitHub Actions workflows keep staging and production apart (M11 CP2, decision #93):
// - no workflow writes a deployment address: it comes from the Environment variable BASE_URL;
// - the staging-only test tools (demo seed, backdating, regression, Sitting 1 clean-up) run
//   in the `staging` Environment only and never mention production, so they can't reach a
//   production secret (those live only in the `production-jobs` Environment) or address;
// - a production secret is always named PRODUCTION_…, and a secret is chosen by name
//   (`secrets[cond && 'A' || 'B']`), never with a fallback (`secrets.A || secrets.B`), which
//   would hand production staging's value when its own is missing.
// Run by CI and by `pnpm check:all`.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.github', 'workflows');

/** Test tools that must only ever touch staging. */
export const STAGING_ONLY = [
  'demo-seed-staging.yml',
  'staging-backdate-deletion.yml',
  'staging-backdate-order.yml',
  'staging-regression.yml',
  'staging-sitting1-cleanup.yml',
];

const ADDRESS = /https?:\/\/[a-z0-9.-]*(vercel\.app|mugu-labs\.com)/i;
const SECRET_FALLBACK = /secrets\.[A-Za-z_]+\s*\|\||\|\|\s*secrets\.[A-Za-z_]+/;

/** The lines that do something (comments dropped). */
function codeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ n: i + 1, line: line.replace(/(^|\s)#.*$/, '') }))
    .filter(({ line }) => line.trim() !== '');
}

export function workflowProblems(name, text) {
  const problems = [];
  const lines = codeLines(text);
  for (const { n, line } of lines) {
    if (ADDRESS.test(line)) {
      problems.push(`${name}:${n}: a deployment address; use \${{ vars.BASE_URL }}.`);
    }
    if (SECRET_FALLBACK.test(line)) {
      problems.push(`${name}:${n}: a secret with a fallback; pick the name instead.`);
    }
    for (const [secret] of line.matchAll(/[A-Z][A-Z0-9_]*PRODUCTION[A-Z0-9_]*/g)) {
      if (!secret.startsWith('PRODUCTION_')) {
        problems.push(`${name}:${n}: production secret ${secret} must start with PRODUCTION_.`);
      }
    }
  }
  if (STAGING_ONLY.includes(name)) {
    const code = lines.map((l) => l.line).join('\n');
    const jobs = (code.match(/^\s+runs-on:/gm) ?? []).length;
    const staging = (code.match(/^\s+environment: staging\s*$/gm) ?? []).length;
    if (jobs === 0 || staging !== jobs) {
      problems.push(
        `${name}: every job must run in the staging Environment (environment: staging).`,
      );
    }
    if (/^\s+environment:(?! staging\s*$)/m.test(code)) {
      problems.push(`${name}: only the staging Environment is allowed.`);
    }
    if (/production/i.test(code))
      problems.push(`${name}: a staging-only tool mentions production.`);
    if (/inputs\.target|uses:\s*\.\/\.github\/workflows\//.test(code)) {
      problems.push(`${name}: a staging-only tool can't take a target or call another workflow.`);
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  const missing = STAGING_ONLY.filter((f) => !files.includes(f));
  const problems = [
    ...missing.map((f) => `${f}: listed as staging-only but not found.`),
    ...files.flatMap((f) => workflowProblems(f, readFileSync(join(dir, f), 'utf8'))),
  ];
  if (problems.length > 0) {
    console.error(`Workflow check failed:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(
    `Workflows: ${files.length} checked; no addresses, no secret fallbacks, ${STAGING_ONLY.length} staging-only tools kept to staging.`,
  );
}
