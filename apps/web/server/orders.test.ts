import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { createShopFixture, truncateAll } from '@oda/db/testing';
import { requireOrderToken, type SellerCtx } from './authz';
import { getDb } from './db';
import { ConflictError, HttpError } from './errors';
import {
  insertOrder,
  nextOrderNumber,
  transitionOrder,
  type NewOrder,
  type TransitionAction,
  type TransitionScope,
} from './orders';

// insertOrder(), transitionOrder() and nextOrderNumber() against oda_test.

const db = getDb();
const t = schema;

async function fails(p: Promise<unknown>): Promise<HttpError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpError) return e;
    throw e;
  }
  throw new Error('Expected an HttpError');
}

const SMS =
  'SFK7Q2M9TX Confirmed. Ksh2,700.00 sent to AMANI STYLES 5123456 on 1/10/26 at 3:15 PM. New M-PESA balance is Ksh1,000.00.';

async function world(
  opts: { payOnDelivery?: boolean; pickup?: boolean; threshold?: number | null } = {},
) {
  const { shopId, userId } = await createShopFixture(db, {
    slug: `shop-${randomUUID().slice(0, 6)}`,
  });
  await db
    .update(t.shops)
    .set({
      acceptsPayOnDelivery: opts.payOnDelivery ?? true,
      pickupEnabled: opts.pickup ?? true,
      freeDeliveryThreshold: opts.threshold ?? null,
    })
    .where(eq(t.shops.id, shopId));
  const [dress, top] = await db
    .insert(t.products)
    .values([
      { shopId, name: 'Ankara wrap dress', price: 2500, sizes: ['S', 'M', 'L'] },
      { shopId, name: 'Kitenge top', price: 1200 },
    ])
    .returning();
  await db.insert(t.productPhotos).values({
    productId: dress!.id,
    objectKey: `products/${shopId}/d.jpg`,
    thumbKey: `products/${shopId}/d-t.jpg`,
  });
  const [area] = await db
    .insert(t.deliveryAreas)
    .values({ shopId, name: 'Kilimani', fee: 200, method: 'rider', freeDeliveryEligible: true })
    .returning();
  const [account] = await db
    .insert(t.paymentAccounts)
    .values({
      shopId,
      type: 'till',
      number: '5123456',
      accountName: 'AMANI STYLES',
      isActive: true,
    })
    .returning();
  const ctx = { userId, shopId } as SellerCtx;
  return { shopId, ctx, dress: dress!, top: top!, area: area!, account: account! };
}
type World = Awaited<ReturnType<typeof world>>;

function newOrder(w: World, overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    shopId: w.shopId,
    kind: 'buyer_pay_now',
    source: 'tt',
    buyer: { name: 'Wanjiku Mwangi', phone: '0712 345 901' },
    fulfilment: { kind: 'delivery', areaId: w.area.id, addressText: 'Argwings Kodhek Rd, Hse 4' },
    lines: [{ productId: w.dress.id, qty: 1, size: 'M' }],
    ...overrides,
  };
}

const seller = (w: World, orderId: string): TransitionScope => ({
  kind: 'seller',
  ctx: w.ctx,
  orderId,
});
async function buyer(token: string): Promise<TransitionScope> {
  return { kind: 'buyer', ctx: await requireOrderToken(token) };
}
const reload = async (id: string) =>
  (await db.select().from(t.orders).where(eq(t.orders.id, id)))[0]!;
const events = (id: string) =>
  db
    .select()
    .from(t.orderEvents)
    .where(eq(t.orderEvents.orderId, id))
    .orderBy(asc(t.orderEvents.createdAt));
const claims = (id: string) =>
  db
    .select()
    .from(t.paymentClaims)
    .where(eq(t.paymentClaims.orderId, id))
    .orderBy(asc(t.paymentClaims.createdAt));
const product = async (id: string) =>
  (await db.select().from(t.products).where(eq(t.products.id, id)))[0]!;
