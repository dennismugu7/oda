// Nightly staging backup, last step (decision #54): uploads the encrypted dump to the
// private Vercel Blob store, then deletes backups older than 14 days. The log lists what it
// kept and deleted. Run by .github/workflows/backup-staging.yml:
//   BACKUP_BLOB_READ_WRITE_TOKEN=… tsx scripts/backup/upload.ts <file.dump.gpg>
// Blob operations per run: 1 put + 1 list per 1,000 files (advanced); deletes are free.
import { openAsBlob } from 'node:fs';
import { del, list, put } from '@vercel/blob';
import {
  BACKUP_PREFIX,
  backupName,
  KEEP_DAYS,
  planRetention,
  type StoredBackup,
} from './retention';

const mb = (bytes?: number) =>
  bytes === undefined
    ? '?'
    : bytes < 1024 * 1024
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const file = process.argv[2];
  const token = process.env.BACKUP_BLOB_READ_WRITE_TOKEN;
  if (!file) throw new Error('Usage: upload.ts <encrypted dump file>');
  if (!token) throw new Error('BACKUP_BLOB_READ_WRITE_TOKEN is not set');

  const now = new Date();
  const pathname = backupName(now);
  const body = await openAsBlob(file);
  if (body.size === 0) throw new Error('The backup file is empty');
  await put(pathname, body, {
    access: 'private',
    token,
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/octet-stream',
  });
  console.log(`Uploaded ${pathname} (${mb(body.size)}).`);

  const stored: StoredBackup[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BACKUP_PREFIX, cursor, limit: 1000, token });
    stored.push(
      ...page.blobs.map((b) => ({ pathname: b.pathname, uploadedAt: b.uploadedAt, size: b.size })),
    );
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const plan = planRetention(stored, now, pathname);
  console.log(`Kept (${plan.keep.length}, newer than ${KEEP_DAYS} days or the newest):`);
  for (const b of plan.keep) console.log(`  ${b.pathname}  ${mb(b.size)}`);
  if (plan.remove.length > 0)
    await del(
      plan.remove.map((b) => b.pathname),
      { token },
    );
  console.log(`Deleted (${plan.remove.length}, older than ${KEEP_DAYS} days):`);
  for (const b of plan.remove) console.log(`  ${b.pathname}  ${b.uploadedAt.toISOString()}`);
  if (plan.ignored.length > 0) console.log(`Left alone (not backups): ${plan.ignored.join(', ')}`);
}

main().catch((error: unknown) => {
  // Never print the token: only the message.
  console.error(`Backup upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
