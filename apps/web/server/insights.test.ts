import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { INSIGHT_PERIODS, type InsightPeriod } from '@oda/shared';
import { anonCall, newSeller } from '@/test/sellerApi';
import { getAuth } from './auth';
import { requireSeller, type SellerCtx } from './authz';
import { getDb } from './db';
import { envSchema } from './env';
import { getCustomers, getInsights, getMore, getSupport } from './insightsRoutes';
import { insertOrder } from './orders';
import { insightsRepo } from './repos/insights';
import { seed } from './seed/seed';

// M8b CP1. The milestone's acceptance: "insights numbers match a SQL check on the seed data".
// The seed (the "Amani Styles" demo shop, 120+ orders over months) runs once with a fixed
// clock; every number Insights shows is compared with an independent SQL query in
// Africa/Nairobi time. Then customers, the More tab, the support contact and authorization.

const db = () => getDb();
const t = schema;
const PASSWORD = 'seed-password-for-tests';
// Wednesday 7 Oct 2026, 12:00 Nairobi.
const NOW = new Date('2026-10-07T09:00:00Z');
const TRUNC: Record<InsightPeriod, string> = { today: 'day', week: 'week', month: 'month' };
const STEP: Record<InsightPeriod, string> = { today: '1 day', week: '1 week', month: '1 month' };
const BAR: Record<InsightPeriod, string> = {
  today: 'extract(hour from o.confirmed_at at time zone tz)',
  week: 'extract(isodow from o.confirmed_at at time zone tz) - 1',
  month: 'extract(day from o.confirmed_at at time zone tz) - 1',
};

let ctx: SellerCtx;

beforeAll(async () => {
  await truncateAll(db());
  await seed(db(), { password: PASSWORD, now: NOW });
  const { token } = await getAuth().api.signInEmail({
    body: { email: 'amani@example.test', password: PASSWORD },
  });
  ctx = await requireSeller({ headers: new Headers({ authorization: `Bearer ${token}` }) });
}, 120_000);
afterAll(async () => {
  await truncateAll(db());
});

/** Rows of an SQL check: the period's window as Postgres computes it, Nairobi time. */
async function check<T>(period: InsightPeriod, body: string, shopId = ctx.shopId): Promise<T[]> {
  const query = `
    with p as (
      select 'Africa/Nairobi'::text as tz,
             (date_trunc('${TRUNC[period]}', $1::timestamptz at time zone 'Africa/Nairobi')
               at time zone 'Africa/Nairobi') as start,
             $1::timestamptz as now,
             -- The previous period, counted on the Nairobi calendar (a month back from 1 Oct
             -- is 1 Sep in Nairobi, not 31 Aug as UTC arithmetic would give).
             ((date_trunc('${TRUNC[period]}', $1::timestamptz at time zone 'Africa/Nairobi')
               - interval '${STEP[period]}') at time zone 'Africa/Nairobi') as prev_start,
             (($1::timestamptz at time zone 'Africa/Nairobi') - interval '${STEP[period]}')
               at time zone 'Africa/Nairobi' as prev_end
    ), s as (
      select o.* from orders o, p
      where o.shop_id = $2 and o.status in ('confirmed', 'sent', 'delivered')
        and o.confirmed_at >= p.start and o.confirmed_at < p.now
    )
    ${body}`;
  const { rows } = await db().$client.query(query, [NOW.toISOString(), shopId]);
  return rows as T[];
}

