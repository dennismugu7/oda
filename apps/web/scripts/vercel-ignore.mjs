// Vercel's "ignored build step" for both projects (M11 CP2, decision #93 D3). Exit 0 = skip
// the build, exit 1 = build. Pushes to `main` and `production` never build on their own
// (vercel.json → git.deploymentEnabled): migrate-staging and release-production deploy them
// through Deploy Hooks, after migrating. The oda-production project (ODA_VERCEL_PROJECT =
// production, set for all its environments) builds only its Production deployment, never a
// branch preview; the staging project builds previews as before.
const project = process.env.ODA_VERCEL_PROJECT;
const env = process.env.VERCEL_ENV;
if (project === 'production' && env !== 'production') {
  console.log(`oda-production builds only Production (this is ${env ?? 'unknown'}): skipped.`);
  process.exit(0);
}
console.log(`Building (${project ?? 'staging'} project, ${env ?? 'unknown'}).`);
process.exit(1);
