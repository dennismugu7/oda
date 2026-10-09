// Vercel's "ignored build step" for both projects (M11 CP2, decisions #93 D3, #95). Exit 0 =
// skip the build, exit 1 = build. Pushes to `main` and `production` never build on their own
// (vercel.json → git.deploymentEnabled): migrate-staging and release-production deploy them
// through Deploy Hooks, after migrating. The oda-production project (ODA_VERCEL_PROJECT =
// production, set for all its environments) builds only the `production` branch as its
// Production deployment, never a branch preview. The branch is checked as well as the target
// because Vercel makes a project's first deployment Production whatever its branch (seen on
// 2026-10-09: a PR branch built as oda-production's Production). The staging project builds
// previews as before.
const project = process.env.ODA_VERCEL_PROJECT;
const env = process.env.VERCEL_ENV;
const ref = process.env.VERCEL_GIT_COMMIT_REF;
if (project === 'production' && (env !== 'production' || ref !== 'production')) {
  console.log(
    `oda-production builds only the production branch as Production (this is ${ref ?? 'unknown'}, ${env ?? 'unknown'}): skipped.`,
  );
  process.exit(0);
}
console.log(
  `Building (${project ?? 'staging'} project, ${env ?? 'unknown'}, ${ref ?? 'unknown'}).`,
);
process.exit(1);
