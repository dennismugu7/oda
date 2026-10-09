import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  appRoleOk,
  appRoleUrl,
  checkAppLogin,
  ensureAppRole,
  neonPooledHost,
  scramVerifier,
} from './appRole';

// A role of its own: apps/web's tests set up `oda_app` on the same server at the same time.
const role = 'oda_app_db_test';
const password = 'db-test-only-role-password-9x2m';
const ownerUrl = process.env.DATABASE_URL!;
const owner = new Pool({ connectionString: ownerUrl, max: 1 });

afterAll(async () => {
  await owner.query('drop table if exists app_role_probe');
  await owner.end();
});

describe('scramVerifier', () => {
  it('matches the RFC 7677 construction', () => {
    const salt = Buffer.from('0123456789abcdef');
    const v = scramVerifier('a-long-enough-password-for-tests', salt, 4096);
    const salted = pbkdf2Sync('a-long-enough-password-for-tests', salt, 4096, 32, 'sha256');
    const stored = createHash('sha256')
      .update(createHmac('sha256', salted).update('Client Key').digest())
      .digest('base64');
    const server = createHmac('sha256', salted).update('Server Key').digest('base64');
    expect(v).toBe(`SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`);
  });

  it('refuses short or non-ASCII passwords', () => {
    expect(() => scramVerifier('short')).toThrow();
    expect(() => scramVerifier('ünïcode-password-that-is-long-enough')).toThrow();
  });
});

describe('neonPooledHost', () => {
  it('adds -pooler to a Neon endpoint host once', () => {
    expect(neonPooledHost('ep-calm-sun-a1b2c3.eu-central-1.aws.neon.tech')).toBe(
      'ep-calm-sun-a1b2c3-pooler.eu-central-1.aws.neon.tech',
    );
    expect(neonPooledHost('ep-calm-sun-a1b2c3-pooler.eu-central-1.aws.neon.tech')).toBe(
      'ep-calm-sun-a1b2c3-pooler.eu-central-1.aws.neon.tech',
    );
    expect(neonPooledHost('localhost')).toBeNull();
  });
});

describe('ensureAppRole', () => {
  it('does nothing without a password when the role is missing', async () => {
    const report = await ensureAppRole({ ownerUrl, role: 'oda_app_never_created' });
    expect(report.exists).toBe(false);
  });

  it('creates a row-only role that passes its own check, and is safe to re-run', async () => {
    const first = await ensureAppRole({ ownerUrl, password, role });
    expect(appRoleOk(first)).toBe(true);
    expect(first.tables).toBeGreaterThan(20);
    const again = await ensureAppRole({ ownerUrl, password, role });
    expect(again.created).toBe(false);
    expect(appRoleOk(again)).toBe(true);
    const grantsOnly = await ensureAppRole({ ownerUrl, role });
    expect(grantsOnly.passwordSet).toBe(false);
    expect(appRoleOk(grantsOnly)).toBe(true);
  });

  it('logs in, reads and writes rows, but is refused create, drop and truncate', async () => {
    await ensureAppRole({ ownerUrl, password, role });
    const url = appRoleUrl(ownerUrl, password, role);
    const check = await checkAppLogin(url);
    expect(check).toEqual({
      user: role,
      refused: { createTable: true, dropTable: true, truncate: true },
    });
    const app = new Pool({ connectionString: url, max: 1 });
    try {
      await app.query('begin');
      await app.query(
        `insert into ops_events (action, reason, actor) values ('shop_suspended', 'test', 'test')`,
      );
      await app.query('rollback');
      await expect(app.query('alter table shops add column x int')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await app.end();
    }
  });

  it('gives tables created by later migrations the same grants', async () => {
    await ensureAppRole({ ownerUrl, password, role });
    await owner.query('create table if not exists app_role_probe (x int)');
    const app = new Pool({ connectionString: appRoleUrl(ownerUrl, password, role), max: 1 });
    try {
      await app.query('insert into app_role_probe values (1)');
      await app.query('delete from app_role_probe');
    } finally {
      await app.end();
      await owner.query('drop table app_role_probe');
    }
  });

  it('a re-run takes back CREATE on public if someone granted it', async () => {
    await ensureAppRole({ ownerUrl, password, role });
    await owner.query(`grant create on schema public to ${role}`);
    try {
      const report = await ensureAppRole({ ownerUrl, role });
      // The grants revoke CREATE again, so the re-run repairs it.
      expect(report.canCreateInPublic).toBe(false);
    } finally {
      await owner.query(`revoke create on schema public from ${role}`);
    }
  });
});
