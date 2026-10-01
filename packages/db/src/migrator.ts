import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/** Applies every pending migration to the database at `url`. */
export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
