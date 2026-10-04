// Which backups to keep (decision #54, owner Step 55): every backup younger than 14 days
// stays; older ones are deleted. Only files named like a backup are ever considered, the
// one just uploaded is always kept, and the newest backup is never deleted (so a run after
// a long gap can't leave the store empty).

export const KEEP_DAYS = 14;
export const BACKUP_PREFIX = 'staging/';
const BACKUP_NAME = /^staging\/oda-staging-\d{8}T\d{4}Z\.dump\.gpg$/;

export interface StoredBackup {
  pathname: string;
  uploadedAt: Date;
  size?: number;
}

/** `staging/oda-staging-20261004T2330Z.dump.gpg` for the given time (UTC). */
export function backupName(at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').slice(0, 13);
  return `${BACKUP_PREFIX}oda-staging-${stamp}Z.dump.gpg`;
}

export function isBackupName(pathname: string): boolean {
  return BACKUP_NAME.test(pathname);
}

export function planRetention(
  stored: readonly StoredBackup[],
  now: Date,
  justUploaded: string,
  keepDays: number = KEEP_DAYS,
): { keep: StoredBackup[]; remove: StoredBackup[]; ignored: string[] } {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  const backups = stored
    .filter((b) => isBackupName(b.pathname))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  const newest = backups[0]?.pathname;
  const keep: StoredBackup[] = [];
  const remove: StoredBackup[] = [];
  for (const b of backups) {
    const protectedFile = b.pathname === justUploaded || b.pathname === newest;
    (b.uploadedAt.getTime() < cutoff && !protectedFile ? remove : keep).push(b);
  }
  const ignored = stored.filter((b) => !isBackupName(b.pathname)).map((b) => b.pathname);
  return { keep, remove, ignored };
}
