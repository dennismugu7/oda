import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  barOf,
  ORDER_STATUSES,
  isSale,
  periodChange,
  periodWindow,
  REPEAT_MIN_ORDERS,
  SOURCE_LABELS,
  type CustomerFilter,
  type InsightPeriod,
  type OrderSource,
} from '@oda/shared';
import type { SellerCtx } from '../authz';
import { publicUrl } from '../uploads';

// M8b CP1: Insights (20b-insights), Customers (20b-customers) and the More tab's row values
// (20-more). Sales follow order-lifecycle.md: confirmed, sent or delivered orders, dated by
// confirmed_at, in Nairobi time. Everything is scoped to the seller's own shop.

const t = schema;
const SALE_STATUSES = ORDER_STATUSES.filter(isSale);
export const CUSTOMERS_PAGE = 30;
export const TOP_PRODUCTS = 5;

export function insightsRepo(db: Db, ctx: SellerCtx) {
  const { shopId } = ctx;
  const sale = and(eq(t.orders.shopId, shopId), inArray(t.orders.status, SALE_STATUSES));

  async function salesTotal(from: Date, to: Date) {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${t.orders.total}), 0)::int` })
      .from(t.orders)
      .where(and(sale, gte(t.orders.confirmedAt, from), lt(t.orders.confirmedAt, to)));
    return row?.total ?? 0;
  }

  /** Customers grouped by phone, sales only (decision #38): at least one sale. */
  function customerRows() {
    const isSaleSql = inArray(t.orders.status, SALE_STATUSES);
    return db
      .select({
        phone: t.orders.buyerPhone,
        name: sql<string>`(array_agg(${t.orders.buyerName} order by ${t.orders.placedAt} desc))[1]`.as(
          'name',
        ),
        totalSpent:
          sql<number>`coalesce(sum(${t.orders.total}) filter (where ${isSaleSql}), 0)::int`.as(
            'total_spent',
          ),
        orderCount: sql<number>`(count(*) filter (where ${isSaleSql}))::int`.as('order_count'),
        lastOrderAt: sql<Date>`max(${t.orders.placedAt})`.as('last_order_at'),
        firstSaleAt: sql<Date>`min(${t.orders.confirmedAt}) filter (where ${isSaleSql})`.as(
          'first_sale_at',
        ),
      })
      .from(t.orders)
      .where(eq(t.orders.shopId, shopId))
      .groupBy(t.orders.buyerPhone)
      .having(sql`count(*) filter (where ${isSaleSql}) > 0`)
      .as('c');
  }

  return {
    async insights(period: InsightPeriod, now: Date = new Date()) {
      const w = periodWindow(period, now);
      const sales = await db
        .select({
          id: t.orders.id,
          total: t.orders.total,
          confirmedAt: t.orders.confirmedAt,
          source: t.orders.source,
        })
        .from(t.orders)
        .where(and(sale, gte(t.orders.confirmedAt, w.start), lt(t.orders.confirmedAt, now)));
      const bars = Array.from({ length: w.bars }, () => 0);
      for (const s of sales) {
        const bar = barOf(w, s.confirmedAt!);
        if (bar !== null) bars[bar]! += s.total;
      }
      const total = sales.reduce((n, s) => n + s.total, 0);
      const previous = await salesTotal(w.prevStart, w.prevEnd);

      const bySource = new Map<OrderSource, number>();
      for (const s of sales) bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
      const sources = [...bySource.entries()]
        .map(([source, orders]) => ({ source, label: SOURCE_LABELS[source], orders }))
        .sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label));

      const [visits] = await db
        .select({ n: sql<number>`coalesce(sum(${t.shopVisitsDaily.visits}), 0)::int` })
        .from(t.shopVisitsDaily)
        .where(
          and(
            eq(t.shopVisitsDaily.shopId, shopId),
            gte(t.shopVisitsDaily.day, w.firstDay),
            lte(t.shopVisitsDaily.day, w.today),
          ),
        );

      const ids = sales.map((s) => s.id);
      const top = ids.length
        ? await db
            .select({
              productId: t.orderItems.productId,
              name: sql<string>`(array_agg(${t.orderItems.nameSnapshot} order by ${t.orderItems.createdAt} desc))[1]`,
              thumb: sql<
                string | null
              >`(array_agg(${t.orderItems.coverPathSnapshot} order by ${t.orderItems.createdAt} desc) filter (where ${t.orderItems.coverPathSnapshot} is not null))[1]`,
              sold: sql<number>`sum(${t.orderItems.qty})::int`,
            })
            .from(t.orderItems)
            .where(inArray(t.orderItems.orderId, ids))
            .groupBy(
              sql`coalesce(${t.orderItems.productId}::text, ${t.orderItems.nameSnapshot})`,
              t.orderItems.productId,
            )
            .orderBy(desc(sql`sum(${t.orderItems.qty})`), asc(sql`2`))
            .limit(TOP_PRODUCTS)
        : [];

      return {
        period,
        sales: {
          total,
          previous,
          change: periodChange(total, previous, period),
          bars,
          labels: w.labels,
          current: w.current,
        },
        orders: sales.length,
        averageOrder: sales.length ? Math.round(total / sales.length) : 0,
        visits: visits?.n ?? 0,
        sources,
        topProducts: top.map((p) => ({
          productId: p.productId,
          name: p.name,
          sold: p.sold,
          thumbUrl: publicUrl(p.thumb),
        })),
      };
    },

    async customers(
      opts: { filter: CustomerFilter; q?: string; cursor: number },
      now: Date = new Date(),
    ) {
      const monthStart = periodWindow('month', now).start;
      const c = customerRows();
      const search = opts.q?.trim();
      const digits = search?.replace(/\D/g, '') ?? '';
      const matches = search
        ? sql`(${c.name} ilike ${`%${search.replace(/[%_\\]/g, '\\$&')}%`}${
            digits.length >= 3 ? sql` or ${c.phone} like ${`%${digits.replace(/^0/, '')}%`}` : sql``
          })`
        : undefined;
      const repeat = gte(c.orderCount, REPEAT_MIN_ORDERS);
      const fresh = gte(c.firstSaleAt, monthStart);
      const filter = opts.filter === 'repeat' ? repeat : opts.filter === 'new' ? fresh : undefined;

      const [counts] = await db
        .select({
          all: sql<number>`count(*)::int`,
          repeat: sql<number>`(count(*) filter (where ${repeat}))::int`,
          new: sql<number>`(count(*) filter (where ${fresh}))::int`,
        })
        .from(c)
        .where(matches);
      const rows = await db
        .select()
        .from(c)
        .where(and(filter, matches))
        .orderBy(desc(c.lastOrderAt), asc(c.phone))
        .limit(CUSTOMERS_PAGE + 1)
        .offset(opts.cursor);
      return {
        counts: counts ?? { all: 0, repeat: 0, new: 0 },
        customers: rows.slice(0, CUSTOMERS_PAGE).map((r) => ({
          phone: r.phone,
          name: r.name,
          totalSpent: r.totalSpent,
          orderCount: r.orderCount,
          lastOrderAt: new Date(r.lastOrderAt).toISOString(),
          repeat: r.orderCount >= REPEAT_MIN_ORDERS,
        })),
        nextCursor: rows.length > CUSTOMERS_PAGE ? opts.cursor + CUSTOMERS_PAGE : null,
      };
    },

    /**
     * What the Share screen (19b-share) draws: the shop, its newest available product with a
     * photo ("New in") and how many products buyers can see ("Collection").
     */
    async share(shopBaseUrl: string) {
      const [shop] = await db.select().from(t.shops).where(eq(t.shops.id, shopId));
      const visible = and(
        eq(t.products.shopId, shopId),
        isNull(t.products.deletedAt),
        ne(t.products.status, 'hidden'),
      );
      const [[latest], [visibleCount]] = await Promise.all([
        db
          .select({
            id: t.products.id,
            name: t.products.name,
            price: t.products.price,
            photo: t.productPhotos.objectKey,
          })
          .from(t.products)
          .innerJoin(
            t.productPhotos,
            and(eq(t.productPhotos.productId, t.products.id), eq(t.productPhotos.position, 0)),
          )
          .where(and(visible, eq(t.products.status, 'available')))
          .orderBy(desc(t.products.createdAt))
          .limit(1),
        db.select({ n: count() }).from(t.products).where(visible),
      ]);
      return {
        shop: {
          name: shop!.name,
          slug: shop!.slug,
          logoUrl: publicUrl(shop!.logoPath),
          linkPrefix: `${shopBaseUrl.replace(/^https?:\/\//, '')}/`,
        },
        latest: latest
          ? {
              id: latest.id,
              name: latest.name,
              price: latest.price,
              photoUrl: publicUrl(latest.photo),
            }
          : null,
        productCount: visibleCount?.n ?? 0,
        channels: shop!.channels,
      };
    },

    /** The values on the More tab's rows (20-more). */
    async more(shopBaseUrl: string, now: Date = new Date()) {
      const [shop] = await db.select().from(t.shops).where(eq(t.shops.id, shopId));
      const week = periodWindow('week', now);
      const c = customerRows();
      const [[customers], [account], [areas], [categories], thisWeek] = await Promise.all([
        db.select({ n: count() }).from(c),
        db
          .select({ type: t.paymentAccounts.type, number: t.paymentAccounts.number })
          .from(t.paymentAccounts)
          .where(and(eq(t.paymentAccounts.shopId, shopId), eq(t.paymentAccounts.isActive, true))),
        db
          .select({ n: count() })
          .from(t.deliveryAreas)
          .where(and(eq(t.deliveryAreas.shopId, shopId), isNull(t.deliveryAreas.deletedAt))),
        db.select({ n: count() }).from(t.categories).where(eq(t.categories.shopId, shopId)),
        salesTotal(week.start, now),
      ]);
      return {
        shop: {
          name: shop!.name,
          slug: shop!.slug,
          url: `${shopBaseUrl}/${shop!.slug}`,
          linkPrefix: `${shopBaseUrl.replace(/^https?:\/\//, '')}/`,
          logoUrl: publicUrl(shop!.logoPath),
        },
        salesThisWeek: thisWeek,
        customers: customers?.n ?? 0,
        rating: {
          avg: shop!.ratingAvg === null ? null : Number(shop!.ratingAvg),
          count: shop!.ratingCount,
        },
        activeAccount: account ?? null,
        acceptsPayOnDelivery: shop!.acceptsPayOnDelivery,
        deliveryAreas: areas?.n ?? 0,
        pickupEnabled: shop!.pickupEnabled,
        categories: categories?.n ?? 0,
      };
    },
  };
}
