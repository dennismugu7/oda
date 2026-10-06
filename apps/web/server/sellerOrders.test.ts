import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { anonCall, newSeller, newUser, type Json, type Seller } from '@/test/sellerApi';
import { requireOrderToken } from './authz';
import { postOrderCode, type Defer } from './checkout';
import { getDb } from './db';
import { testOutbox } from './email/transport';
import { getOrder, listOrders, postOrderAction } from './orderRoutes';
import { insertOrder, transitionOrder, type NewOrder } from './orders';

// The seller's orders (M6 CP2): the list (tabs, groups, search, pages), the detail, and every
// seller action through the one endpoint, only via transitionOrder(); the emails and WhatsApp
// prefills that follow; and each seller only ever reaching their own orders.

const db = getDb();
const t = schema;

let deferred: Promise<void>[] = [];
const defer: Defer = (work) => {
  deferred.push(work());
};
const settle = async () => {
  await Promise.all(deferred);
  deferred = [];
};
const postAction = postOrderAction(defer);

beforeEach(async () => {
  await truncateAll(db);
  testOutbox.clear();
});
afterAll(async () => {
  await truncateAll(db);
});

/** A seller (real session) whose shop takes both payment kinds, with products and an area. */
async function shopWorld() {
  const s = await newSeller();
  await db
    .update(t.shops)
    .set({
      acceptsPayOnDelivery: true,
      pickupEnabled: true,
      pickupLocation: 'Kilimani stall',
      pickupHours: 'Mon–Sat 9am–6pm',
    })
    .where(eq(t.shops.id, s.shopId));
  const [dress, top] = await db
    .insert(t.products)
    .values([
      { shopId: s.shopId, name: 'Ankara wrap dress', price: 2500, sizes: ['M'] },
      { shopId: s.shopId, name: 'Kitenge top', price: 1200 },
    ])
    .returning();
  const [area] = await db
    .insert(t.deliveryAreas)
    .values({ shopId: s.shopId, name: 'Kilimani', fee: 200, method: 'rider' })
    .returning();
  await db.insert(t.paymentAccounts).values({
    shopId: s.shopId,
    type: 'till',
    number: '5123456',
    accountName: 'AMANI STYLES',
    isActive: true,
  });
  async function order(overrides: Partial<NewOrder> = {}) {
    const { order } = await insertOrder(db, {
      shopId: s.shopId,
      kind: 'buyer_pay_now',
      source: 'tt',
      buyer: { name: 'Wanjiku Mwangi', phone: '0712 345 901', email: 'wanjiku@example.test' },
      fulfilment: { kind: 'delivery', areaId: area!.id, addressText: 'Argwings Kodhek Rd' },
      lines: [
        { productId: dress!.id, qty: 1, size: 'M' },
        { productId: top!.id, qty: 1 },
      ],
      ...overrides,
    });
    return order;
  }
  return { ...s, order, dress: dress!, top: top! };
}

async function act(s: Seller, orderId: string, action: Json) {
  const res = await s.call(postAction, { id: orderId, body: action });
  await settle();
  return res;
}

async function claim(token: string, code = 'SFK7Q2M9TX') {
  const res = await postOrderCode(
    new Request(`http://localhost:3000/api/o/${token}/code`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ message: code }),
    }),
    { params: Promise.resolve({ token }) },
    defer,
  );
  await settle();
  expect(res.status).toBe(200);
}

