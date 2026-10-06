import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { newSeller } from '@/test/sellerApi';
import { storeJpeg } from '@/test/storage';
import { deleteAccount } from './accountDeletion';
import { getDb } from './db';
import { insertOrder } from './orders';
import { postPurge, purge } from './purge';
import { getStorage, localObjectExists, storageDriver } from './storage';

// M8a CP3: the daily purge (decisions #72 c, #74 c, #75) with backdated records instead of
// waiting 30 days: a dry run removes nothing, a real run removes a deleted account's data,
// files and auth user, and never touches a live shop, a recent deletion or a demo shop.

const db = () => getDb();
const t = schema;
const DAY = 86_400_000;
const CRON = 'cron-secret-for-tests-0123456789abcdef';

beforeEach(async () => {
  await truncateAll(db());
});
afterAll(async () => {
  await truncateAll(db());
});

/** Makes a stored local file look `days` old (the unreferenced sweep waits 24 h). */
async function age(key: string, days: number) {
  const { env } = storageDriver();
  const file = path.join(path.resolve(env.STORAGE_DIR), ...key.split('/'));
  const when = new Date(Date.now() - days * DAY);
  await utimes(file, when, when);
}

/** A shop with a product (2 photos), a logo, a delivered-style order with a review photo and a feedback screenshot. */
async function fullShop() {
  const s = await newSeller();
  const logo = await storeJpeg(`logos/${s.shopId}/logo.jpg`);
  const full = await storeJpeg(`products/${s.shopId}/p1.jpg`);
  const thumb = await storeJpeg(`products/${s.shopId}/p1_thumb.jpg`);
  const shot = await storeJpeg(`feedback/${s.shopId}/shot.jpg`);
  await db()
    .update(t.shops)
    .set({ logoPath: logo, acceptsPayOnDelivery: true, pickupEnabled: true, pickupLocation: 'CBD' })
    .where(eq(t.shops.id, s.shopId));
  const [product] = await db()
    .insert(t.products)
    .values({ shopId: s.shopId, name: 'Kiondo bag', price: 1800 })
    .returning();
  await db()
    .insert(t.productPhotos)
    .values({ productId: product!.id, objectKey: full, thumbKey: thumb, position: 0 });
  const { order } = await insertOrder(db(), {
    shopId: s.shopId,
    kind: 'buyer_pay_on_delivery',
    source: 'wa',
    buyer: { name: 'Wanjiku Mwangi', phone: '0712 345 901', email: null },
    fulfilment: { kind: 'pickup' },
    lines: [{ productId: product!.id, qty: 1 }],
  });
  const reviewPhoto = await storeJpeg(`reviews/${order.id}/r1.jpg`);
  const [item] = await db().select().from(t.orderItems).where(eq(t.orderItems.orderId, order.id));
  const [review] = await db()
    .insert(t.reviews)
    .values({
      orderId: order.id,
      shopId: s.shopId,
      buyerDisplayName: 'Wanjiku M.',
      rating: 5,
      editableUntil: new Date(Date.now() + 7 * DAY),
    })
    .returning();
  await db()
    .insert(t.reviewItems)
    .values({ reviewId: review!.id, orderItemId: item!.id, rating: 5, photoPath: reviewPhoto });
  await db()
    .insert(t.feedback)
    .values({ shopId: s.shopId, kind: 'idea', message: 'More colours', screenshotPath: shot });
  return { ...s, product: product!, order, files: [logo, full, thumb, shot, reviewPhoto] };
}

/** Deletes the account and makes the deletion look `days` old (the staging backdate tool). */
async function deletedDaysAgo(s: { userId: string; shopId: string }, days: number) {
  await deleteAccount(db(), s.userId, 'app');
  const when = new Date(Date.now() - days * DAY);
  await db().update(t.shops).set({ deletedAt: when }).where(eq(t.shops.id, s.shopId));
  await db().update(t.profiles).set({ deletedAt: when }).where(eq(t.profiles.id, s.userId));
}

const exists = (keys: string[]) => Promise.all(keys.map(localObjectExists));
const userExists = async (id: string) =>
  !!(await db().query.authUser.findFirst({ where: eq(t.authUser.id, id) }));

