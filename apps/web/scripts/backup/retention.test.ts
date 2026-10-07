import { describe, expect, it } from 'vitest';
import {
  backupName,
  isBackupName,
  newestBackup,
  planRetention,
  type StoredBackup,
} from './retention';

const NOW = new Date('2026-10-20T23:35:00Z');
const daysAgo = (d: number, extraMinutes = 0) =>
  new Date(NOW.getTime() - d * 86_400_000 - extraMinutes * 60_000);
const backup = (at: Date): StoredBackup => ({ pathname: backupName(at), uploadedAt: at });
const names = (list: StoredBackup[]) => list.map((b) => b.pathname);

describe('backup retention (14 days)', () => {
  it('names backups by UTC time', () => {
    expect(backupName(new Date('2026-10-04T23:30:12Z'))).toBe(
      'staging/oda-staging-20261004T2330Z.dump.gpg',
    );
    expect(isBackupName('staging/oda-staging-20261004T2330Z.dump.gpg')).toBe(true);
    expect(isBackupName('staging/notes.txt')).toBe(false);
    expect(isBackupName('products/x/oda-staging-20261004T2330Z.dump.gpg')).toBe(false);
  });

  it('keeps the last 14 days and deletes older backups', () => {
    const today = backup(NOW);
    const stored = [today, backup(daysAgo(1)), backup(daysAgo(13)), backup(daysAgo(14, -5))];
    const old = [backup(daysAgo(14, 5)), backup(daysAgo(15)), backup(daysAgo(40))];
    const plan = planRetention([...stored, ...old], NOW, today.pathname);
    expect(names(plan.keep)).toEqual(names(stored));
    expect(names(plan.remove)).toEqual(names(old));
  });

  it('never deletes the file just uploaded or the newest one, even after a long gap', () => {
    const stale = [backup(daysAgo(30)), backup(daysAgo(31))];
    const plan = planRetention(stale, NOW, 'staging/oda-staging-20261020T2335Z.dump.gpg');
    expect(names(plan.keep)).toEqual([stale[0]!.pathname]);
    expect(names(plan.remove)).toEqual([stale[1]!.pathname]);

    const justUploadedButOddClock = backup(daysAgo(20));
    expect(
      planRetention([justUploadedButOddClock], NOW, justUploadedButOddClock.pathname).remove,
    ).toEqual([]);
  });

  it('ignores anything that is not a backup', () => {
    const other = { pathname: 'staging/readme.txt', uploadedAt: daysAgo(90) };
    const plan = planRetention([other, backup(NOW)], NOW, backupName(NOW));
    expect(plan.remove).toEqual([]);
    expect(plan.ignored).toEqual(['staging/readme.txt']);
  });

  it('handles an empty store', () => {
    expect(planRetention([], NOW, backupName(NOW))).toEqual({ keep: [], remove: [], ignored: [] });
  });
});

describe('newest backup (weekly restore check)', () => {
  it('picks the newest file named like a backup, or none', () => {
    const at = (iso: string) => new Date(iso);
    const stored: StoredBackup[] = [
      { pathname: backupName(at('2026-10-05T23:30:00Z')), uploadedAt: at('2026-10-05T23:31:00Z') },
      { pathname: 'staging/notes.txt', uploadedAt: at('2026-10-07T00:00:00Z') },
      { pathname: backupName(at('2026-10-06T23:30:00Z')), uploadedAt: at('2026-10-06T23:31:00Z') },
    ];
    expect(newestBackup(stored)?.pathname).toBe('staging/oda-staging-20261006T2330Z.dump.gpg');
    expect(newestBackup([{ pathname: 'staging/x', uploadedAt: at('2026-10-07T00:00:00Z') }])).toBe(
      null,
    );
  });
});