const shop = async (id: string) => (await db.select().from(t.shops).where(eq(t.shops.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await truncateAll(db);
});

describe('insertOrder', () => {
  it('prices from the database and snapshots the line, account and source', async () => {
    const w = await world();
    const { order, sideEffects } = await insertOrder(
      db,
      newOrder(w, {
        lines: [
          { productId: w.dress.id, qty: 2, size: 'M' },
          { productId: w.top.id, qty: 1 },
        ],
      }),
    );
    expect(order).toMatchObject({
      number: 1001,
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      paymentMethod: 'pay_before',
      buyerPhone: '+254712345901',
      subtotal: 6200,
      deliveryFee: 200,
      total: 6400,
      source: 'tt',
      deliveryAreaName: 'Kilimani',
      paymentAccountSnapshot: {
        type: 'till',
        number: '5123456',
        name: 'AMANI STYLES',
        accountRef: null,
      },
    });
    expect(order.publicToken).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(order.awaitingPaymentSince).toBeInstanceOf(Date);
    expect(sideEffects).toEqual([
      { kind: 'push', type: 'new_order' },
      { kind: 'email', template: 'receipt' },
    ]);
    const items = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, order.id));
    expect(items.find((i) => i.productId === w.dress.id)).toMatchObject({
      nameSnapshot: 'Ankara wrap dress',
      unitPrice: 2500,
      size: 'M',
      coverPathSnapshot: `products/${w.shopId}/d-t.jpg`,
    });
    expect(await events(order.id)).toMatchObject([
      { fromStatus: null, toStatus: 'awaiting_payment', actor: 'buyer' },
    ]);
  });

  it('applies free delivery and pickup; the fee override is for manual orders only', async () => {
    const w = await world({ threshold: 2500 });
    expect((await insertOrder(db, newOrder(w))).order.deliveryFee).toBe(0);
    expect(
      (await insertOrder(db, newOrder(w, { fulfilment: { kind: 'pickup' } }))).order,
    ).toMatchObject({
      deliveryFee: 0,
      deliveryAreaId: null,
      fulfilment: 'pickup',
    });
    expect((await fails(insertOrder(db, newOrder(w, { deliveryFeeOverride: 0 })))).status).toBe(
      422,
    );
    const manual = await insertOrder(
      db,
      newOrder(w, { kind: 'manual_not_paid', deliveryFeeOverride: 350 }),
    );
    expect(manual.order).toMatchObject({ deliveryFee: 350, total: 2850, source: 'manual' });
    expect(manual.sideEffects).toEqual([{ kind: 'order_link' }]);
  });

  it('creates each manual kind in its initial state', async () => {
    const w = await world();
    const paid = (await insertOrder(db, newOrder(w, { kind: 'manual_paid' }))).order;
    expect(paid).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'pay_before',
    });
    expect(paid.paidAt).toBeInstanceOf(Date);
    const pod = (await insertOrder(db, newOrder(w, { kind: 'manual_pay_on_delivery' }))).order;
    expect(pod).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'unpaid',
      paymentMethod: 'pay_on_delivery',
    });
    expect(pod.paymentAccountSnapshot).toBeNull();
    // Sales count straight away (units_sold trigger).
    expect((await product(w.dress.id)).unitsSold).toBe(2);
  });

  it('refuses what the shop doesn’t allow', async () => {
    const w = await world({ payOnDelivery: false, pickup: false });
    const cases: [Partial<NewOrder>, number][] = [
      [{ kind: 'buyer_pay_on_delivery' }, 409],
      [{ fulfilment: { kind: 'pickup' } }, 422],
      [{ lines: [] }, 422],
      [{ lines: [{ productId: w.dress.id, qty: 1 }] }, 422], // size missing
      [{ lines: [{ productId: w.dress.id, qty: 1, size: 'XXL' }] }, 422],
      [{ lines: [{ productId: w.top.id, qty: 100 }] }, 422],
      [{ lines: [{ productId: randomUUID(), qty: 1 }] }, 409],
      [{ buyer: { name: 'W', phone: '+44 20 7946 0958' } }, 422],
      [{ fulfilment: { kind: 'delivery', areaId: randomUUID(), addressText: 'x' } }, 404],
    ];
    for (const [overrides, status] of cases) {
      expect(
        (await fails(insertOrder(db, newOrder(w, overrides)))).status,
        JSON.stringify(overrides),
      ).toBe(status);
    }
    await db.update(t.products).set({ status: 'sold_out' }).where(eq(t.products.id, w.top.id));
    expect(
      (await fails(insertOrder(db, newOrder(w, { lines: [{ productId: w.top.id, qty: 1 }] }))))
        .status,
    ).toBe(409);
    await db.update(t.shops).set({ isPaused: true }).where(eq(t.shops.id, w.shopId));
    expect((await fails(insertOrder(db, newOrder(w)))).status).toBe(409);
    // No pay-now without an active account.
    await db.update(t.shops).set({ isPaused: false }).where(eq(t.shops.id, w.shopId));
    await db
      .update(t.paymentAccounts)
      .set({ isActive: false })
      .where(eq(t.paymentAccounts.id, w.account.id));
    expect((await fails(insertOrder(db, newOrder(w)))).status).toBe(409);
    // Nothing was created, and no number was used up.
    expect(await db.select().from(t.orders)).toHaveLength(0);
    expect((await shop(w.shopId)).orderCounter).toBe(1000);
  });

  it('can’t order another shop’s product or area', async () => {
    const a = await world();
    const b = await world();
    expect(
      (await fails(insertOrder(db, newOrder(a, { lines: [{ productId: b.top.id, qty: 1 }] }))))
        .status,
    ).toBe(409);
    expect(
      (
        await fails(
          insertOrder(
            db,
            newOrder(a, { fulfilment: { kind: 'delivery', areaId: b.area.id, addressText: 'x' } }),
          ),
        )
      ).status,
    ).toBe(404);
  });

  it('a paybill with "use the order number" shows the order number as the reference', async () => {
    const w = await world();
    await db
      .update(t.paymentAccounts)
      .set({ type: 'paybill', number: '247247', accountRefMode: 'order_number' })
      .where(eq(t.paymentAccounts.id, w.account.id));
    const { order } = await insertOrder(db, newOrder(w));
    expect(order.paymentAccountSnapshot).toMatchObject({ type: 'paybill', accountRef: '1001' });
  });

  it('the same idempotency key returns the same order, even when sent twice at once', async () => {
    const w = await world();
    const input = newOrder(w, { idempotencyKey: 'checkout-abc' });
    const [one, two] = await Promise.all([insertOrder(db, input), insertOrder(db, input)]);
    expect(one.order.id).toBe(two.order.id);
    expect([one.replayed, two.replayed].sort()).toEqual([false, true]);
    expect((await insertOrder(db, input)).replayed).toBe(true);
    expect(await db.select().from(t.orders)).toHaveLength(1);
  });

  it('a key another shop used makes a new order in this shop, never that shop’s (decisions #84, #93)', async () => {
    const a = await world();
    const b = await world();
    const { order } = await insertOrder(db, newOrder(a, { idempotencyKey: 'shared-key-123456' }));
    const other = await insertOrder(db, newOrder(b, { idempotencyKey: 'shared-key-123456' }));
    expect(other.replayed).toBe(false);
    expect(other.order.shopId).toBe(b.shopId);
    expect(other.order.id).not.toBe(order.id);
    // A retry in shop B still finds B's order.
    const again = await insertOrder(db, newOrder(b, { idempotencyKey: 'shared-key-123456' }));
    expect(again).toMatchObject({ replayed: true, order: { id: other.order.id } });
  });

  it('order numbers are sequential per shop under concurrency', async () => {
    const a = await world();
    const b = await world();
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () =>
        insertOrder(db, newOrder(a, { lines: [{ productId: a.top.id, qty: 1 }] })),
      ),
      ...Array.from({ length: 4 }, () =>
        insertOrder(db, newOrder(b, { lines: [{ productId: b.top.id, qty: 1 }] })),
      ),
    ]);
    const numbers = (shopId: string) =>
      results
        .filter((r) => r.order.shopId === shopId)
        .map((r) => r.order.number)
        .sort();
    expect(numbers(a.shopId)).toEqual([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008]);
    expect(numbers(b.shopId)).toEqual([1001, 1002, 1003, 1004]);
    expect(await nextOrderNumber(db, a.shopId)).toBe(1009);
  });
});

