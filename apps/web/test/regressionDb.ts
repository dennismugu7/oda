import { expect } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { createDb } from '@oda/db';
import { env, mask } from '../regression/lib';

// The staging regression's database helpers (decision #92), as the staging-backdate workflows
// use the database: only this run's own shops are changed; Demo Duka is only read.

export async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>) {
  const { db, pool } = createDb(env.databaseUrl);
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

/** staging-backdate-order, limited to a shop of this run. */
export async function backdateOrder(slug: string, number: number) {
  if (!slug.startsWith(`reg-${env.runId}-`)) throw new Error('Only this run’s shops.');
  const rows = await withDb((db) =>
    db.execute(sql`
      update orders set awaiting_payment_since = now() - interval '49 hours'
      where number = ${number}
        and shop_id = (select id from shops where slug = ${slug})
        and status = 'awaiting_payment' and payment_status = 'unpaid' and source <> 'manual'
      returning 1`),
  );
  expect(rows.rows.length, 'backdated order').toBe(1);
}

/** Demo Duka's sample order tokens by buyer first name (read only; masked). */
export async function demoTokens(): Promise<Record<string, string>> {
  const rows = await withDb((db) =>
    db.execute<{ buyer_name: string; public_token: string }>(sql`
      select o.buyer_name, o.public_token from orders o join shops s on s.id = o.shop_id
      where s.slug = 'demo-duka' and o.buyer_phone = '+254700000001'`),
  );
  const out: Record<string, string> = {};
  for (const r of rows.rows) {
    mask(r.public_token);
    out[r.buyer_name.split(' ')[0]!] = r.public_token;
  }
  return out;
}
