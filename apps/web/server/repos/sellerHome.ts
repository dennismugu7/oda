import 'server-only';
import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  isSale,
  ORDER_STATUSES,
  TAGGED_SOURCES,
  type NotificationsReadBody,
  type OrderSource,
} from '@oda/shared';
import type { SellerCtx } from '../authz';

// Home (designs 15, 16; M6 CP3) and the notifications list, scoped to the seller's shop.
// Sales follow order-lifecycle.md: an order counts while confirmed, sent or delivered, dated by
// confirmed_at, bucketed by the Nairobi calendar; the total includes delivery fees.

const t = schema;
const SALE_STATUSES = ORDER_STATUSES.filter(isSale);
const NAIROBI = 'Africa/Nairobi';

export function sellerHomeRepo(db: Db, ctx: SellerCtx) {
  const { shopId } = ctx;

  async function notifications(limit = 100) {
    const rows = await db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.shopId, shopId))
      .orderBy(desc(t.notifications.createdAt))
      .limit(Math.min(limit, 200));
    const [unread] = await db
      .select({ n: count() })
      .from(t.notifications)
      .where(and(eq(t.notifications.shopId, shopId), isNull(t.notifications.readAt)));
    return {
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        orderId: n.orderId,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      unread: unread?.n ?? 0,
    };
  }

  return {
    async home(now: Date = new Date()) {
      // Monday 00:00 Nairobi of this week, as a timestamptz; and the same moment a week ago.
      const [bounds] = await db
        .execute<{ week_start: Date; today_index: number }>(
          sql`
        select (date_trunc('week', ${now}::timestamptz at time zone ${NAIROBI}) at time zone ${NAIROBI}) as week_start,
               (extract(isodow from ${now}::timestamptz at time zone ${NAIROBI}))::int - 1 as today_index
      `,
        )
        .then((r) => r.rows);
      const weekStart = new Date(bounds!.week_start);
      const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
      // "vs last week": the same stretch of last week (Monday up to this moment, a week ago).
      const sameMomentLastWeek = new Date(now.getTime() - 7 * 86_400_000);
      const sale = and(eq(t.orders.shopId, shopId), inArray(t.orders.status, SALE_STATUSES));

      const days = await db
        .select({
          day: sql<number>`(extract(isodow from ${t.orders.confirmedAt} at time zone ${NAIROBI}))::int - 1`,
          total: sql<number>`sum(${t.orders.total})::int`,
        })
        .from(t.orders)
        .where(and(sale, gte(t.orders.confirmedAt, weekStart), lt(t.orders.confirmedAt, now)))
        .groupBy(sql`1`);
      const [last] = await db
        .select({ total: sql<number>`coalesce(sum(${t.orders.total}), 0)::int` })
        .from(t.orders)
        .where(
          and(
            sale,
            gte(t.orders.confirmedAt, lastWeekStart),
            lt(t.orders.confirmedAt, sameMomentLastWeek),
          ),
        );
      const bars = [0, 0, 0, 0, 0, 0, 0];
      for (const d of days) bars[d.day] = d.total;

      // Where this week's orders came from (any status: a visit that turned into an order).
      const placed = and(eq(t.orders.shopId, shopId), gte(t.orders.placedAt, weekStart));
      const sources = await db
        .select({ source: t.orders.source, n: count() })
        .from(t.orders)
        .where(placed)
        .groupBy(t.orders.source)
        .orderBy(desc(count()));
      const ordersThisWeek = sources.reduce((sum, s) => sum + s.n, 0);
      const top = sources.find((s) => TAGGED_SOURCES.includes(s.source as OrderSource));

      const [[anyOrder], [unread], [profile]] = await Promise.all([
        db.select({ id: t.orders.id }).from(t.orders).where(eq(t.orders.shopId, shopId)).limit(1),
        db
          .select({ n: count() })
          .from(t.notifications)
          .where(and(eq(t.notifications.shopId, shopId), isNull(t.notifications.readAt))),
        db
          .select({ firstName: t.profiles.firstName })
          .from(t.profiles)
          .where(eq(t.profiles.id, ctx.userId)),
      ]);

      return {
        firstName: profile?.firstName ?? null,
        hasOrders: !!anyOrder,
        unreadNotifications: unread?.n ?? 0,
        sales: {
          thisWeek: bars.reduce((a, b) => a + b, 0),
          lastWeek: last?.total ?? 0,
          /** Mon–Sun, Nairobi days. */
          days: bars,
          todayIndex: bounds!.today_index,
        },
        sources: {
          ordersThisWeek,
          top: top ? { source: top.source, count: top.n } : null,
        },
      };
    },

    notifications,

    /** Marks these notifications read (only the shop's own; others are ignored), or all. */
    async markRead(input: NotificationsReadBody) {
      await db
        .update(t.notifications)
        .set({ readAt: sql`coalesce(${t.notifications.readAt}, now())` })
        .where(
          and(
            eq(t.notifications.shopId, shopId),
            isNull(t.notifications.readAt),
            input.ids ? inArray(t.notifications.id, input.ids) : undefined,
          ),
        );
      return notifications();
    },
  };
}
