import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertDeploymentConfig,
  DEPLOYMENT_CHECK_ENV,
  indexable,
  odaEnvironment,
  PRODUCTION_BASE_URL,
  productionConfigProblems,
} from './deployment';

// Which deployment this is, and what production must have before it serves anyone (M11 CP2).

const production = {
  NEXT_PUBLIC_ODA_ENV: 'production',
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_REF: 'production',
  PUBLIC_SHOP_BASE_URL: PRODUCTION_BASE_URL,
  BETTER_AUTH_URL: `${PRODUCTION_BASE_URL}/`,
  STORAGE_DRIVER: 'vercel-blob',
  STORAGE_PUBLIC_BASE_URL: 'https://abc.public.blob.vercel-storage.com',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'oda <hello@mail.oda.mugu-labs.com>',
  NEXT_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/2',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  CRON_SECRET: 'c'.repeat(40),
  OPS_SECRET: 'o'.repeat(40),
  EXPO_ACCESS_TOKEN: 'expo-token',
  DATABASE_URL: 'postgresql://oda_app:pw@ep-calm-1-pooler.eu-central-1.aws.neon.tech/neondb',
};

describe('odaEnvironment', () => {
  it('reads NEXT_PUBLIC_ODA_ENV, else Vercel’s environment (Production = staging)', () => {
    expect(odaEnvironment({ NEXT_PUBLIC_ODA_ENV: 'production' })).toBe('production');
    expect(odaEnvironment({ NEXT_PUBLIC_ODA_ENV: 'staging', VERCEL_ENV: 'production' })).toBe(
      'staging',
    );
    expect(odaEnvironment({ VERCEL_ENV: 'production' })).toBe('staging');
    expect(odaEnvironment({ VERCEL_ENV: 'preview' })).toBe('preview');
    expect(odaEnvironment({})).toBe('local');
  });

  it('only production is indexable', () => {
    expect(indexable({ NEXT_PUBLIC_ODA_ENV: 'production' })).toBe(true);
    expect(indexable({ VERCEL_ENV: 'production' })).toBe(false);
    expect(indexable({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(indexable({})).toBe(false);
  });
});

describe('productionConfigProblems', () => {
  it('a complete production config passes', () => {
    expect(productionConfigProblems(production)).toEqual([]);
    expect(() => assertDeploymentConfig(production)).not.toThrow();
  });

  it('production refuses the local driver, the outbox, a missing DSN and the wrong address', () => {
    const problems = productionConfigProblems({
      ...production,
      STORAGE_DRIVER: 'local',
      EMAIL_TRANSPORT: 'file',
      NEXT_PUBLIC_SENTRY_DSN: '',
      PUBLIC_SHOP_BASE_URL: 'https://oda-eta.vercel.app',
    });
    expect(problems).toEqual([
      `PUBLIC_SHOP_BASE_URL must be ${PRODUCTION_BASE_URL}.`,
      'Production stores photos in Vercel Blob: STORAGE_DRIVER=vercel-blob and STORAGE_PUBLIC_BASE_URL.',
      'Production sends email through Resend (RESEND_API_KEY; never the dev outbox).',
      'NEXT_PUBLIC_SENTRY_DSN is not set.',
    ]);
  });

  it('production connects as oda_app over the pooled host (S11)', () => {
    expect(
      productionConfigProblems({
        ...production,
        DATABASE_URL: 'postgresql://neondb_owner:pw@ep-calm-1.eu-central-1.aws.neon.tech/neondb',
      }),
    ).toEqual([
      'DATABASE_URL must use the oda_app role (S11).',
      "DATABASE_URL must be Neon's pooled host.",
    ]);
  });

  it('names every missing secret, never a value', () => {
    const problems = productionConfigProblems({
      ...production,
      CRON_SECRET: undefined,
      OPS_SECRET: ' ',
      EXPO_ACCESS_TOKEN: undefined,
    });
    expect(problems).toEqual([
      'CRON_SECRET is not set.',
      'OPS_SECRET is not set.',
      'EXPO_ACCESS_TOKEN is not set.',
    ]);
    expect(() => assertDeploymentConfig({ ...production, CRON_SECRET: undefined })).toThrow(
      /Deployment config \(production\):\n- CRON_SECRET is not set\./,
    );
    expect(
      JSON.stringify(productionConfigProblems({ ...production, VERCEL_ENV: 'preview' })),
    ).not.toContain('pw@');
  });

  it('nothing but production may use production’s address', () => {
    expect(productionConfigProblems({ VERCEL_ENV: 'production' })).toEqual([]);
    expect(
      productionConfigProblems({
        VERCEL_ENV: 'production',
        PUBLIC_SHOP_BASE_URL: PRODUCTION_BASE_URL,
      }),
    ).toEqual([`Only production may use ${PRODUCTION_BASE_URL} (this is staging).`]);
    expect(
      productionConfigProblems({
        VERCEL_ENV: 'preview',
        BETTER_AUTH_URL: `${PRODUCTION_BASE_URL}/`,
      }),
    ).toEqual([`Only production may use ${PRODUCTION_BASE_URL} (this is preview).`]);
  });

  it('production only builds from its Production environment', () => {
    expect(productionConfigProblems({ ...production, VERCEL_ENV: 'preview' })).toEqual([
      'Production builds only from its own Production environment.',
    ]);
  });

  it('production only builds from the production branch', () => {
    expect(
      productionConfigProblems({ ...production, VERCEL_GIT_COMMIT_REF: 'm11-some-branch' }),
    ).toEqual(['Production builds only from the production branch (release-production).']);
  });
});

describe('the build sees what the check reads', () => {
  it('turbo.json passes every checked variable to the build', () => {
    const turbo = JSON.parse(readFileSync(join(__dirname, '../../../turbo.json'), 'utf8'));
    const build = turbo.tasks.build;
    const passed = new Set([...(build.env ?? []), ...(build.passThroughEnv ?? [])]);
    expect(DEPLOYMENT_CHECK_ENV.filter((name) => !passed.has(name))).toEqual([]);
  });

  it('the check reads nothing beyond that list (and NEXT_PUBLIC_*)', () => {
    const source = readFileSync(join(__dirname, 'deployment.ts'), 'utf8');
    const read = new Set(
      [...source.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g), ...source.matchAll(/'([A-Z][A-Z0-9_]+)'/g)]
        .map((m) => m[1] ?? '')
        .filter((name) => !name.startsWith('NEXT_PUBLIC_')),
    );
    const listed = new Set<string>(DEPLOYMENT_CHECK_ENV);
    expect([...read].filter((name) => !listed.has(name))).toEqual([]);
  });
});

describe('vercel-ignore.mjs (exit 0 = skip)', () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [join(__dirname, '../scripts/vercel-ignore.mjs')], {
      env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', ...env },
    }).status;

  it('oda-production builds only the production branch as Production', () => {
    const prod = { ODA_VERCEL_PROJECT: 'production' };
    expect(run({ ...prod, VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'production' })).toBe(1);
    // Vercel's first deployment of a project is Production whatever its branch.
    expect(run({ ...prod, VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'm11-branch' })).toBe(0);
    expect(run({ ...prod, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'm11-branch' })).toBe(0);
    expect(run({ ...prod, VERCEL_ENV: 'production' })).toBe(0);
  });

  it('the staging project builds as before', () => {
    expect(run({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'm11-branch' })).toBe(1);
    expect(run({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' })).toBe(1);
  });
});
