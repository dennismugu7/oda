import { getTableColumns, getTableName, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { getSchema } from 'better-auth/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { authOptions, getAuth } from './auth';
import { getDb } from './db';
import { signUpVerified } from '@/test/auth';

const drizzleTables: Record<string, PgTable> = {
  auth_user: schema.authUser,
  auth_session: schema.authSession,
  auth_account: schema.authAccount,
  auth_verification: schema.authVerification,
};

describe('Better Auth tables', () => {
  it('match what Better Auth expects for our config', () => {
    const expected = getSchema(authOptions);
    expect(Object.keys(expected).sort()).toEqual(Object.keys(drizzleTables).sort());
    for (const [model, table] of Object.entries(expected)) {
      const ours = drizzleTables[model]!;
      expect(getTableName(ours)).toBe(model);
      const columns = Object.keys(getTableColumns(ours));
      for (const [field, attr] of Object.entries(table.fields)) {
        expect(columns, `${model}.${field}`).toContain(attr.fieldName ?? field);
      }
    }
  });
});

describe('Better Auth against oda_test', () => {
  beforeEach(async () => {
    await truncateAll(getDb());
  });
  afterAll(async () => {
    await truncateAll(getDb());
  });

  it('signs up with a uuid id, creates the profile and resolves a bearer session', async () => {
    const res = await signUpVerified('Amani Wairimu', 'amani@example.test');
    expect(res.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.token).toBeTruthy();

    const profile = await getDb().query.profiles.findFirst({
      where: eq(schema.profiles.id, res.userId),
    });
    expect(profile).toMatchObject({ id: res.userId, isAdmin: false });

    const session = await getAuth().api.getSession({
      headers: new Headers({ authorization: `Bearer ${res.token}` }),
    });
    expect(session?.user.email).toBe('amani@example.test');
  });

  it('has no session without a token', async () => {
    const session = await getAuth().api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });
});
