// Which backups to keep (decision #54, owner Step 55): every backup younger than 14 days
// stays; older ones are deleted. Only files named like a backup are ever considered, the
// one just uploaded is always kept, and the newest backup is never deleted (so a run after
// a long gap can't leave the store empty).

export const KEEP_DAYS = 14;

/** Each environment's backups live under their own prefix, in their own store (M11 CP2). */
export type BackupTarget = 'staging' | 'production';

/** BACKUP_TARGET from the workflow; staging when unset. */
export function backupTarget(value: string | undefined = process.env.BACKUP_TARGET): BackupTarget {
  if (value === undefined || value === '' || value === 'staging') return 'staging';
  if (value === 'production') return 'production';
  throw new Error('BACKUP_TARGET must be staging or production');
}

export const backupPrefix = (target: BackupTarget = 'staging') => `${target}/`;

export interface StoredBackup {
  pathname: string;
  uploadedAt: Date;
  size?: number;
}

/** `staging/oda-staging-20261004T2330Z.dump.gpg` for the given time (UTC). */
export function backupName(at: Date, target: BackupTarget = 'staging'): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').slice(0, 13);
  return `${backupPrefix(target)}oda-${target}-${stamp}Z.dump.gpg`;
}

export function isBackupName(pathname: string, target: BackupTarget = 'staging'): boolean {
  return new RegExp(String.raw`^${target}/oda-${target}-\d{8}T\d{4}Z\.dump\.gpg$`).test(pathname);
}

export function planRetention(
  stored: readonly StoredBackup[],
  now: Date,
  justUploaded: string,
  keepDays: number = KEEP_DAYS,
  target: BackupTarget = 'staging',
): { keep: StoredBackup[]; remove: StoredBackup[]; ignored: string[] } {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  const backups = stored
    .filter((b) => isBackupName(b.pathname, target))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  const newest = backups[0]?.pathname;
  const keep: StoredBackup[] = [];
  const remove: StoredBackup[] = [];
  for (const b of backups) {
    const protectedFile = b.pathname === justUploaded || b.pathname === newest;
    (b.uploadedAt.getTime() < cutoff && !protectedFile ? remove : keep).push(b);
  }
  const ignored = stored.filter((b) => !isBackupName(b.pathname, target)).map((b) => b.pathname);
  return { keep, remove, ignored };
}

/** The newest file named like a backup, or null (the weekly restore check, decision #85). */
export function newestBackup(
  stored: readonly StoredBackup[],
  target: BackupTarget = 'staging',
): StoredBackup | null {
  return (
    stored
      .filter((b) => isBackupName(b.pathname, target))
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0] ?? null
  );
}
