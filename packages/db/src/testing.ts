// Test-database helpers for Vitest (packages/db and apps/web). Never import from app code.
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import type { Db } from './client';
import { runMigrations } from './migrator';

/**
 * The test database URL: TEST_DATABASE_URL, or DATABASE_URL with the database renamed to
 * oda_test. Refuses anything that isn't a *_test database, so tests can't wipe real data.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!explicit && !base) {
    throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run the database tests');
  }
  const url = new URL(explicit ?? base!);
  if (!explicit) url.pathname = '/oda_test';
  if (!url.pathname.endsWith('_test')) {
    throw new Error(
      `Refusing to use ${url.pathname.slice(1)} as a test database (name must end in _test)`,
    );
  }
  return url.toString();
}

/** Creates the test database if missing (connecting to the server's postgres database). */
async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const pool = new Pool({ connectionString: admin.toString(), max: 1 });
  try {
    const found = await pool.query('select 1 from pg_database where datname = $1', [name]);
    if (found.rowCount === 0) await pool.query(`create database "${name.replaceAll('"', '""')}"`);
  } finally {
    await pool.end();
  }
}

/** Vitest globalSetup: make sure the test database exists and is fully migrated. */
export async function prepareTestDatabase(): Promise<string> {
  const url = testDatabaseUrl();
  await ensureDatabase(url);
  await runMigrations(url);
  return url;
}

/** Empties every application and auth table (keeps the schema and migration history). */
export async function truncateAll(db: Db): Promise<void> {
  const tables = await db.execute<{ name: string }>(sql`
    select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`);
  if (tables.rows.length === 0) return;
  const list = tables.rows.map((r) => r.name).join(', ');
  await db.execute(sql.raw(`truncate ${list} restart identity cascade`));
}
