import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { BUYER_LIMITS } from '@oda/shared';
import { createShopFixture, truncateAll } from '@oda/db/testing';
import type { SellerCtx } from './authz';
import {
  postBuyerCancel,
  postOrder,
  postOrderCode,
  postQuote,
  postReport,
  postSwitchToPod,
  type Defer,
} from './checkout';
import { getDb } from './db';
import { testOutbox } from './email/transport';
import { insertOrder, transitionOrder } from './orders';
import { orderTokenRepo } from './repos/order-token';
import { requireOrderToken } from './authz';
import { hitLimit } from './rateLimit';

// Checkout and the buyer's order endpoints (M5 CP1) against oda_test: the public routes as
// the browser calls them, with the Origin check, honeypot, limits and the open-orders cap.

const db = getDb();
const t = schema;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ORIGIN = 'http://localhost:3000';
let deferred: Promise<void>[] = [];
const defer: Defer = (work) => {
  deferred.push(work());
};
const settle = async () => {
  await Promise.all(deferred);
  deferred = [];
};

async function world(
  opts: {
    payOnDelivery?: boolean;
    payBefore?: boolean;
    account?: boolean;
    areas?: boolean;
    pickup?: boolean;
    threshold?: number | null;
  } = {},
) {
  const slug = `shop-${randomUUID().slice(0, 6)}`;
  const { shopId, userId } = await createShopFixture(db, { slug, name: 'Amani Styles' });
  await db
    .update(t.shops)
    .set({
      acceptsPayBefore: opts.payBefore ?? true,
      acceptsPayOnDelivery: opts.payOnDelivery ?? true,
      pickupEnabled: opts.pickup ?? false,
      freeDeliveryThreshold: opts.threshold ?? null,
    })
    .where(eq(t.shops.id, shopId));
  const [dress, top] = await db
    .insert(t.products)
    .values([
      { shopId, name: 'Ankara wrap dress', price: 2500, sizes: ['S', 'M'] },
      { shopId, name: 'Kitenge top', price: 1200 },
    ])
    .returning();
  const [area] =
    opts.areas === false
      ? []
      : await db
          .insert(t.deliveryAreas)
          .values({ shopId, name: 'CBD', fee: 200, method: 'rider', freeDeliveryEligible: true })
          .returning();
  if (opts.account !== false) {
    await db.insert(t.paymentAccounts).values({
      shopId,
      type: 'till',
      number: '5123456',
      accountName: 'AMANI STYLES',
      isActive: true,
    });
  }
  return { slug, shopId, ctx: { userId, shopId } as SellerCtx, dress: dress!, top: top!, area };
}
type World = Awaited<ReturnType<typeof world>>;

function checkout(w: World, patch: Json = {}): Json {
  return {
    idempotencyKey: randomUUID().replaceAll('-', ''),
    buyer: { name: 'Wanjiku Kamau', phone: '0712 345 678', whatsapp: true, email: '' },
    fulfilment: { kind: 'delivery', areaId: w.area?.id, addressText: 'Rhapta Rd, near Sarit' },
    payment: 'pay_now',
    lines: [{ productId: w.dress.id, qty: 1, size: 'M', colour: null }],
    expectedTotal: 2700,
    source: 'tt',
    ...patch,
  };
}

function req(path: string, payload: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: JSON.stringify(payload),
  });
}

async function place(w: World, payload: Json, headers: Record<string, string> = {}) {
  const res = await postOrder(
    req(`/api/shops/${w.slug}/orders`, payload, headers),
    { params: Promise.resolve({ slug: w.slug }) },
    defer,
  );
  await settle();
  return { status: res.status, body: (await res.json()) as Json };
}

async function act(
  route: typeof postOrderCode,
  token: string,
  payload: unknown = {},
  headers: Record<string, string> = {},
) {
  const res = await route(
    req(`/api/o/${token}/x`, payload, headers),
    { params: Promise.resolve({ token }) },
    defer,
  );
  await settle();
  return { status: res.status, body: (await res.json()) as Json };
}

