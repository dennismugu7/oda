import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { anonCall, newSeller, newUser, type Seller } from '@/test/sellerApi';
import { afterOrderChange } from './afterOrder';
import { assertCronSecret, expireOrders, postExpireOrders } from './cron';
import { getDb } from './db';
import { insertOrder } from './orders';
import { checkPushReceipts, testPush } from './push';
import { deletePushToken, postPushToken } from './pushRoutes';

// M6 CP4 (code before the 0.3.0 build): push tokens (registered on sign-in, removed on
// sign-out, one account per phone), pushes for the machine's push side effects with the
// notification text and the order to open, dead tokens removed, and the hourly auto-expire
// job behind CRON_SECRET.

const db = getDb();
const t = schema;
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const SECRET = 'test-cron-secret-0123456789abcdefghijklmnop';

beforeEach(async () => {
  await truncateAll(db);
  testPush.clear();
});
afterAll(async () => {
  await truncateAll(db);
});

const tokensOf = async (userId: string) =>
  (await db.select().from(t.profiles).where(eq(t.profiles.id, userId)))[0]!.expoPushTokens;

async function shopWithProduct(s: Seller) {
  await db
    .update(t.shops)
    .set({ acceptsPayOnDelivery: true, pickupEnabled: true, pickupLocation: 'Stall' })
    .where(eq(t.shops.id, s.shopId));
  await db.insert(t.paymentAccounts).values({
    shopId: s.shopId,
    type: 'till',
    number: '5123456',
    accountName: 'AMANI STYLES',
    isActive: true,
  });
  const [p] = await db
    .insert(t.products)
    .values({ shopId: s.shopId, name: 'Kitenge top', price: 1200 })
    .returning();
  return (kind: 'buyer_pay_now' | 'buyer_pay_on_delivery' | 'manual_not_paid' = 'buyer_pay_now') =>
    insertOrder(db, {
      shopId: s.shopId,
      kind,
      buyer: { name: 'Wanjiku', phone: '0712 345 901' },
      fulfilment: { kind: 'pickup' },
      lines: [{ productId: p!.id, qty: 1 }],
    });
}

describe('push tokens', () => {
  it('register on sign-in, remove on sign-out', async () => {
    const s = await newSeller();
    expect((await s.call(postPushToken, { body: { token: TOKEN_A } })).status).toBe(204);
    await s.call(postPushToken, { body: { token: TOKEN_A } }); // twice: still once
    await s.call(postPushToken, { body: { token: TOKEN_B } });
    expect(await tokensOf(s.userId)).toEqual([TOKEN_A, TOKEN_B]);
    expect(
      (await s.call(deletePushToken, { method: 'DELETE', body: { token: TOKEN_A } })).status,
    ).toBe(204);
    expect(await tokensOf(s.userId)).toEqual([TOKEN_B]);
  });

  it('a phone belongs to one account: signing in elsewhere moves its token', async () => {
    const a = await newSeller();
    const b = await newSeller();
    await a.call(postPushToken, { body: { token: TOKEN_A } });
    await b.call(postPushToken, { body: { token: TOKEN_A } });
    expect(await tokensOf(a.userId)).toEqual([]);
    expect(await tokensOf(b.userId)).toEqual([TOKEN_A]);
    // Removing a token you don't have touches nobody else.
    await a.call(deletePushToken, { method: 'DELETE', body: { token: TOKEN_A } });
    expect(await tokensOf(b.userId)).toEqual([TOKEN_A]);
  });

  it('keeps the newest 5 phones; refuses anything that is not an Expo token', async () => {
    const s = await newSeller();
    for (let i = 0; i < 7; i++) {
      await s.call(postPushToken, { body: { token: `ExponentPushToken[phone${i}xxxxxxxx]` } });
    }
    const tokens = await tokensOf(s.userId);
    expect(tokens).toHaveLength(5);
    expect(tokens[0]).toBe('ExponentPushToken[phone2xxxxxxxx]');
    expect((await s.call(postPushToken, { body: { token: 'nope' } })).status).toBe(422);
    expect(
      (await s.call(postPushToken, { body: { token: TOKEN_A, userId: randomUUID() } })).status,
    ).toBe(422);
  });

  it('needs a session (401); works before the shop exists', async () => {
    expect(await anonCall(postPushToken, { method: 'POST' })).toBe(401);
    const u = await newUser();
    expect((await u.call(postPushToken, { body: { token: TOKEN_A } })).status).toBe(204);
  });
});