describe('insights match an SQL check on the seed data', () => {
  for (const period of INSIGHT_PERIODS) {
    it(`${period}: sales, bars, previous period, orders, average, visits, sources, top products`, async () => {
      const got = await insightsRepo(db(), ctx).insights(period, NOW);

      const [sum] = await check<{ total: number; n: number }>(
        period,
        'select coalesce(sum(total), 0)::int as total, count(*)::int as n from s',
      );
      expect(got.sales.total).toBe(sum!.total);
      expect(got.orders).toBe(sum!.n);
      expect(got.averageOrder).toBe(sum!.n ? Math.round(sum!.total / sum!.n) : 0);

      const bars = await check<{ bar: number; total: number }>(
        period,
        `select (${BAR[period].replaceAll('o.', 's.')})::int as bar, sum(total)::int as total
         from s, p group by 1`,
      );
      const expected = Array.from({ length: got.sales.bars.length }, () => 0);
      for (const b of bars) expected[b.bar] = b.total;
      expect(got.sales.bars).toEqual(expected);

      const [prev] = await check<{ total: number }>(
        period,
        `select coalesce(sum(o.total), 0)::int as total from orders o, p
         where o.shop_id = $2 and o.status in ('confirmed', 'sent', 'delivered')
           and o.confirmed_at >= p.prev_start and o.confirmed_at < p.prev_end`,
      );
      expect(got.sales.previous).toBe(prev!.total);

      const [visits] = await check<{ n: number }>(
        period,
        `select coalesce(sum(v.visits), 0)::int as n from shop_visits_daily v, p
         where v.shop_id = $2 and v.day >= (p.start at time zone p.tz)::date
           and v.day <= (p.now at time zone p.tz)::date`,
      );
      expect(got.visits).toBe(visits!.n);

      const sources = await check<{ source: string; n: number }>(
        period,
        'select source::text, count(*)::int as n from s group by 1',
      );
      expect(Object.fromEntries(got.sources.map((x) => [x.source, x.orders]))).toEqual(
        Object.fromEntries(sources.map((x) => [x.source, x.n])),
      );

      const top = await check<{ name: string; sold: number }>(
        period,
        `select coalesce(i.product_id::text, i.name_snapshot) as key, sum(i.qty)::int as sold
         from order_items i join s on s.id = i.order_id group by 1 order by 2 desc`,
      );
      expect(got.topProducts.map((x) => x.sold)).toEqual(top.slice(0, 5).map((x) => x.sold));
    });
  }

  it('the seed has sales in every period, so the checks above compare real numbers', async () => {
    for (const period of INSIGHT_PERIODS) {
      const got = await insightsRepo(db(), ctx).insights(period, NOW);
      expect(got.orders, period).toBeGreaterThan(0);
    }
    const week = await insightsRepo(db(), ctx).insights('week', NOW);
    expect(week.sales.labels).toEqual(['M', 'T', 'Today', 'T', 'F', 'S', 'S']);
    expect(week.visits).toBeGreaterThan(0);
  });

  it('only sales count: an order still awaiting payment changes nothing', async () => {
    const now = new Date();
    const before = await insightsRepo(db(), ctx).insights('today', now);
    const [product] = await db()
      .select()
      .from(t.products)
      .where(eq(t.products.shopId, ctx.shopId))
      .limit(1);
    const { order } = await insertOrder(db(), {
      shopId: ctx.shopId,
      kind: 'buyer_pay_now',
      source: 'tt',
      buyer: { name: 'Not Paid', phone: '0711 999 000', email: null },
      fulfilment: { kind: 'pickup' },
      lines: [{ productId: product!.id, qty: 1, size: product!.sizes[0] ?? undefined }],
    });
    expect(order.status).toBe('awaiting_payment');
    const after = await insightsRepo(db(), ctx).insights('today', now);
    expect(after).toEqual(before);
    await db().delete(t.orders).where(eq(t.orders.id, order.id));
  });
});

