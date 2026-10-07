// M10 CP3 performance check (decision #84): times the seller's hot reads against a large
// local database. Never run against staging. Usage (a throwaway local database grown from the
// seed, see docs/hardening-report.md → CP3):
//   DATABASE_URL=postgres://…/oda_perf pnpm exec tsx --conditions=react-server scripts/perf-check.ts
import { createDb, schema } from '@oda/db';
import type { SellerCtx } from '../server/authz';
import { insightsRepo } from '../server/repos/insights';
import { sellerReviewsRepo } from '../server/repos/reviews';
import { sellerHomeRepo } from '../server/repos/sellerHome';
import { sellerOrdersRepo } from '../server/repos/sellerOrders';

const url = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Local databases only.');
const { db, pool } = createDb(url);

async function time(label: string, run: () => Promise<unknown>) {
  await run(); // warm up
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await run();
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(32)} median ${runs[2]!.toFixed(1)} ms   max ${runs[4]!.toFixed(1)} ms`,
  );
}

const [shop] = await db.select().from(schema.shops).limit(1);
const ctx = { userId: shop!.ownerId, shopId: shop!.id } as SellerCtx;
const orders = await db.$count(schema.orders);
console.log(`shop ${shop!.slug}: ${orders} orders`);

const ord = sellerOrdersRepo(db, ctx);
const first = await ord.list({ tab: 'all', q: undefined });
await time('orders: all, page 1', () => ord.list({ tab: 'all', q: undefined }));
await time('orders: all, page 2', () =>
  ord.list({ tab: 'all', q: undefined, cursor: first.next ?? undefined }),
);
await time('orders: done', () => ord.list({ tab: 'done', q: undefined }));
await time('orders: to do', () => ord.list({ tab: 'todo', q: undefined }));
await time('orders: search name', () => ord.list({ tab: 'all', q: 'wanj' }));
await time('orders: search phone', () => ord.list({ tab: 'all', q: '0712' }));
const ins = insightsRepo(db, ctx);
for (const p of ['today', 'week', 'month'] as const) {
  await time(`insights: ${p}`, () => ins.insights(p));
}
await time('customers: all', () => ins.customers({ filter: 'all', cursor: 0 }));
await time('customers: repeat', () => ins.customers({ filter: 'repeat', cursor: 0 }));
await time('customers: search', () => ins.customers({ filter: 'all', q: 'wanj', cursor: 0 }));
await time('more', () => ins.more('https://oda.example'));
await time('home', () => sellerHomeRepo(db, ctx).home());
const rev = sellerReviewsRepo(db, ctx);
await time('reviews: all', () => rev.list({ tab: 'all' }));
await pool.end();