async function report(token: string, payload: unknown, headers: Record<string, string> = {}) {
  const res = await postReport(req(`/api/o/${token}/report`, payload, headers), {
    params: Promise.resolve({ token }),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

const orderBy = async (token: string) =>
  (await db.select().from(t.orders).where(eq(t.orders.publicToken, token)))[0]!;
const notificationsOf = (shopId: string) =>
  db.select().from(t.notifications).where(eq(t.notifications.shopId, shopId));

beforeEach(async () => {
  await truncateAll(db);
  testOutbox.clear();
  deferred = [];
});
afterAll(async () => {
  await truncateAll(db);
});

describe('POST /api/shops/:slug/orders', () => {
  it('places a pay-now order priced on the server and answers only with the token', async () => {
    const w = await world();
    const { status, body } = await place(w, checkout(w));
    expect(status).toBe(201);
    expect(Object.keys(body)).toEqual(['token']);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const order = await orderBy(body.token);
    expect(order).toMatchObject({
      status: 'awaiting_payment',
      paymentMethod: 'pay_before',
      buyerPhone: '+254712345678',
      subtotal: 2500,
      deliveryFee: 200,
      total: 2700,
      source: 'tt',
      deliveryAreaName: 'CBD',
    });
    const notes = await notificationsOf(w.shopId);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      type: 'new_order',
      orderId: order.id,
      title: `New order #${order.number}`,
      body: 'Wanjiku Kamau · KES 2,700 · Pay now with M-Pesa',
    });
    // No email given: no receipt.
    expect(testOutbox.all()).toHaveLength(0);
  });

  it('places a pay-on-delivery pickup order and emails the receipt with the order link', async () => {
    const w = await world({ pickup: true });
    const { status, body } = await place(
      w,
      checkout(w, {
        payment: 'pay_on_delivery',
        fulfilment: { kind: 'pickup' },
        expectedTotal: 2500,
        buyer: { name: 'Wanjiku', phone: '0712345678', whatsapp: false, email: 'W@Example.test' },
      }),
    );
    expect(status).toBe(201);
    const order = await orderBy(body.token);
    expect(order).toMatchObject({
      status: 'awaiting_acceptance',
      fulfilment: 'pickup',
      deliveryFee: 0,
      buyerEmail: 'w@example.test',
      buyerWhatsapp: false,
    });
    const mail = testOutbox.last('w@example.test')!;
    expect(mail.kind).toBe('order-receipt');
    expect(mail.subject).toBe(`Your order #${order.number} from Amani Styles`);
    expect(mail.text).toContain(`/o/${body.token}`);
    expect(mail.text).toContain('You pay KES 2,500 on delivery');
  });

  it('applies free delivery and unknown sources count as direct', async () => {
    const w = await world({ threshold: 5000 });
    const { body } = await place(
      w,
      checkout(w, {
        lines: [{ productId: w.dress.id, qty: 2, size: 'S' }],
        expectedTotal: 5000,
        source: 'evil',
      }),
    );
    expect(await orderBy(body.token)).toMatchObject({
      deliveryFee: 0,
      total: 5000,
      source: 'direct',
    });
  });

  it('refuses a changed price with the current lines, and creates nothing', async () => {
    const w = await world();
    await db.update(t.products).set({ price: 2800 }).where(eq(t.products.id, w.dress.id));
    const { status, body } = await place(w, checkout(w));
    expect(status).toBe(409);
    expect(body.error.code).toBe('price_changed');
    expect(body.error.details).toMatchObject({
      total: 3000,
      deliveryFee: 200,
      lines: [{ productId: w.dress.id, name: 'Ankara wrap dress', unitPrice: 2800, qty: 1 }],
    });
    expect(await db.select().from(t.orders)).toHaveLength(0);
    expect(await notificationsOf(w.shopId)).toHaveLength(0);
  });

  it('a repeat with the same idempotency key returns the same order once', async () => {
    const w = await world();
    const payload = checkout(w);
    const first = await place(w, payload);
    const again = await place(w, payload);
    expect(again.status).toBe(200);
    expect(again.body.token).toBe(first.body.token);
    expect(await db.select().from(t.orders)).toHaveLength(1);
    expect(await notificationsOf(w.shopId)).toHaveLength(1);
  });

  it('refuses requests from other websites and the honeypot', async () => {
    const w = await world();
    const cross = await place(w, checkout(w), { origin: 'https://evil.example' });
    expect(cross.status).toBe(403);
    expect(cross.body.error.code).toBe('cross_site');
    const res = await postOrder(
      new Request(`${ORIGIN}/api/shops/${w.slug}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
        body: JSON.stringify(checkout(w)),
      }),
      { params: Promise.resolve({ slug: w.slug }) },
      defer,
    );
    expect(res.status).toBe(403);
    const bot = await place(w, checkout(w, { website: 'http://spam' }));
    expect(bot.status).toBe(422);
    expect(await db.select().from(t.orders)).toHaveLength(0);
  });

  it('whitelists fields: no client prices, statuses or fees', async () => {
    const w = await world();
    const sneaky = await place(w, checkout(w, { status: 'confirmed' }));
    expect(sneaky.status).toBe(422);
    const line = await place(
      w,
      checkout(w, { lines: [{ productId: w.dress.id, qty: 1, size: 'M', unitPrice: 1 }] }),
    );
    expect(line.status).toBe(422);
  });

  it('needs a way to pay and a way to deliver (decision #61 c), and a shop that is open', async () => {
    const noDelivery = await world({ areas: false, pickup: false });
    const r1 = await place(
      noDelivery,
      checkout(noDelivery, { fulfilment: { kind: 'pickup' }, expectedTotal: 2500 }),
    );
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('not_taking_orders');

    const noPay = await world({ payOnDelivery: false, account: false });
    expect((await place(noPay, checkout(noPay))).body.error.code).toBe('not_taking_orders');

    const podOnly = await world({ account: false });
    const payNow = await place(podOnly, checkout(podOnly));
    expect(payNow.body.error.code).toBe('pay_now_off');
    expect((await place(podOnly, checkout(podOnly, { payment: 'pay_on_delivery' }))).status).toBe(
      201,
    );

    const paused = await world();
    await db.update(t.shops).set({ isPaused: true }).where(eq(t.shops.id, paused.shopId));
    expect((await place(paused, checkout(paused))).body.error.code).toBe('shop_paused');
  });

  it('another shop’s delivery area, hidden or sold-out products, and unknown shops are refused', async () => {
    const a = await world();
    const b = await world();
    const area = await place(
      a,
      checkout(a, { fulfilment: { ...checkout(a).fulfilment, areaId: b.area!.id } }),
    );
    expect(area.status).toBe(404);
    const theirs = await place(a, checkout(a, { lines: [{ productId: b.top.id, qty: 1 }] }));
    expect(theirs.status).toBe(409);
    expect(theirs.body.error.code).toBe('item_unavailable');
    await db.update(t.products).set({ status: 'sold_out' }).where(eq(t.products.id, a.dress.id));
    expect((await place(a, checkout(a))).body.error.code).toBe('item_unavailable');
    const res = await postOrder(
      req('/api/shops/no-such-shop/orders', checkout(a)),
      { params: Promise.resolve({ slug: 'no-such-shop' }) },
      defer,
    );
    expect(res.status).toBe(404);
  });

  it('limits orders per phone per shop (5 an hour)', async () => {
    const w = await world();
    for (let i = 0; i < 5; i++) expect((await place(w, checkout(w))).status).toBe(201);
    const sixth = await place(w, checkout(w));
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.retryAfter).toBeGreaterThan(0);
    // Another phone still can.
    const other = await place(
      w,
      checkout(w, { buyer: { name: 'Achieng', phone: '0722 000 111', whatsapp: true } }),
    );
    expect(other.status).toBe(201);
  });

  it('limits orders per IP per shop (30 an hour)', async () => {
    const w = await world();
    const ip = { 'x-real-ip': '41.90.1.2' };
    // 30 orders from one connection (counted directly, as 30 checkouts would).
    for (let i = 0; i < 30; i++) {
      await hitLimit(db, `order-ip:${w.shopId}:41.90.1.2`, BUYER_LIMITS.ordersPerIpPerShop);
    }
    const res = await place(w, checkout(w), ip);
    expect(res.status).toBe(429);
    expect((await place(w, checkout(w), { 'x-real-ip': '41.90.1.3' })).status).toBe(201);
  });

  it('caps open orders at 20 per phone per shop, pay on delivery included', async () => {
    const w = await world();
    for (let i = 0; i < 20; i++) {
      await insertOrder(db, {
        shopId: w.shopId,
        kind: i % 2 ? 'buyer_pay_now' : 'buyer_pay_on_delivery',
        buyer: { name: 'Wanjiku', phone: '+254712345678' },
        fulfilment: { kind: 'delivery', areaId: w.area!.id, addressText: 'CBD' },
        lines: [{ productId: w.top.id, qty: 1 }],
      });
    }
    const res = await place(w, checkout(w));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('too_many_open_orders');
  });
});

describe('POST /api/shops/:slug/quote', () => {
  it('prices every delivery option on the server', async () => {
    const w = await world({ pickup: true, threshold: 5000 });
    await db.insert(t.deliveryAreas).values({
      shopId: w.shopId,
      name: 'Upcountry',
      fee: 450,
      method: 'parcel',
      position: 1,
    });
    const quote = async (lines: unknown) => {
      const res = await postQuote(req(`/api/shops/${w.slug}/quote`, { lines }), {
        params: Promise.resolve({ slug: w.slug }),
      });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const { status, body } = await quote([{ productId: w.dress.id, qty: 2, size: 'M' }]);
    expect(status).toBe(200);
    expect(body.subtotal).toBe(5000);
    expect(body.lines).toEqual([
      {
        productId: w.dress.id,
        size: 'M',
        colour: null,
        name: 'Ankara wrap dress',
        unitPrice: 2500,
        qty: 2,
      },
    ]);
    expect(body.options).toMatchObject([
      {
        kind: 'delivery',
        areaId: w.area!.id,
        deliveryFee: 0,
        total: 5000,
        freeDeliveryApplied: true,
      },
      { kind: 'delivery', deliveryFee: 450, total: 5450, freeDeliveryApplied: false },
      { kind: 'pickup', areaId: null, deliveryFee: 0, total: 5000 },
    ]);
    expect((await quote([{ productId: w.dress.id, qty: 1 }])).status).toBe(422);
  });

  it('never prices another shop’s product (M10 CP1)', async () => {
    const a = await world();
    const b = await world();
    const res = await postQuote(
      req(`/api/shops/${a.slug}/quote`, { lines: [{ productId: b.top.id, qty: 1 }] }),
      { params: Promise.resolve({ slug: a.slug }) },
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as Json).options).toBeUndefined();
  });
});

describe('buyer order actions', () => {
  async function placed(w: World, patch: Json = {}) {
    const { body } = await place(w, checkout(w, patch));
    return body.token as string;
  }

  it('"I\'ve paid" extracts the code, notifies the seller and is refused a second time', async () => {
    const w = await world();
    const token = await placed(w);
    const bad = await act(postOrderCode, token, { message: 'paid already' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('invalid_code');
    const ok = await act(postOrderCode, token, {
      message: 'SFK7Q2M9TX Confirmed. Ksh2,700.00 sent to AMANI STYLES',
    });
    expect(ok).toEqual({ status: 200, body: { status: 'payment_claimed' } });
    const order = await orderBy(token);
    expect(order).toMatchObject({ mpesaCode: 'SFK7Q2M9TX', paymentStatus: 'claimed' });
    const notes = await notificationsOf(w.shopId);
    expect(notes.map((n) => n.type).sort()).toEqual(['new_order', 'payment_claimed']);
    expect(notes.find((n) => n.type === 'payment_claimed')!.body).toContain('SFK7Q2M9TX');
    expect((await act(postOrderCode, token, { message: 'SFK7Q2M9TY' })).status).toBe(422);
  });

  it('limits code submissions per order', async () => {
    const w = await world();
    const token = await placed(w);
    for (let i = 0; i < 10; i++) await act(postOrderCode, token, { message: 'nope' });
    expect((await act(postOrderCode, token, { message: 'SFK7Q2M9TX' })).status).toBe(429);
  });

  it('switches to pay on delivery only when the shop takes it', async () => {
    const w = await world();
    const token = await placed(w);
    expect(await act(postSwitchToPod, token)).toEqual({
      status: 200,
      body: { status: 'awaiting_acceptance' },
    });
    expect((await notificationsOf(w.shopId)).map((n) => n.type)).toContain('switched_to_pod');

    const strict = await world({ payOnDelivery: false });
    const t2 = await placed(strict);
    const refused = await act(postSwitchToPod, t2);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('pay_on_delivery_off');
  });

  it('cancels, notifies the seller and emails "you cancelled" (refund copy after a claim)', async () => {
    const w = await world();
    const email = { name: 'Wanjiku', phone: '0712345678', whatsapp: true, email: 'w@example.test' };
    const token = await placed(w, { buyer: email });
    await act(postOrderCode, token, { message: 'SFK7Q2M9TX' });
    expect(await act(postBuyerCancel, token)).toEqual({
      status: 200,
      body: { status: 'cancelled' },
    });
    const order = await orderBy(token);
    expect(order).toMatchObject({
      cancelReason: 'buyer_cancelled',
      cancelledBy: 'buyer',
      paymentStatus: 'claimed',
    });
    const note = (await notificationsOf(w.shopId)).find((n) => n.type === 'buyer_cancelled')!;
    expect(note.body).toContain('refund');
    const mail = testOutbox.last('w@example.test')!;
    expect(mail.kind).toBe('order-cancelled');
    expect(mail.text).toContain('send it back to your M-Pesa');
    // Cancelled is final.
    expect((await act(postBuyerCancel, token)).status).toBe(422);
  });

  it('a buyer can’t cancel once the seller confirmed', async () => {
    const w = await world();
    const token = await placed(w, { payment: 'pay_on_delivery' });
    const order = await orderBy(token);
    await transitionOrder(
      db,
      { kind: 'seller', ctx: w.ctx, orderId: order.id },
      { type: 'accept' },
    );
    expect((await act(postBuyerCancel, token)).status).toBe(422);
  });

  it('a malformed or unknown token is the same 404, and other websites are refused', async () => {
    const w = await world();
    const token = await placed(w);
    const unknown = await act(postBuyerCancel, 'AAAAAAAAAAAA');
    const malformed = await act(postBuyerCancel, '1');
    expect(unknown.status).toBe(404);
    expect(malformed).toEqual(unknown);
    expect((await act(postBuyerCancel, token, {}, { origin: 'https://evil.example' })).status).toBe(
      403,
    );
    expect((await orderBy(token)).status).toBe('awaiting_payment');
  });

  it('limits order-link lookups per IP', async () => {
    const ip = { 'x-real-ip': '41.90.9.9' };
    for (let i = 0; i < 60; i++) await act(postBuyerCancel, 'AAAAAAAAAAAA', {}, ip);
    expect((await act(postBuyerCancel, 'AAAAAAAAAAAA', {}, ip)).status).toBe(429);
  });

  it('a closed (deleted) shop allows only "Report a problem"', async () => {
    const w = await world();
    const token = await placed(w);
    await db.update(t.shops).set({ deletedAt: new Date() }).where(eq(t.shops.id, w.shopId));
    const code = await act(postOrderCode, token, { message: 'SFK7Q2M9TX' });
    expect(code.status).toBe(409);
    expect(code.body.error.code).toBe('shop_closed');
    expect((await act(postBuyerCancel, token)).body.error.code).toBe('shop_closed');
    const r = await report(token, { message: 'The shop vanished', contactPhone: '0712345678' });
    expect(r.status).toBe(201);
    const [row] = await db.select().from(t.reports);
    expect(row).toMatchObject({ message: 'The shop vanished', contactPhone: '+254712345678' });
  });

  it('limits reports per order and refuses the honeypot', async () => {
    const w = await world();
    const token = await placed(w);
    expect((await report(token, { message: 'Hello there', website: 'x' })).status).toBe(422);
    for (let i = 0; i < 3; i++) {
      expect((await report(token, { message: `Problem ${i}` })).status).toBe(201);
    }
    expect((await report(token, { message: 'Problem again' })).status).toBe(429);
  });
});

describe('report limits per IP', () => {
  it('10 reports a day from one connection, across orders', async () => {
    const w = await world();
    const ip = { 'x-real-ip': '41.90.7.7' };
    const tokens: string[] = [];
    for (let i = 0; i < 4; i++) {
      const phone = `07220001${String(i).padStart(2, '0')}`;
      tokens.push(
        (await place(w, checkout(w, { buyer: { name: 'Achieng', phone, whatsapp: true } }))).body
          .token,
      );
    }
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (await report(tokens[Math.floor(i / 3)]!, { message: `Problem ${i}` }, ip)).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('the buyer’s order view', () => {
  it('flags "payment not found" and never carries the seller’s note or internal ids', async () => {
    const w = await world();
    const { body } = await place(w, checkout(w));
    const token = body.token as string;
    const view = async () => orderTokenRepo(db, await requireOrderToken(token, db)).view();
    expect((await view()).paymentNotFound).toBe(false);
    await act(postOrderCode, token, { message: 'SFK7Q2M9TX' });
    const order = await orderBy(token);
    await transitionOrder(
      db,
      { kind: 'seller', ctx: w.ctx, orderId: order.id },
      {
        type: 'paymentNotFound',
      },
    );
    expect((await view()).paymentNotFound).toBe(true);
    await transitionOrder(
      db,
      { kind: 'seller', ctx: w.ctx, orderId: order.id },
      {
        type: 'sellerCancel',
        reason: 'out_of_stock',
        note: 'secret seller note',
      },
    );
    const v = await view();
    expect(v).toMatchObject({
      status: 'cancelled',
      cancelReason: 'out_of_stock',
      paymentNotFound: false,
    });
    const text = JSON.stringify(v);
    expect(text).not.toContain('secret seller note');
    expect(text).not.toContain(order.id);
    expect(text).not.toContain(w.shopId);
  });
});

describe('buyer emails', () => {
  it('a few emails per address a day, then the order still works without one', async () => {
    const w = await world();
    const buyer = { name: 'Wanjiku', phone: '0712345678', whatsapp: true, email: 'w@example.test' };
    const tokens: string[] = [];
    for (let i = 0; i < 5; i++) tokens.push((await place(w, checkout(w, { buyer }))).body.token);
    expect(testOutbox.all()).toHaveLength(5);
    // The 6th (another phone, same address) is placed, but no email goes out.
    const sixth = await place(w, checkout(w, { buyer: { ...buyer, phone: '0722000111' } }));
    expect(sixth.status).toBe(201);
    expect(testOutbox.all()).toHaveLength(5);
  });
});