describe('sending pushes', () => {
  it('a new web order pushes the notification text to every phone, with the order to open', async () => {
    const s = await newSeller();
    const order = await shopWithProduct(s);
    await s.call(postPushToken, { body: { token: TOKEN_A } });
    await s.call(postPushToken, { body: { token: TOKEN_B } });
    const { order: o, sideEffects } = await order();
    await afterOrderChange(db, o, sideEffects);
    const sent = testPush.sent();
    expect(sent.map((m) => m.to)).toEqual([TOKEN_A, TOKEN_B]);
    expect(sent[0]).toMatchObject({
      title: `New order #${o.number}`,
      body: 'Wanjiku · KSh 1,200 · Pay now with M-Pesa',
      data: { type: 'new_order', orderId: o.id },
      priority: 'high',
      channelId: 'orders',
    });
    // The same text as the in-app notification row.
    const [row] = await db.select().from(t.notifications).where(eq(t.notifications.orderId, o.id));
    expect(row).toMatchObject({ title: sent[0]!.title, body: sent[0]!.body });
  });

  it('no push for side effects without one (manual orders, seller actions)', async () => {
    const s = await newSeller();
    const order = await shopWithProduct(s);
    await s.call(postPushToken, { body: { token: TOKEN_A } });
    const { order: o, sideEffects } = await order('manual_not_paid');
    await afterOrderChange(db, o, sideEffects);
    expect(testPush.sent()).toHaveLength(0);
  });

  it('removes tokens Expo says are no longer registered', async () => {
    const s = await newSeller();
    const order = await shopWithProduct(s);
    await s.call(postPushToken, { body: { token: TOKEN_A } });
    await s.call(postPushToken, { body: { token: TOKEN_B } });
    testPush.answerWith(async (messages) =>
      messages.map((m) =>
        m.to === TOKEN_A
          ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: 'x' },
      ),
    );
    const { order: o, sideEffects } = await order();
    await afterOrderChange(db, o, sideEffects);
    expect(await tokensOf(s.userId)).toEqual([TOKEN_B]);
  });

  it('a push failure never throws', async () => {
    const s = await newSeller();
    const order = await shopWithProduct(s);
    await s.call(postPushToken, { body: { token: TOKEN_A } });
    testPush.answerWith(async () => {
      throw new Error('network down');
    });
    const { order: o, sideEffects } = await order();
    await expect(afterOrderChange(db, o, sideEffects)).resolves.toBeUndefined();
  });
});

describe('delivery receipts (hourly job, decision #85)', () => {
  const MINUTE = 60_000;

  async function sentTo(tokens: string[]) {
    const s = await newSeller();
    const order = await shopWithProduct(s);
    for (const token of tokens) await s.call(postPushToken, { body: { token } });
    testPush.answerWith(async (messages) =>
      messages.map((m) => ({ status: 'ok' as const, id: `ticket-${m.to.slice(18, 19)}` })),
    );
    const { order: o, sideEffects } = await order();
    await afterOrderChange(db, o, sideEffects);
    return s;
  }
  const tickets = () => db.select().from(t.pushTickets);

  it('keeps each ticket, then removes the tokens Expo’s receipts say are dead', async () => {
    const s = await sentTo([TOKEN_A, TOKEN_B]);
    expect((await tickets()).map((r) => [r.ticketId, r.token]).sort()).toEqual([
      ['ticket-a', TOKEN_A],
      ['ticket-b', TOKEN_B],
    ]);
    const asked: string[][] = [];
    testPush.receiptsWith(async (ids) => {
      asked.push(ids);
      return {
        'ticket-a': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        'ticket-b': { status: 'ok' },
      };
    });

    // Too new: receipts aren't ready for 15 minutes.
    expect(await checkPushReceipts(db)).toMatchObject({ checked: 0, removed: 0 });
    expect(asked).toEqual([]);

    const later = new Date(Date.now() + 20 * MINUTE);
    expect(await checkPushReceipts(db, later)).toEqual({
      checked: 2,
      failed: 1,
      removed: 1,
      expired: 0,
    });
    expect(await tokensOf(s.userId)).toEqual([TOKEN_B]);
    expect(await tickets()).toEqual([]);
  });

  it('a ticket without a receipt waits for the next hour; after a day it is dropped', async () => {
    const s = await sentTo([TOKEN_A]);
    testPush.receiptsWith(async () => ({}));
    expect(await checkPushReceipts(db, new Date(Date.now() + 20 * MINUTE))).toMatchObject({
      checked: 0,
    });
    expect(await tickets()).toHaveLength(1);
    expect(await checkPushReceipts(db, new Date(Date.now() + 25 * 60 * MINUTE))).toMatchObject({
      expired: 1,
    });
    expect(await tickets()).toEqual([]);
    expect(await tokensOf(s.userId)).toEqual([TOKEN_A]);
  });

  it('never throws, even when Expo’s answer fails', async () => {
    await sentTo([TOKEN_A]);
    testPush.receiptsWith(async () => {
      throw new Error('network');
    });
    await expect(checkPushReceipts(db, new Date(Date.now() + 20 * MINUTE))).resolves.toMatchObject({
      checked: 0,
    });
    expect(await tickets()).toHaveLength(1);
  });
});

