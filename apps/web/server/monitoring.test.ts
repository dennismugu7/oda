import * as Sentry from '@sentry/nextjs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sentryIngestOrigin, sentryOptions } from '@/lib/sentryOptions';
import { getDb } from './db';
import { toResponse } from './errors';

// Decision #87: what the web sends Sentry. A real database error (whose message carries the
// query's values) reported by toResponse() reaches Sentry with none of them, after both the
// safe description and the shared scrubber. Events are recorded here, never sent.

const BUYER = {
  name: 'Wanjiku Mwangi',
  phone: '+254712345678',
  email: 'wanjiku.secret@example.test',
  address: 'Argwings Kodhek Rd',
};
const recorded: unknown[] = [];

beforeAll(() => {
  const options = sentryOptions('server');
  Sentry.init({
    ...options,
    dsn: 'https://publickey@o1.ingest.de.sentry.io/1',
    enabled: true,
    // The real scrubber first, then record instead of sending.
    beforeSend: (event) => {
      const scrubbed = options.beforeSend(event);
      if (scrubbed) recorded.push(scrubbed);
      return null;
    },
  });
});
afterAll(async () => {
  await Sentry.close(1000);
});

describe('Sentry options (web)', () => {
  it('privacy first: no default PII, no tracing, scrubber on events and breadcrumbs', () => {
    const o = sentryOptions('browser');
    expect(o.sendDefaultPii).toBe(false);
    expect(o.tracesSampleRate).toBe(0);
    expect(o.beforeSend({ user: { email: BUYER.email } })).toEqual({});
    expect(o.beforeBreadcrumb({ category: 'fetch', data: { url: '/o/aB3dE5fG7hJ9?x=1' } })).toEqual(
      { category: 'fetch', data: { url: '/o/[token]' } },
    );
  });

  it('the CSP allows only the DSN’s ingest origin', () => {
    expect(sentryIngestOrigin('https://key@o123.ingest.de.sentry.io/456')).toBe(
      'https://o123.ingest.de.sentry.io',
    );
    expect(sentryIngestOrigin('not a dsn')).toBeNull();
    expect(sentryIngestOrigin(undefined)).toBeNull();
  });
});

describe('unexpected API errors', () => {
  it('are reported without the query’s values', async () => {
    let error: unknown;
    try {
      await getDb().execute(
        sql`select ${BUYER.name}::text, ${BUYER.phone}::text, ${BUYER.email}::text, ${BUYER.address}::text, (${'x'})::int`,
      );
    } catch (e) {
      error = e;
    }
    expect(String((error as Error).message)).toContain(BUYER.name); // what Drizzle carries
    const original = console.error;
    console.error = () => {};
    try {
      expect(toResponse(error).status).toBe(500);
    } finally {
      console.error = original;
    }
    await Sentry.flush(1000);
    expect(recorded).toHaveLength(1);
    const json = JSON.stringify(recorded[0]);
    for (const value of Object.values(BUYER)) expect(json).not.toContain(value);
    expect(json).toContain('code=22P02');
  });
});