describe('the list', () => {
  it('To do groups waiting orders; All and Done; counts for the badge', async () => {
    const w = await shopWorld();
    const unpaid = await w.order();
    const claimed = await w.order();
    await claim(claimed.publicToken);
    const pod = await w.order({ kind: 'buyer_pay_on_delivery' });
    const toSend = await w.order({ kind: 'manual_paid' });
    const cancelled = await w.order();
    await act(w, cancelled.id, { type: 'sellerCancel', reason: 'out_of_stock' });

    const todo = await w.call(listOrders, { query: '?tab=todo' });
    expect(todo.status).toBe(200);
    const byId = Object.fromEntries(todo.json.orders.map((o: Json) => [o.id, o.todoGroup]));
    expect(byId).toEqual({
      [unpaid.id]: 'new_awaiting_payment',
      [claimed.id]: 'confirm_payment',
      [pod.id]: 'new_to_accept',
      [toSend.id]: 'to_send',
    });
    expect(todo.json.todoCounts).toEqual({
      needs_attention: 0,
      confirm_payment: 1,
      new_to_accept: 1,
      new_awaiting_payment: 1,
      to_send: 1,
      total: 4,
    });
    const row = todo.json.orders.find((o: Json) => o.id === claimed.id);
    expect(row).toMatchObject({
      number: claimed.number,
      buyerName: 'Wanjiku Mwangi',
      total: 3900,
      source: 'tt',
      itemNames: ['Ankara wrap dress', 'Kitenge top'],
    });
    // Nothing private or internal in a row.
    expect(row).not.toHaveProperty('publicToken');
    expect(row).not.toHaveProperty('buyerPhone');

    const done = await w.call(listOrders, { query: '?tab=done' });
    expect(done.json.orders.map((o: Json) => o.id)).toEqual([cancelled.id]);
    const all = await w.call(listOrders, { query: '?tab=all' });
    expect(all.json.orders).toHaveLength(5);
    // Newest first.
    expect(all.json.orders[0].id).toBe(cancelled.id);
    expect((await w.call(listOrders, { query: '?tab=later' })).status).toBe(422);
  });

  it('"Needs attention" holds cancelled orders with money to settle, until settled', async () => {
    const w = await shopWorld();
    const refund = await w.order();
    await claim(refund.publicToken);
    await act(w, refund.id, {
      type: 'sellerCancel',
      reason: 'out_of_stock',
      receivedClaimed: true,
    });
    const check = await w.order();
    await claim(check.publicToken);
    await transitionOrder(
      db,
      { kind: 'buyer', ctx: await requireOrderToken(check.publicToken) },
      { type: 'buyerCancel' },
    );
    const plain = await w.order();
    await act(w, plain.id, { type: 'sellerCancel', reason: 'buyer_asked' });

    const todo = async () => (await w.call(listOrders, { query: '?tab=todo' })).json;
    let list = await todo();
    const groups = Object.fromEntries(list.orders.map((o: Json) => [o.id, o.todoGroup]));
    expect(groups).toEqual({ [refund.id]: 'needs_attention', [check.id]: 'needs_attention' });
    expect(list.todoCounts).toMatchObject({ needs_attention: 2, total: 2 });
    // They also stay in Done (and All).
    const done = (await w.call(listOrders, { query: '?tab=done' })).json.orders.map(
      (o: Json) => o.id,
    );
    expect(done).toEqual(expect.arrayContaining([refund.id, check.id, plain.id]));

    await act(w, refund.id, { type: 'markRefundSent' });
    await act(w, check.id, { type: 'resolveClaim', received: false });
    list = await todo();
    expect(list.orders).toHaveLength(0);
    expect(list.todoCounts).toMatchObject({ needs_attention: 0, total: 0 });
  });

  it('searches by buyer name, phone or order number', async () => {
    const w = await shopWorld();
    const wanjiku = await w.order();
    const brian = await w.order({ buyer: { name: 'Brian Otieno', phone: '0722 000 111' } });
    const search = async (q: string) =>
      (await w.call(listOrders, { query: `?tab=all&q=${encodeURIComponent(q)}` })).json.orders.map(
        (o: Json) => o.id,
      );
    expect(await search('brian')).toEqual([brian.id]);
    expect(await search('0712 345')).toEqual([wanjiku.id]);
    expect(await search('+254722000111')).toEqual([brian.id]);
    expect(await search(`#${wanjiku.number}`)).toEqual([wanjiku.id]);
    expect(await search('100%')).toEqual([]);
  });

  it('pages All and Done 30 at a time', async () => {
    const w = await shopWorld();
    for (let i = 0; i < 32; i++) await w.order({ kind: 'manual_paid' });
    await db.execute(
      sql`update orders set placed_at = now() - (number - 1000) * interval '1 minute' where shop_id = ${w.shopId}`,
    );
    const first = await w.call(listOrders, { query: '?tab=all' });
    expect(first.json.orders).toHaveLength(30);
    expect(first.json.next).toMatch(/^\d{13}_/);
    const second = await w.call(listOrders, { query: `?tab=all&cursor=${first.json.next}` });
    expect(second.json.orders).toHaveLength(2);
    expect(second.json.next).toBeNull();
    const ids = new Set([...first.json.orders, ...second.json.orders].map((o: Json) => o.id));
    expect(ids.size).toBe(32);
  });
});

