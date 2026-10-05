import 'server-only';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  like,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  DONE_STATUSES,
  ORDER_PAGE_SIZE,
  orderSearch,
  sellerActions,
  TODO_STATUSES,
  todoGroup,
  type OrdersQuery,
  type TodoGroup,
} from '@oda/shared';
import type { SellerCtx } from '../authz';
import { orderLink } from '../orderLink';
import { publicUrl } from '../uploads';
import { checkId, one } from './util';

// The seller's orders (M6 CP2, spec §5.4): the Orders tab (To do / All / Done, search, pages)
// and the order detail. Every query is scoped to the seller's shop, so another shop's order is
// a plain 404. Writes don't live here: orders change only through transitionOrder().

const t = schema;
type OrderRow = typeof t.orders.$inferSelect;

const TODO_LIMIT = 200;
// Pages are keyed by (placed time in ms, id): the cursor carries milliseconds, so compare and
// sort on the time truncated to them (Postgres keeps microseconds).
const placedMs = sql<Date>`date_trunc('milliseconds', ${t.orders.placedAt})`;
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (m) => `\\${m}`);

export function sellerOrdersRepo(db: Db, ctx: SellerCtx) {
  const { shopId } = ctx;
  const inShop = eq(t.orders.shopId, shopId);

  async function itemsOf(orderIds: string[]) {
    if (orderIds.length === 0) return [];
    return db
      .select()
      .from(t.orderItems)
      .where(inArray(t.orderItems.orderId, orderIds))
      .orderBy(asc(t.orderItems.createdAt));
  }

  /** How many orders wait in each To-do group (the tab badge and the group headers). */
  async function todoCounts(): Promise<Record<TodoGroup, number> & { total: number }> {
    const rows = await db
      .select({ status: t.orders.status, n: count() })
      .from(t.orders)
      .where(and(inShop, inArray(t.orders.status, [...TODO_STATUSES])))
      .groupBy(t.orders.status);
    const counts = { confirm_payment: 0, new_to_accept: 0, new_awaiting_payment: 0, to_send: 0 };
    for (const r of rows) counts[todoGroup(r.status)!] += r.n;
    return { ...counts, total: rows.reduce((sum, r) => sum + r.n, 0) };
  }

  return {
    todoCounts,

    /** The Orders tab. To do comes whole (it's what's waiting); All and Done come in pages. */
    async list(query: OrdersQuery) {
      const conditions: (SQL | undefined)[] = [inShop];
      if (query.tab === 'todo') conditions.push(inArray(t.orders.status, [...TODO_STATUSES]));
      if (query.tab === 'done') conditions.push(inArray(t.orders.status, [...DONE_STATUSES]));
      if (query.q) {
        const s = orderSearch(query.q);
        conditions.push(
          or(
            ilike(t.orders.buyerName, `%${escapeLike(s.name)}%`),
            s.phoneDigits ? like(t.orders.buyerPhone, `%${escapeLike(s.phoneDigits)}%`) : undefined,
            s.number !== null ? eq(t.orders.number, s.number) : undefined,
          ),
        );
      }
      const paged = query.tab !== 'todo';
      if (paged && query.cursor) {
        const [ms, id] = query.cursor.split('_') as [string, string];
        const at = new Date(Number(ms));
        conditions.push(
          or(lt(placedMs, at), and(eq(placedMs, at), lt(t.orders.id, checkId(id, 'page')))),
        );
      }
      const limit = paged ? ORDER_PAGE_SIZE : TODO_LIMIT;
      const rows = await db
        .select()
        .from(t.orders)
        .where(and(...conditions))
        .orderBy(desc(placedMs), desc(t.orders.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const items = await itemsOf(page.map((o) => o.id));
      const last = page.at(-1);
      return {
        orders: page.map((o) => {
          const mine = items.filter((i) => i.orderId === o.id);
          return {
            id: o.id,
            number: o.number,
            buyerName: o.buyerName,
            total: o.total,
            status: o.status,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            source: o.source,
            placedAt: o.placedAt,
            todoGroup: todoGroup(o.status),
            itemNames: mine.map((i) => i.nameSnapshot),
            thumbUrl: publicUrl(mine[0]?.coverPathSnapshot),
          };
        }),
        next:
          paged && rows.length > limit && last ? `${last.placedAt!.getTime()}_${last.id}` : null,
        todoCounts: await todoCounts(),
      };
    },

    /** The order detail: items, buyer, delivery, money, claims (with the duplicate flag). */
    async detail(id: string) {
      const order = one(
        await db
          .select()
          .from(t.orders)
          .where(and(eq(t.orders.id, checkId(id, 'order')), inShop)),
        'order',
      );
      const [items, events, claims, shop] = await Promise.all([
        itemsOf([order.id]),
        db
          .select()
          .from(t.orderEvents)
          .where(eq(t.orderEvents.orderId, order.id))
          .orderBy(asc(t.orderEvents.createdAt)),
        db
          .select()
          .from(t.paymentClaims)
          .where(eq(t.paymentClaims.orderId, order.id))
          .orderBy(asc(t.paymentClaims.createdAt)),
        db
          .select({
            name: t.shops.name,
            pickupLocation: t.shops.pickupLocation,
            pickupHours: t.shops.pickupHours,
          })
          .from(t.shops)
          .where(eq(t.shops.id, shopId)),
      ]);
      const codes = [...new Set(claims.map((c) => c.mpesaCode))];
      // "This code was used on order #1031": the same code on another order of this shop.
      const reused = codes.length
        ? await db
            .select({ code: t.paymentClaims.mpesaCode, number: t.orders.number })
            .from(t.paymentClaims)
            .innerJoin(t.orders, eq(t.orders.id, t.paymentClaims.orderId))
            .where(
              and(
                eq(t.paymentClaims.shopId, shopId),
                inArray(t.paymentClaims.mpesaCode, codes),
                ne(t.paymentClaims.orderId, order.id),
              ),
            )
            .orderBy(asc(t.paymentClaims.createdAt))
        : [];
      return toDetail(order, {
        items: items.map((i) => ({
          id: i.id,
          name: i.nameSnapshot,
          size: i.size,
          colour: i.colour,
          qty: i.qty,
          unitPrice: i.unitPrice,
          thumbUrl: publicUrl(i.coverPathSnapshot),
        })),
        events: events.map((e) => ({
          from: e.fromStatus,
          to: e.toStatus,
          actor: e.actor,
          action: (e.meta as { action?: string } | null)?.action ?? null,
          at: e.createdAt,
        })),
        claims: claims.map((c) => ({
          id: c.id,
          code: c.mpesaCode,
          outcome: c.outcome,
          createdAt: c.createdAt,
          duplicateOfOrderNumber: reused.find((r) => r.code === c.mpesaCode)?.number ?? null,
        })),
        shop: shop[0] ?? { name: '', pickupLocation: null, pickupHours: null },
      });
    },
  };
}

function toDetail(
  o: OrderRow,
  extra: {
    items: unknown[];
    events: unknown[];
    claims: unknown[];
    shop: { name: string; pickupLocation: string | null; pickupHours: string | null };
  },
) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    source: o.source,
    placedAt: o.placedAt,
    claimedAt: o.claimedAt,
    confirmedAt: o.confirmedAt,
    paidAt: o.paidAt,
    sentAt: o.sentAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    refundedAt: o.refundedAt,
    buyer: {
      name: o.buyerName,
      phone: o.buyerPhone,
      whatsapp: o.buyerWhatsapp,
      /** The buyer gets order emails (the address itself stays private). */
      hasEmail: !!o.buyerEmail,
    },
    fulfilment: o.fulfilment,
    deliveryAreaName: o.deliveryAreaName,
    addressText: o.addressText,
    sentMethod: o.sentMethod,
    riderPhone: o.riderPhone,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    paymentAccount: o.paymentAccountSnapshot as {
      type: 'till' | 'pochi' | 'paybill';
      number: string;
      name: string;
      accountRef: string | null;
    } | null,
    mpesaCode: o.mpesaCode,
    cancel: o.cancelReason
      ? { reason: o.cancelReason, note: o.cancelNote, by: o.cancelledBy }
      : null,
    actions: sellerActions(o),
    shop: extra.shop,
    items: extra.items,
    events: extra.events,
    claims: extra.claims,
    /** The buyer's order page, for the seller to send (the token is how buyers reach it). */
    link: orderLink(o.publicToken),
  };
}

export type SellerOrderDetail = ReturnType<typeof toDetail>;
