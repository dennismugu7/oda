import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from './db';
import { toResponse } from './errors';
import { describeError, scrubText } from './safeLog';

// Decision #45 (M10 CP1): an unexpected error's log line never carries the query's
// parameters, row values from Postgres' detail, emails, phones or tokens.

const EMAIL = 'wanjiku.secret@example.test';
const PHONE = '+254712345678';
const TOKEN = 'o_9f8e7d6c5b4a39281706f5e4d3c2b1a0';

async function failingQuery(): Promise<unknown> {
  try {
    // A real Drizzle + Postgres error whose parameters hold personal data.
    await getDb().execute(
      sql`select ${EMAIL}::text, ${PHONE}::text, ${TOKEN}::text, (${'not-a-number'})::int`,
    );
  } catch (error) {
    return error;
  }
  throw new Error('expected the query to fail');
}

describe('describeError', () => {
  it('keeps the query text and Postgres code, never the parameters', async () => {
    const error = await failingQuery();
    expect(String((error as Error).message)).toContain(EMAIL); // what Drizzle would log
    const line = describeError(error);
    expect(line).toContain('code=22P02');
    expect(line).toContain('query: select $1::text');
    for (const secret of [EMAIL, PHONE, TOKEN, 'not-a-number']) {
      expect(line).not.toContain(secret);
    }
  });

  it('toResponse logs the safe line and answers a plain 500', async () => {
    const error = await failingQuery();
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => logged.push(args.map(String).join(' '));
    try {
      const res = toResponse(error);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain(EMAIL);
    } finally {
      console.error = original;
    }
    expect(logged).toHaveLength(1);
    for (const secret of [EMAIL, PHONE, TOKEN]) expect(logged[0]).not.toContain(secret);
  });

  it('scrubs emails, phones and tokens from other errors’ messages', () => {
    const line = describeError(new Error(`send to ${EMAIL} / 0712 345 678 failed: ${TOKEN}`));
    expect(line).toContain('Error · message: send to [email] / [phone] failed: [token]');
    expect(scrubText('order 3f2b1c4d-1111-4a2b-9c3d-123456789abc')).toContain('3f2b1c4d-1111');
    expect(describeError('boom')).toBe('non-error thrown (string)');
  });
});
