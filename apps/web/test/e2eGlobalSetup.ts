import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { createDb } from '@oda/db';

// Before each Playwright run: reset the rate-limit counters in the local database the server
// under test uses. Every run sends buyer reports from the same "IP", and the daily per-IP
// limit (10) would otherwise fail the report test after a few local runs on the same day.
// Only ever a database on this machine; CI starts from an empty one anyway.
export default async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Playwright resets rate limits only on a local database, not ${host}.`);
  }
  const { db, pool } = createDb(url);
  try {
    await db.execute(sql`delete from rate_limits`);
  } finally {
    await pool.end();
  }
}