describe('auto-expire (hourly job)', () => {
  const backdate = (id: string, hours: number) =>
    db.execute(
      sql`update orders set awaiting_payment_since = now() - ${hours} * interval '1 hour' where id = ${id}`,
    );

  it('expires buyer pay-now orders unpaid for 48 h; never manual, newer or paid ones', async () => {
    const s = await newSeller();
    const order = await shopWithProduct(s);
    await s.call(postPushToken, { body: { token: TOKEN_A } });
    const old = (await order()).order;
    const fresh = (await order()).order;
    const manual = (await order('manual_not_paid')).order;
    const pod = (await order('buyer_pay_on_delivery')).order;
    await backdate(old.id, 49);
    await backdate(fresh.id, 47);
    await backdate(manual.id, 100);
    await db.execute(
      sql`update orders set placed_at = now() - interval '100 hours' where id = ${pod.id}`,
    );

    const { expired, skipped } = await expireOrders(db);
    expect(expired.map((e) => e.order.id)).toEqual([old.id]);
    expect(skipped).toBe(0);
    expect(expired[0]!.order).toMatchObject({
      status: 'cancelled',
      cancelReason: 'expired',
      cancelledBy: 'system',
    });
    const statuses = await db.select({ id: t.orders.id, s: t.orders.status }).from(t.orders);
    expect(statuses.filter((r) => r.s === 'cancelled').map((r) => r.id)).toEqual([old.id]);

    // The push and the notification row say it expired.
    testPush.clear();
    await afterOrderChange(db, expired[0]!.order, expired[0]!.sideEffects);
    expect(testPush.sent()[0]).toMatchObject({
      title: `#${old.number} expired`,
      data: { type: 'order_expired', orderId: old.id },
    });
    // A second run finds nothing.
    expect((await expireOrders(db)).expired).toHaveLength(0);
  });

  it('the route is a 404 without the right Bearer secret, and runs with it', async () => {
    const req = (auth?: string) =>
      new Request('http://localhost:3000/api/cron/expire-orders', {
        method: 'POST',
        headers: auth ? { authorization: auth } : {},
      });
    expect(() => assertCronSecret(req(), SECRET)).toThrow();
    expect(() => assertCronSecret(req(`Bearer ${SECRET}x`), SECRET)).toThrow();
    expect(() => assertCronSecret(req(SECRET), SECRET)).toThrow();
    expect(() => assertCronSecret(req(`Bearer ${SECRET}`), undefined)).toThrow();
    expect(() => assertCronSecret(req(`Bearer ${SECRET}`), SECRET)).not.toThrow();

    // Through the handler: tests run without CRON_SECRET, so even a "right" header is a 404.
    expect((await postExpireOrders(req(`Bearer ${SECRET}`), () => {})).status).toBe(404);
    expect((await postExpireOrders(req(), () => {})).status).toBe(404);
  });
});
