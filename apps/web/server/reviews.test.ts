import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { REVIEW_LIMITS } from '@oda/shared';
import { anonCall, newSeller, type Json, type Seller } from '@/test/sellerApi';
import { storeJpeg } from '@/test/storage';
import { requireOps } from './authz';
import type { Defer } from './checkout';
import { getDb } from './db';
import { listNotifications } from './homeRoutes';
import { GET as getMe } from '@/app/api/me/route';
import { postOrderAction } from './orderRoutes';
import { insertOrder, type NewOrder } from './orders';
import { testPush } from './push';
import { hitLimit } from './rateLimit';
import { productReviews } from './repos/reviews';
import {
  getBuyerReview,
  getReview,
  listReviews,
  postRemoveReview,
  postReviewReport,
  postReviewUpload,
  putReviewReply,
  removeReview,
  writeBuyerReview,
} from './reviews';
import { getStorage } from './storage';

// Reviews (M7 CP1, decision #73) against oda_test: the buyer's review through the order
// token (delivered, buyer-placed orders only; one per order; 7-day edits; photos under the
// order's prefix), the aggregates the triggers keep, the seller's list / reply / report, the
// public product reviews and the ops removal.

const db = getDb();
const t = schema;
const ORIGIN = 'http://localhost:3000';

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
  testPush.clear();
});
afterAll(async () => {
  await truncateAll(db);
});

async function shopWorld() {
  const s = await newSeller();
  await db
    .update(t.shops)
    .set({ acceptsPayOnDelivery: true, pickupEnabled: true, pickupLocation: 'Kilimani stall' })
    .where(eq(t.shops.id, s.shopId));
  const [dress, top] = await db
    .insert(t.products)
    .values([
      { shopId: s.shopId, name: 'Ankara wrap dress', price: 2500, sizes: ['M'] },
      { shopId: s.shopId, name: 'Kitenge top', price: 1200 },
    ])
    .returning();
  async function order(overrides: Partial<NewOrder> = {}) {
    const { order } = await insertOrder(db, {
      shopId: s.shopId,
      kind: 'buyer_pay_on_delivery',
      source: 'tt',
      buyer: { name: 'Wanjiku Mwangi', phone: '0712 345 901', email: 'wanjiku@example.test' },
      fulfilment: { kind: 'pickup' },
      lines: [
        { productId: dress!.id, qty: 1, size: 'M' },
        { productId: top!.id, qty: 1 },
      ],
      ...overrides,
    });
    return order;
  }
  async function act(orderId: string, action: Json) {
    const res = await s.call(postAction, { id: orderId, body: action });
    await settle();
    return res;
  }
  /** A buyer-placed (or manual) order taken all the way to delivered. */
  async function delivered(overrides: Partial<NewOrder> = {}) {
    const o = await order(overrides);
    if (o.status !== 'confirmed') expect((await act(o.id, { type: 'accept' })).status).toBe(200);
    expect((await act(o.id, { type: 'markSent', sentMethod: 'pickup' })).status).toBe(200);
    expect((await act(o.id, { type: 'markDelivered', collected: true })).status).toBe(200);
    return o;
  }
  return { ...s, order, delivered, act, dress: dress!, top: top! };
}
type World = Awaited<ReturnType<typeof shopWorld>>;

async function items(orderId: string) {
  return db
    .select({ id: t.orderItems.id, productId: t.orderItems.productId })
    .from(t.orderItems)
    .where(eq(t.orderItems.orderId, orderId))
    .orderBy(t.orderItems.createdAt);
}