describe('transitionOrder: each action end to end', () => {
  it('pay now: submit code → confirm → sent → delivered, with counters', async () => {
    const w = await world();
    const { order } = await insertOrder(
      db,
      newOrder(w, { lines: [{ productId: w.dress.id, qty: 2, size: 'S' }] }),
    );

    const claimed = await transitionOrder(db, await buyer(order.publicToken), {
      type: 'submitCode',
      message: SMS,
    });
    expect(claimed.order).toMatchObject({
      status: 'payment_claimed',
      paymentStatus: 'claimed',
      mpesaCode: 'SFK7Q2M9TX',
    });
    expect(claimed.order.claimedAt).toBeInstanceOf(Date);
    expect(claimed.duplicateOfOrderNumber).toBeUndefined();
    expect(await claims(order.id)).toMatchObject([
      { mpesaCode: 'SFK7Q2M9TX', outcome: 'pending', rawMessage: SMS },
    ]);
    expect((await product(w.dress.id)).unitsSold).toBe(0);

    const confirmed = await transitionOrder(db, seller(w, order.id), { type: 'confirmPayment' });
    expect(confirmed.order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(confirmed.order.paidAt).toBeInstanceOf(Date);
    expect(confirmed.sideEffects).toContainEqual({ kind: 'email', template: 'payment_confirmed' });
    expect(await claims(order.id)).toMatchObject([{ outcome: 'confirmed' }]);
    expect((await product(w.dress.id)).unitsSold).toBe(2);

    const sent = await transitionOrder(db, seller(w, order.id), {
      type: 'markSent',
      sentMethod: 'rider',
      riderPhone: '0722 000 111',
    });
    expect(sent.order).toMatchObject({
      status: 'sent',
      sentMethod: 'rider',
      riderPhone: '+254722000111',
    });

    const delivered = await transitionOrder(db, seller(w, order.id), { type: 'markDelivered' });
    expect(delivered.order.status).toBe('delivered');
    expect(delivered.sideEffects).toContainEqual({ kind: 'review_unlocked' });
    expect((await shop(w.shopId)).deliveredCount).toBe(1);
    expect((await product(w.dress.id)).unitsSold).toBe(2);

    expect((await events(order.id)).map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
      [null, 'awaiting_payment', 'buyer'],
      ['awaiting_payment', 'payment_claimed', 'buyer'],
      ['payment_claimed', 'confirmed', 'seller'],
      ['confirmed', 'sent', 'seller'],
      ['sent', 'delivered', 'seller'],
    ]);
  });

  it('payment not found keeps the claim and restarts the 48h clock', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    // Pretend the order has been waiting for a day (timestamps aren't guarded).
    await db.execute(
      sql`update orders set awaiting_payment_since = now() - interval '1 day' where id = ${order.id}`,
    );
    const before = (await reload(order.id)).awaitingPaymentSince!;
    await transitionOrder(db, await buyer(order.publicToken), {
      type: 'submitCode',
      message: 'sfk7q2m9tx',
    });
    const back = await transitionOrder(db, seller(w, order.id), { type: 'paymentNotFound' });
    expect(back.order).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
    expect(back.order.awaitingPaymentSince!.getTime()).toBeGreaterThan(
      before.getTime() + 3_600_000,
    );
    expect(back.sideEffects).toContainEqual({ kind: 'buyer_banner', banner: 'payment_not_found' });
    expect(await claims(order.id)).toMatchObject([{ outcome: 'not_found', rawMessage: null }]);

    // A new code can be submitted; a second claim is kept alongside the first.
    await transitionOrder(db, await buyer(order.publicToken), {
      type: 'submitCode',
      message: 'TGA1B2C3D4',
    });
    expect((await claims(order.id)).map((c) => c.outcome)).toEqual(['not_found', 'pending']);
  });

  it('flags a code already used on another order of the same shop', async () => {
    const w = await world();
    const first = (await insertOrder(db, newOrder(w))).order;
    const second = (await insertOrder(db, newOrder(w))).order;
    const other = await world();
    const elsewhere = (await insertOrder(db, newOrder(other))).order;
    await transitionOrder(db, await buyer(elsewhere.publicToken), {
      type: 'submitCode',
      message: SMS,
    });
    expect(
      (
        await transitionOrder(db, await buyer(first.publicToken), {
          type: 'submitCode',
          message: SMS,
        })
      ).duplicateOfOrderNumber,
    ).toBeUndefined();
    const dup = await transitionOrder(db, await buyer(second.publicToken), {
      type: 'submitCode',
      message: SMS,
    });
    expect(dup.duplicateOfOrderNumber).toBe(first.number);
    expect(dup.order.status).toBe('payment_claimed'); // flagged, not blocked
  });

  it('rejects text without an M-Pesa code (422) and changes nothing', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    const err = await fails(
      transitionOrder(db, await buyer(order.publicToken), {
        type: 'submitCode',
        message: 'I paid',
      }),
    );
    expect(err).toMatchObject({ status: 422, code: 'invalid_code' });
    expect(await reload(order.id)).toEqual(order);
  });

  it('switch to pay on delivery → accept; only if the shop takes it', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    const switched = await transitionOrder(db, await buyer(order.publicToken), {
      type: 'switchToPod',
    });
    expect(switched.order).toMatchObject({
      status: 'awaiting_acceptance',
      paymentMethod: 'pay_on_delivery',
    });
    const accepted = await transitionOrder(db, seller(w, order.id), { type: 'accept' });
    expect(accepted.order).toMatchObject({ status: 'confirmed', paymentStatus: 'unpaid' });

    const off = await world({ payOnDelivery: false });
    const o2 = (await insertOrder(db, newOrder(off))).order;
    expect(
      await fails(transitionOrder(db, await buyer(o2.publicToken), { type: 'switchToPod' })),
    ).toMatchObject({
      status: 422,
      code: 'pay_on_delivery_off',
    });
  });

  it('pay on delivery: delivered needs "collected", then payment is paid', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w, { kind: 'buyer_pay_on_delivery' }));
    expect(order).toMatchObject({ status: 'awaiting_acceptance', awaitingPaymentSince: null });
    await transitionOrder(db, seller(w, order.id), { type: 'accept' });
    await transitionOrder(db, seller(w, order.id), { type: 'markSent', sentMethod: 'parcel' });
    expect(
      await fails(transitionOrder(db, seller(w, order.id), { type: 'markDelivered' })),
    ).toMatchObject({
      status: 422,
      code: 'not_collected',
    });
    const done = await transitionOrder(db, seller(w, order.id), {
      type: 'markDelivered',
      collected: true,
    });
    expect(done.order).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(done.order.paidAt).toBeInstanceOf(Date);
  });

  it('mark paid without a code', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w, { kind: 'manual_not_paid' }));
    const paid = await transitionOrder(db, seller(w, order.id), { type: 'markPaid' });
    expect(paid.order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
  });

  it('buyer cancel while claimed → seller resolves the claim', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    await transitionOrder(db, await buyer(order.publicToken), { type: 'submitCode', message: SMS });
    const cancelled = await transitionOrder(db, await buyer(order.publicToken), {
      type: 'buyerCancel',
    });
    expect(cancelled.order).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'claimed',
      cancelReason: 'buyer_cancelled',
      cancelledBy: 'buyer',
    });
    const resolved = await transitionOrder(db, seller(w, order.id), {
      type: 'resolveClaim',
      received: true,
    });
    expect(resolved.order.paymentStatus).toBe('refund_due');
    expect(await claims(order.id)).toMatchObject([{ outcome: 'confirmed' }]);
    const refunded = await transitionOrder(db, seller(w, order.id), { type: 'markRefundSent' });
    expect(refunded.order.paymentStatus).toBe('refunded');
    expect(refunded.order.refundedAt).toBeInstanceOf(Date);
  });

  it('seller cancel: a paid sale becomes refund_due and stops counting', async () => {
    const w = await world();
    const { order } = await insertOrder(
      db,
      newOrder(w, { kind: 'manual_paid', lines: [{ productId: w.top.id, qty: 3 }] }),
    );
    expect((await product(w.top.id)).unitsSold).toBe(3);
    const cancelled = await transitionOrder(db, seller(w, order.id), {
      type: 'sellerCancel',
      reason: 'out_of_stock',
      note: '  Sold out in store ',
    });
    expect(cancelled.order).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'refund_due',
      cancelReason: 'out_of_stock',
      cancelledBy: 'seller',
      cancelNote: 'Sold out in store',
    });
    expect((await product(w.top.id)).unitsSold).toBe(0);
  });

  it('seller cancel while claimed needs the answer; "no" marks the claim not found', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    await transitionOrder(db, await buyer(order.publicToken), { type: 'submitCode', message: SMS });
    expect(
      await fails(
        transitionOrder(db, seller(w, order.id), { type: 'sellerCancel', reason: 'buyer_asked' }),
      ),
    ).toMatchObject({ status: 422, code: 'missing_answer' });
    const done = await transitionOrder(db, seller(w, order.id), {
      type: 'sellerCancel',
      reason: 'payment_not_received',
      receivedClaimed: false,
    });
    expect(done.order.paymentStatus).toBe('unpaid');
    expect(await claims(order.id)).toMatchObject([{ outcome: 'not_found' }]);
  });

  it('auto-expire: buyer orders only', async () => {
    const w = await world();
    const buyerOrder = (await insertOrder(db, newOrder(w))).order;
    const expired = await transitionOrder(
      db,
      { kind: 'system', orderId: buyerOrder.id },
      { type: 'autoExpire' },
    );
    expect(expired.order).toMatchObject({
      status: 'cancelled',
      cancelReason: 'expired',
      cancelledBy: 'system',
    });
    expect((await events(buyerOrder.id)).at(-1)?.actor).toBe('system');

    const manual = (await insertOrder(db, newOrder(w, { kind: 'manual_not_paid' }))).order;
    expect(
      await fails(
        transitionOrder(db, { kind: 'system', orderId: manual.id }, { type: 'autoExpire' }),
      ),
    ).toMatchObject({ status: 422, code: 'manual_order_never_expires' });
  });
});