describe('customers', () => {
  it('grouped by phone, sales only, newest first, with Repeat and New this month', async () => {
    const r = insightsRepo(db(), ctx);
    const all = await r.customers({ filter: 'all', cursor: 0 }, NOW);
    const [counts] = (
      await db().$client.query(
        `with c as (
           select buyer_phone, count(*) filter (where status in ('confirmed','sent','delivered')) as n,
                  min(confirmed_at) filter (where status in ('confirmed','sent','delivered')) as first_sale
           from orders where shop_id = $1 group by 1)
         select count(*) filter (where n > 0)::int as all,
                count(*) filter (where n >= 2)::int as repeat,
                count(*) filter (where n > 0 and first_sale >= (date_trunc('month', $2::timestamptz at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'))::int as new
         from c`,
        [ctx.shopId, NOW.toISOString()],
      )
    ).rows as { all: number; repeat: number; new: number }[];
    expect(all.counts).toEqual(counts);
    expect(all.counts.repeat).toBeGreaterThan(0);
    // Newest first, 30 a page.
    const dates = all.customers.map((c) => c.lastOrderAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(all.customers.length).toBe(Math.min(30, counts!.all));
    if (counts!.all > 30) {
      const next = await r.customers({ filter: 'all', cursor: all.nextCursor! }, NOW);
      expect(next.customers[0]!.phone).not.toBe(all.customers[0]!.phone);
    }
    const repeat = await r.customers({ filter: 'repeat', cursor: 0 }, NOW);
    expect(repeat.customers.every((c) => c.repeat && c.orderCount >= 2)).toBe(true);

    // Totals are sales only: compare one customer with SQL.
    const one = all.customers[0]!;
    const [spent] = (
      await db().$client.query(
        `select coalesce(sum(total) filter (where status in ('confirmed','sent','delivered')), 0)::int as total
         from orders where shop_id = $1 and buyer_phone = $2`,
        [ctx.shopId, one.phone],
      )
    ).rows as { total: number }[];
    expect(one.totalSpent).toBe(spent!.total);
  });

  it('searches by name or phone (any format)', async () => {
    const r = insightsRepo(db(), ctx);
    const [first] = (await r.customers({ filter: 'all', cursor: 0 }, NOW)).customers;
    const byName = await r.customers(
      { filter: 'all', q: first!.name.split(' ')[0]!.toLowerCase(), cursor: 0 },
      NOW,
    );
    expect(byName.customers.map((c) => c.phone)).toContain(first!.phone);
    const local = `0${first!.phone.slice(4)}`; // +2547… → 07…
    const byPhone = await r.customers({ filter: 'all', q: local, cursor: 0 }, NOW);
    expect(byPhone.customers.map((c) => c.phone)).toEqual([first!.phone]);
    expect(
      (await r.customers({ filter: 'all', q: 'zzzz-nobody', cursor: 0 }, NOW)).counts.all,
    ).toBe(0);
  });
});

describe('More, support and authorization', () => {
  it('More shows the shop card and the row values', async () => {
    const more = await insightsRepo(db(), ctx).more('https://oda.test', NOW);
    const week = await insightsRepo(db(), ctx).insights('week', NOW);
    const [shop] = await db().select().from(t.shops).where(eq(t.shops.id, ctx.shopId));
    expect(more).toMatchObject({
      shop: {
        name: shop!.name,
        slug: shop!.slug,
        url: `https://oda.test/${shop!.slug}`,
        linkPrefix: 'oda.test/',
      },
      salesThisWeek: week.sales.total,
      rating: { avg: Number(shop!.ratingAvg), count: shop!.ratingCount },
      activeAccount: { type: 'till' },
    });
    const [n] = (
      await db().$client.query(
        `select (select count(*) from delivery_areas where shop_id = $1 and deleted_at is null)::int as areas,
                (select count(*) from categories where shop_id = $1)::int as categories`,
        [ctx.shopId],
      )
    ).rows as { areas: number; categories: number }[];
    expect(more.deliveryAreas).toBe(n!.areas);
    expect(more.categories).toBe(n!.categories);
    expect(more.customers).toBe(
      (await insightsRepo(db(), ctx).customers({ filter: 'all', cursor: 0 }, NOW)).counts.all,
    );
  });

  it('every endpoint needs a session; another seller sees only their own (empty) shop', async () => {
    for (const h of [getInsights, getCustomers, getMore, getSupport])
      expect(await anonCall(h)).toBe(401);
    const other = await newSeller();
    const insights = await other.call(getInsights, { query: '?period=month' });
    expect(insights.status).toBe(200);
    expect(insights.json).toMatchObject({ orders: 0, visits: 0, sources: [], topProducts: [] });
    expect((await other.call(getCustomers)).json.counts).toEqual({ all: 0, repeat: 0, new: 0 });
    expect((await other.call(getInsights, { query: '?period=year' })).status).toBe(422);
    expect((await other.call(getMore)).json).toMatchObject({
      customers: 0,
      salesThisWeek: 0,
      activeAccount: null,
    });
    // Nothing of Amani's leaks through another session's search.
    const [amani] = (await insightsRepo(db(), ctx).customers({ filter: 'all', cursor: 0 }, NOW))
      .customers;
    expect(
      (await other.call(getCustomers, { query: `?q=${encodeURIComponent(amani!.name)}` })).json
        .customers,
    ).toEqual([]);
  });

  it('support: email only by default; a WhatsApp number only when configured (decision #77)', async () => {
    const other = await newSeller();
    expect((await other.call(getSupport)).json).toEqual({
      email: 'support@mugu-labs.com',
      whatsapp: null,
    });
    const env = (extra: Record<string, string>) =>
      envSchema.safeParse({ DATABASE_URL: 'postgres://x@localhost/db', ...extra });
    expect(env({ ODA_SUPPORT_WHATSAPP: '0712 345 678' }).data?.ODA_SUPPORT_WHATSAPP).toBe(
      '+254712345678',
    );
    expect(env({ ODA_SUPPORT_WHATSAPP: '' }).data?.ODA_SUPPORT_WHATSAPP).toBeNull();
    expect(env({ ODA_SUPPORT_WHATSAPP: '12345' }).success).toBe(false);
    expect(env({ ODA_SUPPORT_EMAIL: 'help@oda.test' }).data?.ODA_SUPPORT_EMAIL).toBe(
      'help@oda.test',
    );
  });
});
