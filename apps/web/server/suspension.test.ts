import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { newSeller, type Json, type Seller } from '@/test/sellerApi';
import { POST as postUpload } from '@/app/api/uploads/route';
import { GET as getMe } from '@/app/api/me/route';
import { listProducts, createProduct, updateProduct } from './catalogueRoutes';
import type { Defer } from './checkout';
import { getDb } from './db';
import { createManualOrder, getOrder, listOrders, postOrderAction } from './orderRoutes';
import { insertOrder } from './orders';
import { purge } from './purge';
import { publicRepo } from './repos/public';
import type { Handler } from './routeHandler';
import { patchDetails, patchPause, patchShopProfile, postFeedback } from './settingsRoutes';
import { postShopSuspension } from './suspension';

// M10 CP2 (decisions #72 d, #81 d): suspend / unsuspend through the ops endpoint
// (OPS_SECRET), audited in ops_events. A suspended shop is 404 to buyers and takes no new
// orders; its seller stays signed in, can finish existing orders and change their own
// account, but can't edit the shop or catalogue. Unsuspending restores everything.

const db = getDb();
const t = schema;
// Before serverEnv() first reads (and caches) the environment; each test file is isolated.
const SECRET = vi.hoisted(() => {
  const secret = 'test-ops-secret-0123456789abcdef0123456789';
  process.env.OPS_SECRET = secret;
  return secret;
});

let deferred: Promise<void>[] = [];
const defer: Defer = (work) => {
  deferred.push(work());
};
const postAction = postOrderAction(defer);

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await Promise.all(deferred);
  await truncateAll(db);
});