describe('transitionOrder: scope, forbidden actions and races', () => {
  it('a forbidden action is 422 and changes nothing (no event either)', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    const attempts: [TransitionScope, TransitionAction][] = [
      [seller(w, order.id), { type: 'markSent', sentMethod: 'rider' }],
      [seller(w, order.id), { type: 'confirmPayment' }],
      [seller(w, order.id), { type: 'markRefundSent' }],
      [seller(w, order.id), { type: 'resolveClaim', received: true }],
      // A buyer can't do a seller's action, and the reverse.
      [await buyer(order.publicToken), { type: 'markPaid' }],
      [seller(w, order.id), { type: 'buyerCancel' }],
      [seller(w, order.id), { type: 'autoExpire' }],
    ];
    for (const [scope, action] of attempts) {
      expect((await fails(transitionOrder(db, scope, action))).status, action.type).toBe(422);
    }
    expect(await reload(order.id)).toEqual(order);
    expect(await events(order.id)).toHaveLength(1);
  });

  it('another shop’s order is 404, by id or by a guessed token', async () => {
    const a = await world();
    const b = await world();
    const { order } = await insertOrder(db, newOrder(b));
    expect(
      (await fails(transitionOrder(db, seller(a, order.id), { type: 'markPaid' }))).status,
    ).toBe(404);
    expect(
      (await fails(transitionOrder(db, seller(a, 'not-a-uuid'), { type: 'markPaid' }))).status,
    ).toBe(404);
    expect((await fails(requireOrderToken('AAAAAAAAAAAA'))).status).toBe(404);
    expect((await reload(order.id)).status).toBe('awaiting_payment');
  });

  // Two confirms of the same claim can lose in two ways, both safe (hardening report S18):
  // both read the order before either writes → the loser's guarded UPDATE matches no row (409);
  // the loser reads after the winner committed → the state machine refuses it (422). A plain
  // Promise.all decides the path by timing, so each path gets its own deterministic test.
  it('two confirmPayment calls that both read before either writes: one wins, the other gets 409', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    await transitionOrder(db, await buyer(order.publicToken), { type: 'submitCode', message: SMS });
    // Hold the row lock from a third connection. Plain reads don't wait for it, so both calls
    // read the claimed order, then block at their UPDATE until both are provably waiting.
    const { racing } = await db.transaction(async (lock) => {
      await lock.execute(sql`select 1 from orders where id = ${order.id} for update`);
      const racing = Promise.allSettled([
        transitionOrder(db, seller(w, order.id), { type: 'confirmPayment' }),
        transitionOrder(db, seller(w, order.id), { type: 'confirmPayment' }),
      ]);
      // The first waits for this lock, the second queues behind the first (test files run one
      // at a time, so no other backend of this database waits on a lock).
      for (let waited = 0; ; waited += 20) {
        const blocked = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'`,
        );
        if (blocked.rows[0]!.n === 2) break;
        if (waited > 8000) throw new Error('Both confirms never reached their UPDATE');
        await new Promise((r) => setTimeout(r, 20));
      }
      // Wrapped: returning the promise itself would wait for it before committing (deadlock).
      return { racing }; // committing the lock lets them through, one after the other
    });
    const results = await racing;
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictError);
    expect((rejected.reason as ConflictError).message).toBe(
      'This order changed. Refresh and try again.',
    );
    expect((await events(order.id)).filter((e) => e.toStatus === 'confirmed')).toHaveLength(1);
    expect((await product(w.dress.id)).unitsSold).toBe(1);
  }, 20_000);

  it('a confirmPayment that reads an order already confirmed is refused (422), nothing twice', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    await transitionOrder(db, await buyer(order.publicToken), { type: 'submitCode', message: SMS });
    await transitionOrder(db, seller(w, order.id), { type: 'confirmPayment' });
    const confirmed = await reload(order.id);
    const err = await fails(transitionOrder(db, seller(w, order.id), { type: 'confirmPayment' }));
    expect(err.status).toBe(422);
    expect(await reload(order.id)).toEqual(confirmed);
    expect((await events(order.id)).filter((e) => e.toStatus === 'confirmed')).toHaveLength(1);
    expect((await product(w.dress.id)).unitsSold).toBe(1);
  });

  it('two confirmPayment calls at once, either path: exactly one confirm', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    await transitionOrder(db, await buyer(order.publicToken), { type: 'submitCode', message: SMS });
    const results = await Promise.allSettled([
      transitionOrder(db, seller(w, order.id), { type: 'confirmPayment' }),
      transitionOrder(db, seller(w, order.id), { type: 'confirmPayment' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect([409, 422]).toContain((rejected.reason as HttpError).status);
    expect((await events(order.id)).filter((e) => e.toStatus === 'confirmed')).toHaveLength(1);
    expect((await product(w.dress.id)).unitsSold).toBe(1);
    expect((await claims(order.id)).map((c) => c.outcome)).toEqual(['confirmed']);
  });

  it('a buyer cancel racing a seller confirm: one wins, the order is consistent', async () => {
    const w = await world();
    const { order } = await insertOrder(db, newOrder(w));
    const scope = await buyer(order.publicToken);
    const results = await Promise.allSettled([
      transitionOrder(db, scope, { type: 'buyerCancel' }),
      transitionOrder(db, seller(w, order.id), { type: 'markPaid' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const final = await reload(order.id);
    expect(['cancelled', 'confirmed']).toContain(final.status);
    expect(await events(order.id)).toHaveLength(2);
  });
});
