import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { anonCall, newSeller, type Json } from '@/test/sellerApi';
import { getDb } from './db';
import { getHome, listNotifications, markNotificationsRead } from './homeRoutes';
import { createManualOrder, quoteManualOrder } from './orderRoutes';
import { insertOrder } from './orders';
import { sellerHomeRepo } from './repos/sellerHome';
import type { SellerCtx } from './authz';

// M6 CP3: manual orders (priced on the server, the seller may change only the delivery fee),
// Home's sales this week in Nairobi days, and the notifications list; each seller only ever
// reaching their own shop.

const db = getDb();
const t = schema;

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await truncateAll(db);
});

async function world() {
  const s = await newSeller();
  const [dress, hidden] = await db
    .insert(t.products)
    .values([
      { shopId: s.shopId, name: 'Ankara wrap dress', price: 2500, sizes: ['M', 'L'] },
      { shopId: s.shopId, name: 'Old stock', price: 1000, status: 'hidden' },
    ])
    .returning();
  const [area] = await db
    .insert(t.deliveryAreas)
    .values({ shopId: s.shopId, name: 'Kilimani', fee: 200, method: 'rider' })
    .returning();
  return { ...s, dress: dress!, hidden: hidden!, area: area! };
}
type World = Awaited<ReturnType<typeof world>>;

const manual = (w: World, extra: Json = {}) => ({
  idempotencyKey: `manual-${randomUUID()}`,
  buyer: { name: 'Njeri Kamau', phone: '0724 880 145' },
  lines: [
    { productId: w.dress.id, qty: 1, size: 'M' },
    { productId: w.hidden.id, qty: 2 },
  ],
  fulfilment: { kind: 'delivery', areaId: w.area.id, addressText: 'Yaya Centre' },
  payment: 'not_paid',
  ...extra,
});

describe('manual orders', () => {
  it('quotes each option from the database, with the fee override when given', async () => {
    const w = await world();
    const q = await w.call(quoteManualOrder, { body: { lines: manual(w).lines } });
    expect(q.status).toBe(200);
    expect(q.json.subtotal).toBe(4500);
    expect(q.json.options).toEqual([
      expect.objectContaining({
        kind: 'delivery',
        name: 'Kilimani',
        deliveryFee: 200,
        total: 4700,
      }),
      // Pickup is always offered on a manual order, even when the shop's pickup is off.
      expect.objectContaining({ kind: 'pickup', name: 'Pickup', deliveryFee: 0, total: 4500 }),
    ]);
    const over = await w.call(quoteManualOrder, {
      body: { lines: manual(w).lines, deliveryFeeOverride: 0 },
    });
    expect(over.json.options[0]).toMatchObject({ deliveryFee: 0, total: 4500 });
  });

  it('never quotes another shop’s product (M10 CP1)', async () => {
    const w = await world();
    const other = await world();
    const q = await w.call(quoteManualOrder, {
      body: { lines: [{ productId: other.dress.id, qty: 1, size: 'M' }] },
    });
    expect(q.status).toBe(409);
    expect(q.json.options).toBeUndefined();
  });

  it('creates each payment kind; "not paid yet" gives the order link and never expires', async () => {
    const w = await world();
    const notPaid = await w.call(createManualOrder, { body: manual(w) });
    expect(notPaid.status).toBe(201);
    expect(notPaid.json).toMatchObject({
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      source: 'manual',
      total: 4700,
      buyer: { name: 'Njeri Kamau', phone: '+254724880145' },
    });
    expect(notPaid.json.link).toMatch(/\/o\/[A-Za-z0-9_-]{12}$/);

    const paid = await w.call(createManualOrder, {
      body: manual(w, { payment: 'paid', deliveryFeeOverride: 350 }),
    });
    expect(paid.json).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      deliveryFee: 350,
      total: 4850,
    });
    const pod = await w.call(createManualOrder, {
      body: manual(w, { payment: 'pay_on_delivery', fulfilment: { kind: 'pickup' } }),
    });
    expect(pod.json).toMatchObject({
      status: 'confirmed',
      paymentMethod: 'pay_on_delivery',
      paymentStatus: 'unpaid',
      fulfilment: 'pickup',
      total: 4500,
    });
    // Manual orders make no notifications (the seller made them).
    expect(await db.select().from(t.notifications)).toHaveLength(0);
  });

  it('a retry with the same key returns the same order', async () => {
    const w = await world();
    const body = manual(w);
    const first = await w.call(createManualOrder, { body });
    const again = await w.call(createManualOrder, { body });
    expect(again.json.id).toBe(first.json.id);
    expect(await db.select().from(t.orders)).toHaveLength(1);
  });

  it('refuses prices from the client, bad sizes and another shop’s products', async () => {
    const w = await world();
    const other = await world();
    const bad = async (body: Json) => (await w.call(createManualOrder, { body })).status;
    expect(await bad({ ...manual(w), total: 1 })).toBe(422);
    expect(
      await bad({ ...manual(w), lines: [{ productId: w.dress.id, qty: 1, unitPrice: 1 }] }),
    ).toBe(422);
    expect(await bad(manual(w, { lines: [{ productId: w.dress.id, qty: 1, size: 'XXL' }] }))).toBe(
      422,
    );
    expect(
      await bad(manual(w, { lines: [{ productId: other.dress.id, qty: 1, size: 'M' }] })),
    ).toBe(409);
    expect(
      await bad(
        manual(w, {
          fulfilment: { kind: 'delivery', areaId: other.area.id, addressText: 'Somewhere' },
        }),
      ),
    ).toBe(404);
    expect(await db.select().from(t.orders)).toHaveLength(0);
  });
});

