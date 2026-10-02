import 'server-only';
import { sql } from '@oda/db';
import { getDb } from './db';
import { serverEnv } from './env';

/** Throws when the env is invalid or the database doesn't answer. */
export async function checkHealth(): Promise<void> {
  serverEnv();
  await getDb().execute(sql`select 1`);
}
