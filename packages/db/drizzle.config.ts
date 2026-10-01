import { defineConfig } from 'drizzle-kit';

// Migrations run against the direct (unpooled) URL when one is given; Neon's pooler
// (PgBouncer, transaction mode) is fine for queries but not for DDL sessions.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see packages/db/.env.example)');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
