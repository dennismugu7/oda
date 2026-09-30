import 'server-only';
import { createDb, type Db } from '@oda/db';
import { serverEnv } from './env';

// One pool per server instance; reused across hot reloads in dev.
const globalForDb = globalThis as unknown as { odaDb?: Db };

export function getDb(): Db {
  globalForDb.odaDb ??= createDb(serverEnv().DATABASE_URL).db;
  return globalForDb.odaDb;
}
