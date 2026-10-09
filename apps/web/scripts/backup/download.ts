// Weekly restore check, first step (M10 CP4, decision #85): downloads the newest encrypted
// backup of BACKUP_TARGET from the private Vercel Blob store. Fails if there is none, or if the newest
// is older than 36 hours (the nightly backup has stopped). Run by
// .github/workflows/backup-restore-check.yml:
//   BACKUP_TARGET=staging BACKUP_BLOB_READ_WRITE_TOKEN=… tsx scripts/backup/download.ts <out.dump.gpg>
import { writeFile } from 'node:fs/promises';
import { get, list } from '@vercel/blob';
import { backupPrefix, backupTarget, newestBackup, type StoredBackup } from './retention';

export const MAX_AGE_HOURS = 36;

async function main() {
  const out = process.argv[2];
  const token = process.env.BACKUP_BLOB_READ_WRITE_TOKEN;
  if (!out) throw new Error('Usage: download.ts <out file>');
  if (!token) throw new Error('BACKUP_BLOB_READ_WRITE_TOKEN is not set');
  const target = backupTarget();

  const stored: StoredBackup[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: backupPrefix(target), cursor, limit: 1000, token });
    stored.push(...page.blobs.map((b) => ({ pathname: b.pathname, uploadedAt: b.uploadedAt })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const newest = newestBackup(stored, target);
  if (!newest) throw new Error('No backups in the store');
  const hours = (Date.now() - newest.uploadedAt.getTime()) / 3_600_000;
  console.log(
    `Newest backup: ${newest.pathname} (${hours.toFixed(1)} h old, ${stored.length} stored).`,
  );
  if (hours > MAX_AGE_HOURS) {
    throw new Error(
      `The newest backup is ${Math.round(hours)} hours old: is backup-${target} failing?`,
    );
  }

  const file = await get(newest.pathname, { access: 'private', token, useCache: false });
  if (!file || file.statusCode !== 200) throw new Error(`Could not download ${newest.pathname}`);
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (bytes.length === 0) throw new Error('The backup file is empty');
  await writeFile(out, bytes);
  console.log(`Downloaded ${(bytes.length / 1024 / 1024).toFixed(1)} MB.`);
}

main().catch((error) => {
  console.error(
    `Backup download failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
