import { describe, expect, it } from 'vitest';
import { createDb } from './client';
import { sql } from 'drizzle-orm';

// Runs against the local Docker Postgres (or the CI service container) after `db:migrate`.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)('database', () => {
  it('is reachable and migrated', async () => {
    const { db, pool } = createDb(url!);
    try {
      const version = await db.execute<{ server_version_num: string }>(
        sql`show server_version_num`,
      );
      expect(Number(version.rows[0]?.server_version_num)).toBeGreaterThanOrEqual(170000);
      const applied = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      expect(applied.rows[0]?.n).toBeGreaterThanOrEqual(1);
    } finally {
      await pool.end();
    }
  });
});