describe('Home', () => {
  it('sales this week in Nairobi days, vs the same stretch last week, and the top source', async () => {
    const w = await world();
    const ctx = { userId: w.userId, shopId: w.shopId } as SellerCtx;
    const order = async (source: 'tt' | 'wa' | 'direct', confirmedAt: string | null, total = 0) => {
      const { order } = await insertOrder(db, {
        shopId: w.shopId,
        kind: 'manual_paid',
        buyer: { name: 'Buyer', phone: '0712 000 000' },
        fulfilment: { kind: 'pickup' },
        lines: [{ productId: w.hidden.id, qty: 1 }],
      });
      await db.execute(sql`
        update orders set source = ${source}, total = ${total || order.total}, subtotal = ${total || order.total}, delivery_fee = 0,
          placed_at = ${confirmedAt ?? new Date().toISOString()}::timestamptz,
          confirmed_at = ${confirmedAt}::timestamptz
        where id = ${order.id}`);
      return order;
    };
    // "Now" = Wednesday 7 Oct 2026, 10:00 Nairobi (07:00 UTC). The week starts Mon 5 Oct 00:00
    // Nairobi = Sun 4 Oct 21:00 UTC.
    const now = new Date('2026-10-07T07:00:00Z');
    await order('tt', '2026-10-04T21:30:00Z', 1000); // Mon 00:30 Nairobi → Monday
    await order('tt', '2026-10-07T06:00:00Z', 2000); // Wed → Today
    await order('wa', '2026-10-06T10:00:00Z', 500); // Tue
    await order('direct', '2026-10-04T20:30:00Z', 9999); // Sun 23:30: last week, after its same stretch
    await order('tt', '2026-09-29T08:00:00Z', 3000); // last Tue: in last week's same stretch

    const home = await sellerHomeRepo(db, ctx).home(now);
    expect(home.sales.days).toEqual([1000, 500, 2000, 0, 0, 0, 0]);
    expect(home.sales.todayIndex).toBe(2);
    expect(home.sales.thisWeek).toBe(3500);
    // Last week counts only Mon 28 Sep 00:00 → Wed 30 Sep 10:00 (the same stretch as now).
    expect(home.sales.lastWeek).toBe(3000);
    expect(home.sources).toEqual({ ordersThisWeek: 3, top: { source: 'tt', count: 2 } });
    expect(home.hasOrders).toBe(true);
  });

  it('the endpoint answers for the seller’s shop; unread notifications counted', async () => {
    const w = await world();
    const empty = await w.call(getHome);
    expect(empty.status).toBe(200);
    expect(empty.json).toMatchObject({ hasOrders: false, unreadNotifications: 0 });
    expect(empty.json.sales.days).toHaveLength(7);
    expect(await anonCall(getHome)).toBe(401);
  });

  it('lists what stops buyers ordering, with the buyer web’s rule (decision #109)', async () => {
    const s = await newSeller();
    const blockers = async () => (await s.call(getHome)).json.ordering.blockers;
    // A new shop: no delivery option, no payment account (pay before needs one).
    expect(await blockers()).toEqual(['delivery', 'payment']);

    await db
      .insert(t.deliveryAreas)
      .values({ shopId: s.shopId, name: 'Kilimani', fee: 200, method: 'rider' });
    expect(await blockers()).toEqual(['payment']);

    await db.insert(t.paymentAccounts).values({
      shopId: s.shopId,
      type: 'till',
      number: '123456',
      accountName: 'Amani Styles',
      isActive: true,
    });
    expect(await blockers()).toEqual([]);

    await db.update(t.shops).set({ isPaused: true }).where(eq(t.shops.id, s.shopId));
    expect(await blockers()).toEqual(['paused']);
  });
});

describe('notifications', () => {
  async function buyerOrder(w: World) {
    await db
      .update(t.shops)
      .set({ acceptsPayOnDelivery: true, pickupEnabled: true, pickupLocation: 'Stall' })
      .where(eq(t.shops.id, w.shopId));
    return insertOrder(db, {
      shopId: w.shopId,
      kind: 'buyer_pay_on_delivery',
      buyer: { name: 'Wanjiku', phone: '0712 345 901' },
      fulfilment: { kind: 'pickup' },
      lines: [{ productId: w.dress.id, qty: 1, size: 'M' }],
    });
  }

  it('lists newest first with the unread count; mark some, then all, read', async () => {
    const w = await world();
    const first = await buyerOrder(w);
    await buyerOrder(w);
    const list = await w.call(listNotifications);
    expect(list.json.unread).toBe(2);
    expect(list.json.notifications[0]).toMatchObject({ type: 'new_order', readAt: null });
    expect(list.json.notifications.map((n: Json) => n.orderId)).toContain(first.order.id);

    const one = await w.call(markNotificationsRead, {
      method: 'PATCH',
      body: { ids: [list.json.notifications[0].id] },
    });
    expect(one.json.unread).toBe(1);
    expect((await w.call(getHome)).json.unreadNotifications).toBe(1);
    const all = await w.call(markNotificationsRead, { method: 'PATCH', body: {} });
    expect(all.json.unread).toBe(0);
  });

  it("never lists or marks another shop's notifications", async () => {
    const a = await world();
    const b = await world();
    await buyerOrder(b);
    expect((await a.call(listNotifications)).json.notifications).toHaveLength(0);
    const theirs = (await b.call(listNotifications)).json.notifications[0].id;
    await a.call(markNotificationsRead, { method: 'PATCH', body: { ids: [theirs] } });
    await a.call(markNotificationsRead, { method: 'PATCH', body: {} });
    expect((await b.call(listNotifications)).json.unread).toBe(1);
    expect(await anonCall(listNotifications)).toBe(401);
  });
});
