import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Server-only. One driver everywhere (local Docker, CI, Neon pooled URL on Vercel):
// see docs/decisions.md #17.
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof createDb>['db'];