async function buyer(
  method: 'GET' | 'POST' | 'PUT',
  token: string,
  payload?: unknown,
  headers: Record<string, string> = { origin: ORIGIN },
) {
  const req = new Request(`${ORIGIN}/api/o/${token}/review`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const ctx = { params: Promise.resolve({ token }) };
  const res =
    method === 'GET' ? await getBuyerReview(req, ctx) : await writeBuyerReview(req, ctx, defer);
  await settle();
  return { status: res.status, json: (await res.json()) as Json };
}

async function upload(token: string, payload: unknown = { contentType: 'image/jpeg', size: 2000 }) {
  const res = await postReviewUpload(
    new Request(`${ORIGIN}/api/o/${token}/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ token }) },
  );
  return { status: res.status, json: (await res.json()) as Json };
}

async function rating(table: 'shops' | 'products', id: string) {
  const tbl = table === 'shops' ? t.shops : t.products;
  const [row] = await db
    .select({ avg: tbl.ratingAvg, n: tbl.ratingCount })
    .from(tbl)
    .where(eq(tbl.id, id));
  return { avg: row!.avg === null ? null : Number(row!.avg), n: row!.n };
}

/** Writes a review for a fresh delivered order: overall stars, the dress rated `dress`. */
async function reviewed(w: World, overall: number, dress: number | null, extra: Json = {}) {
  const o = await w.delivered();
  const [d, top] = await items(o.id);
  const res = await buyer('POST', o.publicToken, {
    rating: overall,
    tags: ['As described'],
    items: [
      { orderItemId: d!.id, rating: dress, text: 'Fits perfectly', photoKey: null, ...extra },
      { orderItemId: top!.id, rating: null, text: null, photoKey: null },
    ],
  });
  expect(res.status).toBe(201);
  return { o, res };
}

const reviewNotes = () =>
  db.select().from(t.notifications).where(eq(t.notifications.type, 'new_review'));

const reviewOf = async (orderId: string) =>
  (await db.select().from(t.reviews).where(eq(t.reviews.orderId, orderId)))[0];

describe('writing a review', () => {
  it('a delivered order gets one review: name from the order, items, notification and push', async () => {
    const w = await shopWorld();
    const o = await w.delivered();
    const form = await buyer('GET', o.publicToken);
    expect(form.status).toBe(200);
    expect(form.json).toMatchObject({
      order: { number: o.number, reviewable: true, manual: false },
      displayName: 'Wanjiku M.',
      review: null,
    });
    expect(form.json.items.map((i: Json) => i.name)).toEqual(['Ankara wrap dress', 'Kitenge top']);

    const [d, top] = await items(o.id);
    const res = await buyer('POST', o.publicToken, {
      rating: 5,
      tags: ['Well packed', 'As described'],
      items: [
        {
          orderItemId: d!.id,
          rating: 4,
          text: 'Lovely! WhatsApp me 0712 345 678 or see www.x.com',
        },
        { orderItemId: top!.id },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.json.review).toMatchObject({ rating: 5, editable: true });
    expect(res.json.review.tags).toEqual(['As described', 'Well packed']);
    // Only touched items are stored; links and phone numbers are gone.
    expect(res.json.review.items).toEqual([
      {
        orderItemId: d!.id,
        rating: 4,
        text: 'Lovely! WhatsApp me or see',
        photoKey: null,
        photoUrl: null,
      },
    ]);
    const review = (await reviewOf(o.id))!;
    expect(review.buyerDisplayName).toBe('Wanjiku M.');
    expect(review.editableUntil.getTime() - review.createdAt.getTime()).toBe(7 * 86_400_000);

    expect(await rating('shops', w.shopId)).toEqual({ avg: 5, n: 1 });
    expect(await rating('products', w.dress.id)).toEqual({ avg: 4, n: 1 });
    expect(await rating('products', w.top.id)).toEqual({ avg: null, n: 0 });

    const [note] = await db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.type, 'new_review'));
    expect(note).toMatchObject({
      shopId: w.shopId,
      orderId: o.id,
      reviewId: review.id,
      title: `★★★★★ from Wanjiku M. · #${o.number}`,
      body: 'Lovely! WhatsApp me or see',
    });
    // No phone on the seller's account in tests: the push finds no devices, but asks for them.
    await db
      .update(t.profiles)
      .set({ expoPushTokens: ['ExponentPushToken[abcdefghij]'] })
      .where(eq(t.profiles.id, w.userId));
    const o2 = await w.delivered();
    expect((await buyer('POST', o2.publicToken, { rating: 3 })).status).toBe(201);
    expect(testPush.sent()).toMatchObject([
      {
        to: 'ExponentPushToken[abcdefghij]',
        title: `★★★☆☆ from Wanjiku M. · #${o2.number}`,
        body: '3 out of 5',
        data: { type: 'new_review', orderId: o2.id },
      },
    ]);
    expect(testPush.sent()[0]!.data.reviewId).toBe((await reviewOf(o2.id))!.id);
  });

  it('refuses orders that are not delivered, and manual orders (decision #73 i)', async () => {
    const w = await shopWorld();
    const open = await w.order();
    let res = await buyer('POST', open.publicToken, { rating: 5 });
    expect(res).toMatchObject({ status: 409, json: { error: { code: 'not_delivered' } } });
    expect((await upload(open.publicToken)).json.error.code).toBe('not_delivered');

    const cancelled = await w.order();
    await w.act(cancelled.id, { type: 'sellerCancel', reason: 'out_of_stock' });
    res = await buyer('POST', cancelled.publicToken, { rating: 5 });
    expect(res.json.error.code).toBe('not_delivered');

    const manual = await w.delivered({ kind: 'manual_paid', source: undefined });
    expect(manual.source).toBe('manual');
    res = await buyer('POST', manual.publicToken, { rating: 5 });
    expect(res).toMatchObject({ status: 409, json: { error: { code: 'review_not_allowed' } } });
    expect((await buyer('GET', manual.publicToken)).json.order).toMatchObject({
      reviewable: false,
      manual: true,
    });
    expect((await upload(manual.publicToken)).status).toBe(409);
    expect(await db.select().from(t.reviews)).toHaveLength(0);
  });

  it('one review per order, also under a race', async () => {
    const w = await shopWorld();
    const o = await w.delivered();
    const results = await Promise.all([
      buyer('POST', o.publicToken, { rating: 5 }),
      buyer('POST', o.publicToken, { rating: 4 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.json.error.code).toBe('already_reviewed');
    expect(await db.select().from(t.reviews)).toHaveLength(1);
    expect(await reviewNotes()).toHaveLength(1);
    expect((await buyer('POST', o.publicToken, { rating: 3 })).status).toBe(409);
  });

  it('edits within 7 days change the averages, send nothing, and lock afterwards', async () => {
    const w = await shopWorld();
    const { o } = await reviewed(w, 5, 5);
    const [d] = await items(o.id);
    const res = await buyer('PUT', o.publicToken, {
      rating: 2,
      items: [{ orderItemId: d!.id, rating: 3, text: 'Colour faded' }],
    });
    expect(res.status).toBe(200);
    expect(res.json.review).toMatchObject({ rating: 2, tags: [] });
    expect(await rating('shops', w.shopId)).toEqual({ avg: 2, n: 1 });
    expect(await rating('products', w.dress.id)).toEqual({ avg: 3, n: 1 });
    expect(await reviewNotes()).toHaveLength(1);

    // Clearing the item's stars takes it out of the product's average.
    await buyer('PUT', o.publicToken, { rating: 2, items: [{ orderItemId: d!.id, text: 'ok' }] });
    expect(await rating('products', w.dress.id)).toEqual({ avg: null, n: 0 });

    await db
      .update(t.reviews)
      .set({ editableUntil: sql`now() - interval '1 minute'` })
      .where(eq(t.reviews.orderId, o.id));
    const locked = await buyer('PUT', o.publicToken, { rating: 5 });
    expect(locked).toMatchObject({ status: 409, json: { error: { code: 'review_locked' } } });
    expect((await buyer('GET', o.publicToken)).json.review.editable).toBe(false);
    expect(await rating('shops', w.shopId)).toEqual({ avg: 2, n: 1 });

    const none = await w.delivered();
    expect((await buyer('PUT', none.publicToken, { rating: 5 })).status).toBe(404);
  });

  it('averages: two reviews of a product, and unrated items never count', async () => {
    const w = await shopWorld();
    await reviewed(w, 4, 4);
    await reviewed(w, 5, 5);
    await reviewed(w, 3, null);
    expect(await rating('products', w.dress.id)).toEqual({ avg: 4.5, n: 2 });
    expect(await rating('shops', w.shopId)).toEqual({ avg: 4, n: 3 });
    expect(await rating('products', w.top.id)).toEqual({ avg: null, n: 0 });
  });

  it('items must be the order’s own; tags and fields are whitelisted; Origin is checked', async () => {
    const w = await shopWorld();
    const o = await w.delivered();
    const other = await w.delivered();
    const [foreign] = await items(other.id);
    let res = await buyer('POST', o.publicToken, {
      rating: 5,
      items: [{ orderItemId: foreign!.id, rating: 5 }],
    });
    expect(res.status).toBe(422);
    const [d] = await items(o.id);
    res = await buyer('POST', o.publicToken, {
      rating: 5,
      items: [
        { orderItemId: d!.id, rating: 5 },
        { orderItemId: d!.id, rating: 1 },
      ],
    });
    expect(res.status).toBe(422);
    res = await buyer('POST', o.publicToken, { rating: 5, buyerDisplayName: 'The seller' });
    expect(res.status).toBe(422);
    res = await buyer('POST', o.publicToken, { rating: 5, tags: ['Best shop ever'] });
    expect(res.status).toBe(422);
    res = await buyer('POST', o.publicToken, { rating: 5 }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await db.select().from(t.reviews)).toHaveLength(0);
  });

  it('a wrong token is 404, and writes are limited per order', async () => {
    const w = await shopWorld();
    expect((await buyer('GET', 'x'.repeat(24))).status).toBe(404);
    const o = await w.delivered();
    for (let i = 0; i < REVIEW_LIMITS.writesPerOrder.max; i++) {
      await hitLimit(db, `review-write:${o.id}`, REVIEW_LIMITS.writesPerOrder);
    }
    expect((await buyer('POST', o.publicToken, { rating: 5 })).status).toBe(429);
  });
});

describe('review photos', () => {
  it('presigns keys under the order’s prefix and checks the bytes on submit', async () => {
    const w = await shopWorld();
    const o = await w.delivered();
    const [d] = await items(o.id);
    const signed = await upload(o.publicToken);
    expect(signed.status).toBe(200);
    expect(signed.json.key).toMatch(new RegExp(`^reviews/${o.id}/[0-9a-f-]{36}\\.jpg$`));
    expect((await upload(o.publicToken, { contentType: 'image/gif', size: 10 })).status).toBe(422);

    // Another order's photo can't be attached.
    const other = await w.delivered();
    const stolen = await storeJpeg(`reviews/${other.id}/${randomUUID()}.jpg`);
    let res = await buyer('POST', o.publicToken, {
      rating: 5,
      items: [{ orderItemId: d!.id, photoKey: stolen }],
    });
    expect(res.status).toBe(403);
    res = await buyer('POST', o.publicToken, {
      rating: 5,
      items: [{ orderItemId: d!.id, photoKey: `products/${w.shopId}/a.jpg` }],
    });
    expect(res.status).toBe(403);

    // A photo that still has its location is refused and deleted.
    const gps = await storeJpeg(`reviews/${o.id}/${randomUUID()}.jpg`, { gps: true });
    res = await buyer('POST', o.publicToken, {
      rating: 5,
      items: [{ orderItemId: d!.id, photoKey: gps }],
    });
    expect(res).toMatchObject({ status: 422, json: { error: { code: 'PHOTO_HAS_LOCATION' } } });
    expect(await getStorage().read(gps)).toBeNull();
    // Not uploaded at all.
    res = await buyer('POST', o.publicToken, {
      rating: 5,
      items: [{ orderItemId: d!.id, photoKey: `reviews/${o.id}/${randomUUID()}.jpg` }],
    });
    expect(res.json.error.code).toBe('UPLOAD_MISSING');

    const first = await storeJpeg(signed.json.key);
    res = await buyer('POST', o.publicToken, {
      rating: 5,
      items: [{ orderItemId: d!.id, photoKey: first }],
    });
    expect(res.status).toBe(201);
    expect(res.json.review.items[0].photoUrl).toContain(first);

    // Replacing it on edit deletes the old one.
    const second = await storeJpeg(`reviews/${o.id}/${randomUUID()}.jpg`);
    res = await buyer('PUT', o.publicToken, {
      rating: 5,
      items: [{ orderItemId: d!.id, photoKey: second }],
    });
    expect(res.status).toBe(200);
    expect(await getStorage().read(first)).toBeNull();
    expect(await getStorage().read(second)).not.toBeNull();
    expect(await db.select().from(t.storageDeletions)).toHaveLength(0);
  });
});

describe('the seller’s reviews', () => {
  async function seller(s: Seller, handler: Parameters<Seller['call']>[0], opts: Json = {}) {
    return s.call(handler, opts);
  }

  it('lists with the summary, tab counts and pages; replies; only their own shop', async () => {
    const w = await shopWorld();
    await reviewed(w, 5, 5);
    await reviewed(w, 2, 2);
    const { o } = await reviewed(w, 3, null);

    let res = await seller(w, listReviews);
    expect(res.status).toBe(200);
    expect(res.json.summary).toEqual({
      average: 3.33,
      count: 3,
      histogram: [
        { stars: 5, count: 1 },
        { stars: 4, count: 0 },
        { stars: 3, count: 1 },
        { stars: 2, count: 1 },
        { stars: 1, count: 0 },
      ],
    });
    expect(res.json.counts).toEqual({ all: 3, needs_reply: 3, low: 2 });
    expect(res.json.reviews[0]).toMatchObject({
      orderNumber: o.number,
      buyerDisplayName: 'Wanjiku M.',
      rating: 3,
      sellerReply: null,
      photosHidden: false,
    });
    expect(res.json.reviews[0].items).toMatchObject([
      { productName: 'Ankara wrap dress', text: 'Fits perfectly' },
    ]);
    const id = res.json.reviews[0].id as string;

    res = await seller(w, putReviewReply, {
      id,
      method: 'PUT',
      body: { reply: 'Thank you! Call 0712345678' },
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ sellerReply: 'Thank you! Call' });
    res = await seller(w, listReviews, { query: '?tab=needs_reply' });
    expect(res.json.reviews).toHaveLength(2);
    expect(res.json.counts.needs_reply).toBe(2);
    res = await seller(w, listReviews, { query: '?tab=low' });
    expect(res.json.reviews.map((r: Json) => r.rating).sort()).toEqual([2, 3]);
    res = await seller(w, putReviewReply, { id, method: 'PUT', body: { reply: '' } });
    expect(res.json).toMatchObject({ sellerReply: null, repliedAt: null });

    // Pages of 20.
    for (let i = 0; i < 19; i++) await reviewed(w, 4, null);
    res = await seller(w, listReviews);
    expect(res.json.reviews).toHaveLength(20);
    const next = await seller(w, listReviews, { query: `?cursor=${res.json.next}` });
    expect(next.json.reviews).toHaveLength(2);
    expect(next.json.next).toBeNull();

    // Another seller can't see, reply to or report it; signed out is 401.
    const stranger = await newSeller();
    expect((await seller(stranger, getReview, { id })).status).toBe(404);
    expect(
      (await seller(stranger, putReviewReply, { id, method: 'PUT', body: { reply: 'x' } })).status,
    ).toBe(404);
    expect((await seller(stranger, postReviewReport, { id, body: {} })).status).toBe(404);
    expect((await seller(stranger, listReviews)).json.reviews).toEqual([]);
    expect(await anonCall(listReviews)).toBe(401);
    expect(await anonCall(getReview, { id })).toBe(401);
    // Many writes and reads in one test: over the 5 s default when the machine is busy.
  }, 20_000);

  it('reporting hides the photos publicly at once; stars, text and averages stay', async () => {
    const w = await shopWorld();
    const o = await w.delivered();
    const [d] = await items(o.id);
    const key = await storeJpeg(`reviews/${o.id}/${randomUUID()}.jpg`);
    await buyer('POST', o.publicToken, {
      rating: 1,
      items: [{ orderItemId: d!.id, rating: 1, text: 'Rude', photoKey: key }],
    });
    let pub = await productReviews(db, w.shopId, w.dress.id);
    expect(pub.reviews[0]!.photoUrl).toContain(key);
    const id = (await reviewOf(o.id))!.id;

    const res = await seller(w, postReviewReport, { id, body: { reason: 'Not our product' } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ photosHidden: true });
    expect(res.json.items[0].photoUrl).toContain(key); // the seller still sees it
    pub = await productReviews(db, w.shopId, w.dress.id);
    expect(pub.reviews[0]).toMatchObject({ rating: 1, text: 'Rude', photoUrl: null });
    expect(await rating('shops', w.shopId)).toEqual({ avg: 1, n: 1 });
    const first = (await reviewOf(o.id))!;
    expect(first.reportReason).toBe('Not our product');

    // Reporting again changes nothing (and doesn't count against the limit).
    await seller(w, postReviewReport, { id, body: { reason: 'again' } });
    const again = (await reviewOf(o.id))!;
    expect(again.reportedAt).toEqual(first.reportedAt);
    expect(again.reportReason).toBe('Not our product');

    // At most 10 reports a day per shop.
    const o2 = await w.delivered();
    await buyer('POST', o2.publicToken, { rating: 2 });
    for (let i = 0; i < REVIEW_LIMITS.reportsPerShop.max; i++) {
      await hitLimit(db, `review-report:${w.shopId}`, REVIEW_LIMITS.reportsPerShop);
    }
    const limited = await seller(w, postReviewReport, {
      id: (await reviewOf(o2.id))!.id,
      body: {},
    });
    expect(limited.status).toBe(429);
  });

  it('public product reviews carry no buyer contact or order number', async () => {
    const w = await shopWorld();
    await reviewed(w, 5, 4);
    const { reviews } = await productReviews(db, w.shopId, w.dress.id);
    expect(Object.keys(reviews[0]!).sort()).toEqual(
      [
        'buyerDisplayName',
        'createdAt',
        'id',
        'itemRating',
        'photoUrl',
        'rating',
        'sellerReply',
        'tags',
        'text',
      ].sort(),
    );
    expect(JSON.stringify(reviews)).not.toMatch(/0712|wanjiku@|Mwangi/);
    // Another shop's id finds nothing.
    const other = await newSeller();
    expect((await productReviews(db, other.shopId, w.dress.id)).reviews).toEqual([]);
  });
});

describe('the app’s entry points (CP3)', () => {
  it('notifications carry the review id; /api/me carries the shop’s rating', async () => {
    const w = await shopWorld();
    const { o } = await reviewed(w, 4, 4);
    const res = await w.call(listNotifications);
    const note = res.json.notifications.find((n: Json) => n.type === 'new_review');
    expect(note).toMatchObject({ orderId: o.id, reviewId: (await reviewOf(o.id))!.id });
    const me = await w.call(getMe as unknown as Parameters<Seller['call']>[0]);
    expect(me.json.shop).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
  });
});

describe('removing a review (ops, decision #73 c)', () => {
  const SECRET = 'o'.repeat(40);
  const opsRequest = (auth?: string, payload: unknown = {}) =>
    new Request(`${ORIGIN}/api/ops/reviews/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(payload),
    });

  it('is 404 without the right secret', async () => {
    // Tests run without OPS_SECRET: even a "right" header is a 404 through the handler.
    expect((await postRemoveReview(opsRequest(`Bearer ${SECRET}`))).status).toBe(404);
    expect(() => requireOps(opsRequest(), SECRET)).toThrow();
    expect(() => requireOps(opsRequest('Bearer nope'), SECRET)).toThrow();
    expect(() => requireOps(opsRequest(`Bearer ${SECRET}`), undefined)).toThrow();
    expect(requireOps(opsRequest(`Bearer ${SECRET}`), SECRET)).toEqual({ ops: true });
  });

  it('writes the audit row, deletes the review, recomputes averages and deletes photos', async () => {
    const w = await shopWorld();
    await reviewed(w, 5, 5);
    const o = await w.delivered();
    const [d] = await items(o.id);
    const key = await storeJpeg(`reviews/${o.id}/${randomUUID()}.jpg`);
    await buyer('POST', o.publicToken, {
      rating: 1,
      items: [{ orderItemId: d!.id, rating: 1, text: 'Abuse', photoKey: key }],
    });
    expect(await rating('shops', w.shopId)).toEqual({ avg: 3, n: 2 });
    const review = (await reviewOf(o.id))!;

    const ctx = requireOps(opsRequest(`Bearer ${SECRET}`), SECRET);
    const snapshot = await removeReview(db, ctx, {
      reviewId: review.id,
      reason: 'Abusive text',
      actor: 'dennismugu7',
    });
    expect(snapshot).toMatchObject({ orderNumber: o.number, rating: 1, photos: 1 });
    expect(await reviewOf(o.id)).toBeUndefined();
    expect(
      await db.select().from(t.reviewItems).where(eq(t.reviewItems.reviewId, review.id)),
    ).toEqual([]);
    expect(
      await db.select().from(t.notifications).where(eq(t.notifications.reviewId, review.id)),
    ).toEqual([]);
    expect(await rating('shops', w.shopId)).toEqual({ avg: 5, n: 1 });
    expect(await rating('products', w.dress.id)).toEqual({ avg: 5, n: 1 });
    expect(await getStorage().read(key)).toBeNull();
    const [event] = await db.select().from(t.opsEvents);
    expect(event).toMatchObject({
      action: 'review_removed',
      shopId: w.shopId,
      targetId: review.id,
      reason: 'Abusive text',
      actor: 'dennismugu7',
      details: { orderNumber: o.number, rating: 1, buyerDisplayName: 'Wanjiku M.' },
    });

    // Removed twice: 404, nothing else written. The order can be reviewed again.
    await expect(
      removeReview(db, ctx, { reviewId: review.id, reason: 'again', actor: 'dennismugu7' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(t.opsEvents)).toHaveLength(1);

    // By the shop's link name and the order number.
    const { o: o2 } = await reviewed(w, 2, 2);
    await removeReview(db, ctx, {
      shopSlug: w.slug,
      orderNumber: o2.number,
      reason: 'Spam',
      actor: 'dennismugu7',
    });
    expect(await reviewOf(o2.id)).toBeUndefined();
    // Order numbers are per shop: the other shop's #1001 is untouched by w's removal.
    const other = await shopWorld();
    const { o: o3 } = await reviewed(other, 4, 4);
    await removeReview(db, ctx, {
      shopSlug: w.slug,
      orderNumber: o3.number,
      reason: 'x',
      actor: 'y',
    });
    expect(await reviewOf(o3.id)).toBeDefined();
    await expect(
      removeReview(db, ctx, { shopSlug: w.slug, orderNumber: 9999, reason: 'x', actor: 'y' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
