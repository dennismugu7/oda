import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { emailConfig, isDeployed, type SentEmail } from './transport';

// The local email outbox behind /dev/outbox (decision #43): lets the owner read codes and
// reset links on the phone during local testing. Off on every Vercel deployment.

export function devOutboxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isDeployed(env)) return false;
  try {
    return emailConfig(env).transport === 'file';
  } catch {
    return false;
  }
}

/** Newest first. Null when the outbox is off. */
export async function readOutbox(limit = 20): Promise<SentEmail[] | null> {
  if (!devOutboxEnabled()) return null;
  const dir = emailConfig().outboxDir;
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const newest = files.sort().reverse().slice(0, limit);
  return Promise.all(
    newest.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as SentEmail),
  );
}
