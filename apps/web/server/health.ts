import 'server-only';
import { sql } from '@oda/db';
import { getDb } from './db';
import { serverEnv } from './env';

export class ConfigError extends Error {}

/** Throws ConfigError when the env is invalid, or an error when the database doesn't answer. */
export async function checkHealth(): Promise<void> {
  try {
    serverEnv();
  } catch (error) {
    throw new ConfigError((error as Error).message);
  }
  await getDb().execute(sql`select 1`);
}
