// Which deployment this is, and what production must have before it serves anyone (M11 CP2,
// decision #93). Pure and free of server-only imports: next.config.ts runs the same check at
// build time, so a misconfigured production build fails and the running deployment stays up;
// instrumentation.ts runs it again when the server starts.
//
// NEXT_PUBLIC_ODA_ENV is set per Vercel project: "production" on oda-production, "staging" on
// the oda project's Production environment. Branch previews and local runs leave it unset.

/** Production's public address (the plan's one fixed value; staging may never use it). */
export const PRODUCTION_BASE_URL = 'https://oda.mugu-labs.com';

/** The branch production deploys from: release-production moves it (decision #95). */
export const PRODUCTION_BRANCH = 'production';

/**
 * Every variable the check below reads that Next doesn't inline (NEXT_PUBLIC_*). turbo.json
 * passes each one to the build (a test checks it): Turborepo hides unlisted variables from the
 * build, and the check would then fail a correctly configured production (seen 2026-10-09).
 */
export const DEPLOYMENT_CHECK_ENV = [
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_REF',
  'PUBLIC_SHOP_BASE_URL',
  'BETTER_AUTH_URL',
  'STORAGE_DRIVER',
  'STORAGE_PUBLIC_BASE_URL',
  'EMAIL_TRANSPORT',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'BETTER_AUTH_SECRET',
  'CRON_SECRET',
  'OPS_SECRET',
  'EXPO_ACCESS_TOKEN',
  'DATABASE_URL',
] as const;

export type OdaEnvironment = 'production' | 'staging' | 'preview' | 'local';

type Env = Record<string, string | undefined>;

export function odaEnvironment(env: Env = process.env): OdaEnvironment {
  const named = env.NEXT_PUBLIC_ODA_ENV?.trim();
  if (named === 'production' || named === 'staging') return named;
  const vercel = env.NEXT_PUBLIC_VERCEL_ENV ?? env.VERCEL_ENV;
  return vercel === 'preview' ? 'preview' : vercel === 'production' ? 'staging' : 'local';
}

/** Search engines may index production only. */
export function indexable(env: Env = process.env): boolean {
  return odaEnvironment(env) === 'production';
}

const trimSlash = (url: string | undefined) => url?.trim().replace(/\/+$/, '');

function dbUser(url: string | undefined): { user: string; host: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return { user: decodeURIComponent(parsed.username), host: parsed.hostname };
  } catch {
    return null;
  }
}

/**
 * What stops this deployment from running as configured: names and reasons only, never a
 * value. Empty off production, except that nothing else may claim production's address.
 */
export function productionConfigProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  const environment = odaEnvironment(env);
  const shopBase = trimSlash(env.PUBLIC_SHOP_BASE_URL);
  if (environment !== 'production') {
    if (
      shopBase === PRODUCTION_BASE_URL ||
      trimSlash(env.BETTER_AUTH_URL) === PRODUCTION_BASE_URL
    ) {
      problems.push(`Only production may use ${PRODUCTION_BASE_URL} (this is ${environment}).`);
    }
    return problems;
  }
  const missing = (name: string) => !env[name]?.trim();
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') {
    problems.push('Production builds only from its own Production environment.');
  }
  if (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== PRODUCTION_BRANCH) {
    problems.push(
      `Production builds only from the ${PRODUCTION_BRANCH} branch (release-production).`,
    );
  }
  if (shopBase !== PRODUCTION_BASE_URL) {
    problems.push(`PUBLIC_SHOP_BASE_URL must be ${PRODUCTION_BASE_URL}.`);
  }
  if (trimSlash(env.BETTER_AUTH_URL) !== PRODUCTION_BASE_URL) {
    problems.push(`BETTER_AUTH_URL must be ${PRODUCTION_BASE_URL}.`);
  }
  if (env.STORAGE_DRIVER !== 'vercel-blob' || missing('STORAGE_PUBLIC_BASE_URL')) {
    problems.push(
      'Production stores photos in Vercel Blob: STORAGE_DRIVER=vercel-blob and STORAGE_PUBLIC_BASE_URL.',
    );
  }
  if ((env.EMAIL_TRANSPORT && env.EMAIL_TRANSPORT !== 'resend') || missing('RESEND_API_KEY')) {
    problems.push('Production sends email through Resend (RESEND_API_KEY; never the dev outbox).');
  }
  if (missing('EMAIL_FROM')) problems.push('EMAIL_FROM is not set.');
  if (missing('NEXT_PUBLIC_SENTRY_DSN')) problems.push('NEXT_PUBLIC_SENTRY_DSN is not set.');
  for (const name of ['BETTER_AUTH_SECRET', 'CRON_SECRET', 'OPS_SECRET', 'EXPO_ACCESS_TOKEN']) {
    if (missing(name)) problems.push(`${name} is not set.`);
  }
  const db = dbUser(env.DATABASE_URL);
  if (!db) {
    problems.push('DATABASE_URL is not set.');
  } else {
    if (db.user !== 'oda_app') problems.push('DATABASE_URL must use the oda_app role (S11).');
    if (!db.host.includes('-pooler.')) problems.push("DATABASE_URL must be Neon's pooled host.");
  }
  return problems;
}

/** Throws when this deployment can't run as configured (see productionConfigProblems). */
export function assertDeploymentConfig(env: Env = process.env): void {
  const problems = productionConfigProblems(env);
  if (problems.length) {
    throw new Error(`Deployment config (${odaEnvironment(env)}):\n- ${problems.join('\n- ')}`);
  }
}