describe('deleted accounts', () => {
  it('a dry run reports and removes nothing; the real run removes data, files and the auth user', async () => {
    const gone = await fullShop();
    const live = await fullShop();
    const recent = await fullShop();
    await deletedDaysAgo(gone, 31);
    await deletedDaysAgo(recent, 29);

    const dry = await purge(db(), { dryRun: true, actor: 'owner-gh' });
    expect(dry.accounts).toEqual([
      expect.objectContaining({ userId: gone.userId, slug: gone.slug, files: 5 }),
    ]);
    expect(await userExists(gone.userId)).toBe(true);
    expect(await exists(gone.files)).toEqual([true, true, true, true, true]);
    const [dryEvent] = await db()
      .select()
      .from(t.opsEvents)
      .where(eq(t.opsEvents.action, 'purge_dry_run'));
    expect(dryEvent).toMatchObject({ actor: 'owner-gh' });
    expect(dryEvent!.details).toMatchObject({ dryRun: true, accounts: 1, slugs: [gone.slug] });

    const real = await purge(db(), { dryRun: false });
    expect(real.accounts.map((a) => a.slug)).toEqual([gone.slug]);
    expect(real.failedFiles).toBe(0);
    expect(await userExists(gone.userId)).toBe(false);
    expect(await db().select().from(t.shops).where(eq(t.shops.id, gone.shopId))).toEqual([]);
    for (const table of ['products', 'orders', 'feedback', 'reviews', 'notifications']) {
      const { rows } = await db().execute(
        sql`select 1 from ${sql.identifier(table)} where shop_id = ${gone.shopId}`,
      );
      expect(rows, table).toEqual([]);
    }
    expect(await exists(gone.files)).toEqual([false, false, false, false, false]);
    // The live shop and the one deleted 29 days ago keep everything.
    for (const s of [live, recent]) {
      expect(await userExists(s.userId)).toBe(true);
      expect(await exists(s.files)).toEqual([true, true, true, true, true]);
    }
    const [event] = await db()
      .select()
      .from(t.opsEvents)
      .where(eq(t.opsEvents.action, 'account_purged'));
    expect(event).toMatchObject({ shopId: gone.shopId, targetId: gone.userId, actor: 'schedule' });
    expect(event!.details).toMatchObject({ slug: gone.slug, orders: 1, products: 1, files: 5 });
    expect(
      await db().select().from(t.opsEvents).where(eq(t.opsEvents.action, 'purge_run')),
    ).toHaveLength(1);
    // The buyer's order link now 404s like any unknown order (#38 c).
    expect(
      await db().select().from(t.orders).where(eq(t.orders.publicToken, gone.order.publicToken)),
    ).toEqual([]);

    // Run again: nothing left to do.
    expect((await purge(db(), { dryRun: false })).accounts).toEqual([]);
  });

  it('never purges a demo shop, deleted or not', async () => {
    const demo = await fullShop();
    await deletedDaysAgo(demo, 40);
    const report = await purge(db(), { dryRun: false, demoSlugs: new Set([demo.slug]) });
    expect(report.accounts).toEqual([]);
    expect(report.skippedDemo).toEqual([demo.slug]);
    expect(await userExists(demo.userId)).toBe(true);
    expect(await exists(demo.files)).toEqual([true, true, true, true, true]);
  });

  it('a file that fails to delete is queued and the account is still purged', async () => {
    const gone = await fullShop();
    await deletedDaysAgo(gone, 31);
    const store = getStorage();
    const original = store.delete;
    store.delete = async (key) => {
      if (key.endsWith('logo.jpg')) throw new Error('storage down');
      return original(key);
    };
    try {
      const report = await purge(db(), { dryRun: false });
      expect(report.failedFiles).toBe(1);
    } finally {
      store.delete = original;
    }
    expect(await userExists(gone.userId)).toBe(false);
    const queued = await db().select().from(t.storageDeletions);
    expect(queued.map((q) => q.objectKey)).toEqual([`logos/${gone.shopId}/logo.jpg`]);
    // The next run retries it (rows older than 10 minutes).
    await db().execute(sql`update storage_deletions set created_at = now() - interval '1 hour'`);
    const next = await purge(db(), { dryRun: false });
    expect(next.retried).toBe(1);
    expect(await db().select().from(t.storageDeletions)).toEqual([]);
    expect(await localObjectExists(`logos/${gone.shopId}/logo.jpg`)).toBe(false);
  });
});