describe('the detail', () => {
  it('has items, buyer, delivery, money, the account used, claims and the actions', async () => {
    const w = await shopWorld();
    const o = await w.order();
    await claim(o.publicToken);
    const res = await w.call(getOrder, { id: o.id });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      number: o.number,
      status: 'payment_claimed',
      source: 'tt',
      buyer: { name: 'Wanjiku Mwangi', phone: '+254712345901', whatsapp: true, hasEmail: true },
      fulfilment: 'delivery',
      deliveryAreaName: 'Kilimani',
      addressText: 'Argwings Kodhek Rd',
      subtotal: 3700,
      deliveryFee: 200,
      total: 3900,
      paymentAccount: { type: 'till', number: '5123456', name: 'AMANI STYLES' },
      mpesaCode: 'SFK7Q2M9TX',
      actions: ['confirmPayment', 'paymentNotFound', 'sellerCancel'],
      claims: [{ code: 'SFK7Q2M9TX', outcome: 'pending', duplicateOfOrderNumber: null }],
    });
    expect(res.json.items.map((i: Json) => [i.name, i.size, i.qty, i.unitPrice])).toEqual([
      ['Ankara wrap dress', 'M', 1, 2500],
      ['Kitenge top', null, 1, 1200],
    ]);
    expect(res.json.link).toMatch(new RegExp(`/o/${o.publicToken}$`));
    // The buyer's email address stays private.
    expect(JSON.stringify(res.json)).not.toContain('wanjiku@example.test');
  });

  it('flags an M-Pesa code already used on another order of the shop', async () => {
    const w = await shopWorld();
    const first = await w.order();
    await claim(first.publicToken, 'SFK7Q2M9TX');
    const second = await w.order();
    await claim(second.publicToken, 'SFK7Q2M9TX');
    const res = await w.call(getOrder, { id: second.id });
    expect(res.json.claims[0].duplicateOfOrderNumber).toBe(first.number);
  });
});