async function ops(body: unknown, secret: string | null = SECRET) {
  const res = await postShopSuspension(
    new Request('http://localhost:3000/api/ops/shops/suspension', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}

const suspend = (slug: string, action = 'suspend') =>
  ops({ shopSlug: slug, action, reason: 'Reported for selling fakes', actor: 'owner-gh' });

/** A seller with one product, a delivery area and an open pay-on-delivery order. */
async function world() {
  const s = await newSeller();
  await db
    .update(t.shops)
    .set({ acceptsPayOnDelivery: true, pickupEnabled: true, pickupLocation: 'Kilimani stall' })
    .where(eq(t.shops.id, s.shopId));
  const [product] = await db
    .insert(t.products)
    .values({ shopId: s.shopId, name: 'Ankara wrap dress', price: 2500 })
    .returning();
  const { order } = await insertOrder(db, {
    shopId: s.shopId,
    kind: 'buyer_pay_on_delivery',
    source: 'wa',
    buyer: { name: 'Wanjiku Mwangi', phone: '0712 345 901' },
    fulfilment: { kind: 'pickup' },
    lines: [{ productId: product!.id, qty: 1 }],
  });
  return { ...s, product: product!, order };
}

const findShop = (slug: string) => publicRepo(db).findShop(slug);
const events = () => db.select().from(t.opsEvents).orderBy(t.opsEvents.createdAt);

async function act(s: Seller, orderId: string, action: Json) {
  return s.call(postAction, { id: orderId, body: action });
}

describe('the ops endpoint', () => {
  it('needs the secret (404 otherwise) and exact, valid input', async () => {
    const w = await world();
    for (const secret of [null, 'wrong']) {
      const res = await ops(
        { shopSlug: w.slug, action: 'suspend', reason: 'x'.repeat(5), actor: 'a' },
        secret,
      );
      expect(res.status).toBe(404);
    }
    expect(
      (await ops({ shopSlug: w.slug, action: 'ban', reason: 'Spam', actor: 'a' })).status,
    ).toBe(422);
    expect(
      (await ops({ shopSlug: w.slug, action: 'suspend', reason: '', actor: 'a' })).status,
    ).toBe(422);
    expect(
      (await ops({ shopSlug: w.slug, action: 'suspend', reason: 'Spam', actor: 'a b' })).status,
    ).toBe(422);
    // Unknown, partial and old link names never reach a shop.
    expect((await suspend('no-such-shop')).status).toBe(404);
    expect((await suspend(w.slug.slice(0, -2))).status).toBe(404);
    await db.insert(t.shopSlugHistory).values({ shopId: w.shopId, oldSlug: `${w.slug}-old` });
    expect((await suspend(`${w.slug}-old`)).status).toBe(404);
    expect(await events()).toEqual([]);
    const shop = await db.query.shops.findFirst({ where: eq(t.shops.id, w.shopId) });
    expect(shop?.suspendedAt).toBeNull();
  });

  it('suspend → the shop is 404 and takes no orders; unsuspend restores it; both audited', async () => {
    const w = await world();
    const other = await world();
    expect((await findShop(w.slug)).kind).toBe('shop');

    const res = await suspend(w.slug);
    expect(res).toMatchObject({
      status: 200,
      json: { shop: w.slug, suspended: true, changed: true },
    });
    expect((await findShop(w.slug)).kind).toBe('not_found');
    expect((await findShop(other.slug)).kind).toBe('shop'); // only that shop
    await expect(
      insertOrder(db, {
        shopId: w.shopId,
        kind: 'buyer_pay_on_delivery',
        source: 'wa',
        buyer: { name: 'Brian Otieno', phone: '0712 345 902' },
        fulfilment: { kind: 'pickup' },
        lines: [{ productId: w.product.id, qty: 1 }],
      }),
    ).rejects.toMatchObject({ status: 404 });

    // Twice is harmless: no change, no second audit row.
    expect((await suspend(w.slug)).json).toMatchObject({ suspended: true, changed: false });
    expect(await events()).toHaveLength(1);

    const back = await suspend(w.slug, 'unsuspend');
    expect(back.json).toMatchObject({ suspended: false, changed: true, since: null });
    expect((await findShop(w.slug)).kind).toBe('shop');
    expect((await suspend(w.slug, 'unsuspend')).json.changed).toBe(false);

    const rows = await events();
    expect(rows.map((r) => r.action)).toEqual(['shop_suspended', 'shop_unsuspended']);
    expect(rows[0]).toMatchObject({
      shopId: w.shopId,
      targetId: w.shopId,
      reason: 'Reported for selling fakes',
      actor: 'owner-gh',
      details: { slug: w.slug, name: 'Amani Styles', suspendedAt: null },
    });
    expect((rows[1]!.details as Json).suspendedAt).toEqual(expect.any(String));
  });

  it('a deleted shop can’t be suspended; the purge leaves a suspended (not deleted) shop alone', async () => {
    const w = await world();
    await suspend(w.slug);
    await db
      .update(t.shops)
      .set({ suspendedAt: new Date(Date.now() - 90 * 86_400_000) })
      .where(eq(t.shops.id, w.shopId));
    const report = await purge(db, { dryRun: false });
    expect(report.accounts).toEqual([]);
    expect(await db.query.shops.findFirst({ where: eq(t.shops.id, w.shopId) })).toBeDefined();

    const gone = await world();
    await db.update(t.shops).set({ deletedAt: new Date() }).where(eq(t.shops.id, gone.shopId));
    expect((await suspend(gone.slug)).status).toBe(404);
  });
});

describe('a suspended seller', () => {
  it('stays signed in, sees it in /api/me, and can finish existing orders', async () => {
    const w = await world();
    await suspend(w.slug);
    const me = await w.call(getMe as unknown as Handler);
    expect(me.json.shop).toMatchObject({ slug: w.slug, suspended: true });

    expect((await w.call(listOrders)).status).toBe(200);
    expect((await w.call(getOrder, { id: w.order.id })).status).toBe(200);
    expect((await w.call(listProducts)).json.products).toHaveLength(1);
    let res = await act(w, w.order.id, { type: 'accept' });
    expect(res.json.order.status).toBe('confirmed');
    res = await act(w, w.order.id, { type: 'markSent', sentMethod: 'pickup' });
    expect(res.json.order.status).toBe('sent');
    res = await act(w, w.order.id, { type: 'markDelivered', collected: true });
    expect(res.json.order.status).toBe('delivered');

    // Their own account and support still work.
    expect(
      (await w.call(patchDetails, { method: 'PATCH', body: { firstName: 'Amani' } })).status,
    ).toBe(200);
    expect(
      (await w.call(postFeedback, { body: { kind: 'broken', message: 'Why am I suspended?' } }))
        .status,
    ).toBe(201);
    const shot = await w.call(postUpload as unknown as Handler, {
      body: { kind: 'feedback', contentType: 'image/jpeg', size: 1000 },
    });
    expect(shot.status).not.toBe(403);
  });

  it('can’t create orders or edit the shop or catalogue (403, with the support email)', async () => {
    const w = await world();
    await suspend(w.slug);
    const refused: [Handler, { method?: string; body?: unknown; id?: string }][] = [
      [createProduct, { body: { name: 'New', price: 100, photos: [] } }],
      [updateProduct, { method: 'PATCH', id: w.product.id, body: { price: 1 } }],
      [patchShopProfile, { method: 'PATCH', body: { about: 'Back soon' } }],
      [patchPause, { method: 'PATCH', body: { paused: true } }],
      [
        createManualOrder,
        {
          body: {
            idempotencyKey: 'manual-suspended-0001',
            buyer: { name: 'Brian Otieno', phone: '0712 345 902', whatsapp: true },
            fulfilment: { kind: 'pickup' },
            lines: [{ productId: w.product.id, qty: 1 }],
            payment: 'not_paid',
          },
        },
      ],
      [
        postUpload as unknown as Handler,
        { body: { kind: 'product', contentType: 'image/jpeg', size: 1000 } },
      ],
    ];
    for (const [handler, opts] of refused) {
      const res = await w.call(handler, opts);
      expect(res.status, JSON.stringify(opts.body ?? opts.method)).toBe(403);
      expect(res.json.error).toEqual({
        code: 'shop_suspended',
        message: 'Your shop is suspended. Email support@mugu-labs.com',
      });
    }
    const product = await db.query.products.findFirst({ where: eq(t.products.id, w.product.id) });
    expect(product?.price).toBe(2500);
    expect(await db.select().from(t.orders)).toHaveLength(1);

    // Unsuspended: edits work again.
    await suspend(w.slug, 'unsuspend');
    expect(
      (await w.call(updateProduct, { method: 'PATCH', id: w.product.id, body: { price: 2600 } }))
        .status,
    ).toBe(200);
    expect((await w.call(getMe as unknown as Handler)).json.shop.suspended).toBe(false);
  });
});