describe('soft-deleted products', () => {
  it('after 30 days the row and photos go, except a thumbnail a past order shows', async () => {
    const s = await fullShop();
    const [fresh] = await db()
      .insert(t.products)
      .values({ shopId: s.shopId, name: 'Deleted yesterday', price: 100 })
      .returning();
    await db()
      .update(t.products)
      .set({ deletedAt: new Date(Date.now() - 31 * DAY) })
      .where(eq(t.products.id, s.product.id));
    await db()
      .update(t.products)
      .set({ deletedAt: new Date(Date.now() - DAY) })
      .where(eq(t.products.id, fresh!.id));
    const [full, thumb] = [s.files[1]!, s.files[2]!];

    const dry = await purge(db(), { dryRun: true });
    expect(dry).toMatchObject({ products: 1, productFiles: 1, keptForOrders: 1 });
    expect(await exists([full, thumb])).toEqual([true, true]);

    await purge(db(), { dryRun: false });
    expect(await db().select().from(t.products).where(eq(t.products.id, s.product.id))).toEqual([]);
    expect(await db().select().from(t.products).where(eq(t.products.id, fresh!.id))).toHaveLength(
      1,
    );
    // The order keeps its line (name, price) and its thumbnail; the full photo is gone.
    const [item] = await db()
      .select()
      .from(t.orderItems)
      .where(eq(t.orderItems.orderId, s.order.id));
    expect(item).toMatchObject({
      productId: null,
      nameSnapshot: 'Kiondo bag',
      coverPathSnapshot: thumb,
    });
    expect(await exists([full, thumb])).toEqual([false, true]);
    // The kept thumbnail is referenced, so the unreferenced sweep leaves it too.
    await age(thumb, 3);
    await purge(db(), { dryRun: false });
    expect(await localObjectExists(thumb)).toBe(true);
  });
});

describe('unreferenced files and old sign-ups', () => {
  it('removes files no row points at once they are over 24 h old, and sign-ups over 7 days', async () => {
    const s = await fullShop();
    const oldOrphan = await storeJpeg(`products/${s.shopId}/abandoned.jpg`);
    const newOrphan = await storeJpeg(`products/${s.shopId}/uploading.jpg`);
    const oldReview = await storeJpeg(`reviews/${s.order.id}/never-sent.jpg`);
    await age(oldOrphan, 2);
    await age(oldReview, 2);
    for (const key of s.files) await age(key, 2);
    await db()
      .insert(t.signupAttempts)
      .values([
        { email: 'old@example.test', passwordHash: 'x', createdAt: new Date(Date.now() - 8 * DAY) },
        { email: 'new@example.test', passwordHash: 'x' },
      ]);

    const dry = await purge(db(), { dryRun: true });
    // Files left by earlier tests (their rows are truncated) count too: at least these two.
    expect(dry.unreferenced).toBeGreaterThanOrEqual(2);
    expect(dry.signupAttempts).toBe(1);
    expect(await exists([oldOrphan, oldReview])).toEqual([true, true]);

    const real = await purge(db(), { dryRun: false });
    expect(real.unreferenced).toBe(dry.unreferenced);
    expect(real.signupAttempts).toBe(1);
    expect(await exists([oldOrphan, oldReview, newOrphan])).toEqual([false, false, true]);
    // Every file a row points at stays (logo, product photos, review photo, screenshot).
    expect(await exists(s.files)).toEqual([true, true, true, true, true]);
    expect((await db().select().from(t.signupAttempts)).map((a) => a.email)).toEqual([
      'new@example.test',
    ]);
  });
});

describe('POST /api/cron/purge', () => {
  const call = (headers: Record<string, string>, body?: unknown) =>
    postPurge(
      new Request('http://localhost:3000/api/cron/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      CRON,
    );

  it('needs the cron secret (404 otherwise); dryRun reports only; the actor is recorded', async () => {
    const gone = await fullShop();
    await deletedDaysAgo(gone, 31);
    expect((await call({})).status).toBe(404);
    expect((await call({ authorization: 'Bearer wrong' })).status).toBe(404);
    const dry = await call(
      { authorization: `Bearer ${CRON}`, 'x-oda-actor': 'dennismugu7' },
      {
        dryRun: true,
      },
    );
    expect(dry.status).toBe(200);
    expect(await dry.json()).toMatchObject({ dryRun: true, accounts: 1, slugs: [gone.slug] });
    expect(await userExists(gone.userId)).toBe(true);
    const real = await call({ authorization: `Bearer ${CRON}`, 'x-oda-actor': '<script>' });
    expect(await real.json()).toMatchObject({ dryRun: false, accounts: 1 });
    expect(await userExists(gone.userId)).toBe(false);
    const actors = (await db().select().from(t.opsEvents)).map((e) => `${e.action}:${e.actor}`);
    expect(actors).toContain('purge_dry_run:dennismugu7');
    expect(actors).toContain('purge_run:schedule');
  });
});