describe('seller actions', () => {
  it('pay now: payment not found → claim again → confirm → sent (rider) → delivered', async () => {
    const w = await shopWorld();
    const o = await w.order();
    await claim(o.publicToken);

    let res = await act(w, o.id, { type: 'paymentNotFound' });
    expect(res.status).toBe(200);
    expect(res.json.order).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
    expect(res.json.order.claims[0].outcome).toBe('not_found');
    expect(res.json.whatsapp.url).toMatch(/^https:\/\/wa\.me\/254712345901\?text=/);
    expect(res.json.whatsapp.text).toContain('can’t find your M-Pesa payment');

    await claim(o.publicToken, 'SGK8R3N0UY');
    res = await act(w, o.id, { type: 'confirmPayment' });
    expect(res.json.order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(res.json.whatsapp.text).toContain('I’ve received your payment of KSh 3,900');
    expect(testOutbox.last()?.kind).toBe('order-confirmed');

    res = await act(w, o.id, { type: 'markSent', sentMethod: 'rider', riderPhone: '0722 000 111' });
    expect(res.json.order).toMatchObject({
      status: 'sent',
      sentMethod: 'rider',
      riderPhone: '+254722000111',
    });
    expect(res.json.whatsapp.text).toContain('with a rider (0722 000 111)');
    expect(testOutbox.last()).toMatchObject({ kind: 'order-sent' });
    expect(testOutbox.last()!.text).toContain("Rider's number: 0722 000 111.");

    res = await act(w, o.id, { type: 'markDelivered' });
    expect(res.json.order).toMatchObject({ status: 'delivered', actions: [] });
    expect(testOutbox.last()?.kind).toBe('order-delivered');
    // M7: the delivered email and WhatsApp message link to the review page (decision #73).
    expect(testOutbox.last()!.text).toContain(
      `Rate your order: http://localhost:3000/o/${o.publicToken}/review`,
    );
    expect(res.json.whatsapp.text).toContain(`/o/${o.publicToken}/review`);
    const events = await db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, o.id));
    expect(events.filter((e) => e.actor === 'seller')).toHaveLength(4);
  });

  it('mark paid without a code', async () => {
    const w = await shopWorld();
    const o = await w.order();
    const res = await act(w, o.id, { type: 'markPaid' });
    expect(res.json.order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(res.json.whatsapp).toBeNull();
    expect(testOutbox.last()?.kind).toBe('order-confirmed');
  });

  it('pay on delivery: accept → pickup ready → delivered only with the money collected', async () => {
    const w = await shopWorld();
    const o = await w.order({ kind: 'buyer_pay_on_delivery', fulfilment: { kind: 'pickup' } });
    let res = await act(w, o.id, { type: 'accept' });
    expect(res.json.order.status).toBe('confirmed');
    expect(testOutbox.last()?.kind).toBe('order-accepted');

    res = await act(w, o.id, { type: 'markSent', sentMethod: 'pickup' });
    expect(res.json.order).toMatchObject({
      status: 'sent',
      sentMethod: 'pickup',
      riderPhone: null,
    });
    expect(res.json.whatsapp.text).toContain(
      'is ready for pickup at Kilimani stall, Mon–Sat 9am–6pm',
    );
    expect(testOutbox.last()!.subject).toContain('ready for pickup');

    res = await act(w, o.id, { type: 'markDelivered' });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe('not_collected');
    res = await act(w, o.id, { type: 'markDelivered', collected: true });
    expect(res.json.order).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
  });

  it('cancel: a claimed payment needs the answer; received → refund due → refund sent', async () => {
    const w = await shopWorld();
    const o = await w.order();
    await claim(o.publicToken);
    let res = await act(w, o.id, { type: 'sellerCancel', reason: 'out_of_stock' });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe('missing_answer');

    res = await act(w, o.id, {
      type: 'sellerCancel',
      reason: 'out_of_stock',
      note: 'Last one sold in the shop',
      receivedClaimed: true,
    });
    expect(res.json.order).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'refund_due',
      cancel: { reason: 'out_of_stock', note: 'Last one sold in the shop', by: 'seller' },
      actions: ['markRefundSent'],
    });
    expect(res.json.whatsapp.text).toContain('I’ll send your KSh 3,900 back to your M-Pesa');
    const email = testOutbox.last()!;
    expect(email.kind).toBe('order-cancelled');
    expect(email.text).toContain('Reason: Out of stock.');
    expect(email.text).toContain('will send your KES 3,900 back');
    // The seller's private note never reaches the buyer.
    expect(email.text).not.toContain('Last one sold');

    res = await act(w, o.id, { type: 'markRefundSent' });
    expect(res.json.order).toMatchObject({ paymentStatus: 'refunded', actions: [] });
    expect(testOutbox.last()?.kind).toBe('order-refunded');
  });

  it('a buyer-cancelled claimed order: the seller resolves the claim', async () => {
    const w = await shopWorld();
    const o = await w.order();
    await claim(o.publicToken);
    await transitionOrder(
      db,
      { kind: 'buyer', ctx: await requireOrderToken(o.publicToken) },
      { type: 'buyerCancel' },
    );
    expect((await w.call(getOrder, { id: o.id })).json.actions).toEqual(['resolveClaim']);
    const res = await act(w, o.id, { type: 'resolveClaim', received: false });
    expect(res.json.order).toMatchObject({ status: 'cancelled', paymentStatus: 'unpaid' });
    expect(res.json.order.claims[0].outcome).toBe('not_found');
  });

  it('refuses forbidden transitions, unknown actions and server-owned fields', async () => {
    const w = await shopWorld();
    const o = await w.order();
    const forbidden = await act(w, o.id, { type: 'markSent', sentMethod: 'rider' });
    expect(forbidden.status).toBe(422);
    expect(forbidden.json.error.code).toBe('forbidden_transition');
    expect((await act(w, o.id, { type: 'confirmPayment' })).status).toBe(422);
    expect((await act(w, o.id, { type: 'autoExpire' })).status).toBe(422);
    expect((await act(w, o.id, { type: 'submitCode', message: 'SFK7Q2M9TX' })).status).toBe(422);
    expect((await act(w, o.id, { type: 'markPaid', status: 'delivered' })).status).toBe(422);
    expect((await act(w, o.id, { type: 'sellerCancel', reason: 'expired' })).status).toBe(422);
    const [row] = await db.select().from(t.orders).where(eq(t.orders.id, o.id));
    expect(row).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
  });

  it('two phones racing on the same order: one wins, the other gets 409', async () => {
    const w = await shopWorld();
    const o = await w.order({ kind: 'buyer_pay_on_delivery' });
    const [a, b] = await Promise.all([
      w.call(postAction, { id: o.id, body: { type: 'accept' } }),
      w.call(postAction, { id: o.id, body: { type: 'accept' } }),
    ]);
    await settle();
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    // The loser either lost the UPDATE race (409) or read the order after it changed (422).
    expect([409, 422]).toContain(statuses[1]);
    const loser = a.status === 200 ? b : a;
    expect(loser.json.error.message).toMatch(/This order changed|isn't possible/);
  });

  it('no email when the buyer gave none', async () => {
    const w = await shopWorld();
    const o = await w.order({ buyer: { name: 'Brian', phone: '0722 000 111' } });
    await act(w, o.id, { type: 'markPaid' });
    expect(testOutbox.all()).toHaveLength(0);
  });
});

