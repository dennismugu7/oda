import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// The database is server-only (CLAUDE.md): only server/** may import the driver, Drizzle or
// @oda/db. Route handlers and components go through server/authz.ts and the repositories.
const dbImports = {
  paths: [
    { name: '@oda/db', message: 'Use server/ (authz + repositories) instead of the database.' },
    { name: 'pg', message: 'Use server/ (authz + repositories) instead of the database.' },
  ],
  patterns: [
    {
      group: ['@oda/db/*', 'drizzle-orm', 'drizzle-orm/*', 'pg/*'],
      message: 'Use server/ (authz + repositories) instead of the database.',
    },
  ],
};

const config = [
  { ignores: ['.next/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    ignores: ['server/**', 'test/**'],
    rules: { 'no-restricted-imports': ['error', dbImports] },
  },
];

export default config;