describe('forbidden transitions (M6 CP5)', () => {
  it('every seller action is refused where the machine forbids it, changing nothing', async () => {
    const w = await shopWorld();
    // One order per state the cases need.
    const awaiting = await w.order();
    const claimed = await w.order();
    await claim(claimed.publicToken);
    const pod = await w.order({ kind: 'buyer_pay_on_delivery' });
    const confirmed = await w.order({ kind: 'manual_paid' });
    const delivered = await w.order({ kind: 'manual_paid' });
    await act(w, delivered.id, { type: 'markSent', sentMethod: 'pickup' });
    await act(w, delivered.id, { type: 'markDelivered' });

    const cases: [string, { id: string }, Json][] = [
      ['markPaid on a claimed payment', claimed, { type: 'markPaid' }],
      ['confirmPayment before any claim', awaiting, { type: 'confirmPayment' }],
      ['paymentNotFound before any claim', awaiting, { type: 'paymentNotFound' }],
      ['accept on a pay-now order', awaiting, { type: 'accept' }],
      ['markSent before accepting', pod, { type: 'markSent', sentMethod: 'rider' }],
      ['markDelivered before sending', confirmed, { type: 'markDelivered' }],
      ['sellerCancel after delivery', delivered, { type: 'sellerCancel', reason: 'other' }],
      ['resolveClaim on an open order', confirmed, { type: 'resolveClaim', received: true }],
      ['markRefundSent with no refund due', confirmed, { type: 'markRefundSent' }],
    ];
    for (const [label, order, action] of cases) {
      const before = await db.select().from(t.orders).where(eq(t.orders.id, order.id));
      const eventsBefore = await db
        .select()
        .from(t.orderEvents)
        .where(eq(t.orderEvents.orderId, order.id));
      const res = await act(w, order.id, action);
      expect(res.status, label).toBe(422);
      expect(res.json.error.code, label).toBe('forbidden_transition');
      const after = await db.select().from(t.orders).where(eq(t.orders.id, order.id));
      expect(after[0], label).toMatchObject({
        status: before[0]!.status,
        paymentStatus: before[0]!.paymentStatus,
      });
      const eventsAfter = await db
        .select()
        .from(t.orderEvents)
        .where(eq(t.orderEvents.orderId, order.id));
      expect(eventsAfter, label).toHaveLength(eventsBefore.length);
    }
    expect(
      testOutbox.all().filter((e) => e.kind !== 'order-sent' && e.kind !== 'order-delivered'),
    ).toHaveLength(0);
  });
});

describe('authorization', () => {
  it("a seller never reaches another shop's orders (404)", async () => {
    const a = await shopWorld();
    const b = await shopWorld();
    const theirs = await b.order();
    expect((await a.call(getOrder, { id: theirs.id })).status).toBe(404);
    expect((await a.call(getOrder, { id: 'nope' })).status).toBe(404);
    expect((await act(a, theirs.id, { type: 'markPaid' })).status).toBe(404);
    expect((await a.call(listOrders, { query: '?tab=all' })).json.orders).toHaveLength(0);
    const [row] = await db.select().from(t.orders).where(eq(t.orders.id, theirs.id));
    expect(row!.status).toBe('awaiting_payment');
  });

  it('is 401 signed out and 404 without a shop', async () => {
    expect(await anonCall(listOrders)).toBe(401);
    expect(await anonCall(getOrder, { id: crypto.randomUUID() })).toBe(401);
    expect(await anonCall(postAction, { method: 'POST', id: crypto.randomUUID() })).toBe(401);
    const user = await newUser();
    expect((await user.call(listOrders)).status).toBe(404);
  });
});
