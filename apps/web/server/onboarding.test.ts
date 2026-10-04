import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { createShopFixture, truncateAll } from '@oda/db/testing';
import { GET as getMe } from '@/app/api/me/route';
import {
  getOnboarding,
  getSlugCheck,
  postAnswer,
  postChecklist,
  postComplete,
  postPayment,
  postProduct,
  postShop,
} from './onboardingRoutes';
import { getDb } from './db';
import { signUpVerified } from '@/test/auth';
import { storedPhoto } from '@/test/storage';

// Seller onboarding API, steps 1–6 (decision #51), through the route handlers with real
// sessions, against oda_test.

type Handler = (request: Request) => Promise<Response>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const db = () => getDb();

beforeEach(async () => {
  await truncateAll(db());
});
afterAll(async () => {
  await truncateAll(db());
});

async function newSeller(email = `seller-${randomUUID().slice(0, 8)}@example.test`) {
  const { userId, token } = await signUpVerified('', email);
  const auth = { authorization: `Bearer ${token}` };
  async function call(handler: Handler, body?: unknown, query = '') {
    const res = await handler(
      new Request(`http://localhost:3000/api/onboarding${query}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as Json };
  }
  async function me() {
    const res = await getMe(new Request('http://localhost:3000/api/me', { headers: auth }));
    return (await res.json()) as Json;
  }
  return { userId, call, me };
}

type Seller = Awaited<ReturnType<typeof newSeller>>;

/** Keys only (not stored): for requests rejected before the storage check. */
const photo = (shopId: string, n: number) => ({
  objectKey: `products/${shopId}/p${n}.jpg`,
  thumbKey: `products/${shopId}/p${n}_thumb.jpg`,
  width: 1600,
  height: 1200,
});

/** Steps 1–3 done: returns the new shop's id. */
async function throughStep3(s: Seller, slug = `amani-${randomUUID().slice(0, 6)}`) {
  expect((await s.call(postAnswer, { step: 1, businessType: 'fashion' })).status).toBe(200);
  expect((await s.call(postAnswer, { step: 2, channels: ['tiktok', 'whatsapp'] })).status).toBe(
    200,
  );
  const res = await s.call(postShop, { name: 'Amani Styles', slug, whatsappPhone: '0712 345 678' });
  expect(res.status).toBe(200);
  return res.json.shop.id as string;
}

async function throughStep4(s: Seller) {
  const shopId = await throughStep3(s);
  const res = await s.call(postProduct, {
    name: 'Ankara wrap dress',
    price: 2500,
    sizes: ['M', 'L'],
    photos: [await storedPhoto(shopId, 1), await storedPhoto(shopId, 2)],
  });
  expect(res.status).toBe(200);
  return shopId;
}

const TILL = { type: 'till', number: '123456', accountName: 'AMANI STYLES' };

describe('steps 1–2: answers in the draft', () => {
  it('starts at step 1, then moves on with each answer (resumable via /api/me)', async () => {
    const s = await newSeller();
    const start = await s.call(getOnboarding);
    expect(start.json).toMatchObject({ step: 1, done: false, shop: null, sizePresets: [] });

    const one = await s.call(postAnswer, { step: 1, businessType: 'fashion' });
    expect(one.json).toMatchObject({ step: 2, draft: { businessType: 'fashion' } });
    expect(one.json.sizePresets).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size']);
    expect((await s.me()).onboarding).toEqual({ step: 2, done: false });

    const two = await s.call(postAnswer, { step: 2, channels: ['tiktok', 'whatsapp'] });
    expect(two.json).toMatchObject({ step: 3, draft: { channels: ['tiktok', 'whatsapp'] } });
    expect((await s.me()).onboarding).toEqual({ step: 3, done: false });
  });

  it('Skip sets business type "other" (step 1) and no channels (step 2)', async () => {
    const s = await newSeller();
    await s.call(postAnswer, { step: 1, skip: true });
    const res = await s.call(postAnswer, { step: 2, skip: true });
    expect(res.json).toMatchObject({ step: 3, draft: { businessType: 'other', channels: [] } });
  });

  it('going back to step 1 keeps the furthest step', async () => {
    const s = await newSeller();
    await s.call(postAnswer, { step: 1, businessType: 'fashion' });
    await s.call(postAnswer, { step: 2, channels: [] });
    const back = await s.call(postAnswer, { step: 1, businessType: 'shoes_bags' });
    expect(back.json).toMatchObject({
      step: 3,
      draft: { businessType: 'shoes_bags', channels: [] },
    });
  });

  it('rejects unknown values and extra fields, writing nothing', async () => {
    const s = await newSeller();
    for (const bad of [
      { step: 2, channels: ['tt'] },
      { step: 1, businessType: 'cars' },
      { step: 1, businessType: 'fashion', isAdmin: true },
      { step: 1, businessType: 'fashion', onboardingStep: 6 },
    ]) {
      expect((await s.call(postAnswer, bad)).status, JSON.stringify(bad)).toBe(422);
    }
    const profile = await db().query.profiles.findFirst({
      where: eq(schema.profiles.id, s.userId),
    });
    expect(profile).toMatchObject({ onboardingDraft: null, isAdmin: false });
  });
});

describe('step 3: the shop link', () => {
  it('says a free link is free', async () => {
    const s = await newSeller();
    const res = await s.call(getSlugCheck, undefined, '/slug?name=Amani%20Styles');
    expect(res.json).toEqual({
      slug: 'amani-styles',
      available: true,
      message: null,
      suggestions: [],
    });
  });

  it('offers free alternatives when another shop has it now or had it before', async () => {
    const other = await createShopFixture(db(), { slug: 'amani-styles' });
    const s = await newSeller();
    const taken = await s.call(getSlugCheck, undefined, '/slug?slug=amani-styles');
    expect(taken.json).toMatchObject({ available: false, message: 'That link is taken.' });
    expect(taken.json.suggestions).toEqual([
      'amani-styles-ke',
      'amani-styles-shop',
      'amani-styles-2',
    ]);

    // The other shop renames: its old link stays taken forever (decision #34 e).
    await db()
      .update(schema.shops)
      .set({ slug: 'amani-new' })
      .where(eq(schema.shops.id, other.shopId));
    const old = await s.call(getSlugCheck, undefined, '/slug?slug=amani-styles');
    expect(old.json.available).toBe(false);
  });

  it('explains invalid or reserved links', async () => {
    const s = await newSeller();
    const reserved = await s.call(getSlugCheck, undefined, '/slug?slug=admin');
    expect(reserved.json).toMatchObject({ available: false });
    expect(reserved.json.message).toBeTruthy();
    expect((await s.call(getSlugCheck, undefined, '/slug?slug=')).status).toBe(422);
  });

  it("a seller's own link counts as free (going back to step 3)", async () => {
    const s = await newSeller();
    await throughStep3(s, 'amani-styles');
    const mine = await s.call(getSlugCheck, undefined, '/slug?slug=amani-styles');
    expect(mine.json.available).toBe(true);
  });

  it('limits link checks to 60 a minute per seller', async () => {
    const s = await newSeller();
    await db().execute(sql`
      insert into rate_limits (key, window_start, count)
      values (${'slug-check:' + s.userId}, to_timestamp(floor(extract(epoch from now()) / 60) * 60), 60)`);
    expect((await s.call(getSlugCheck, undefined, '/slug?slug=amani')).status).toBe(429);
  });

  it('creates the shop with the step 1–2 answers and moves to step 4', async () => {
    const s = await newSeller();
    await throughStep3(s, 'amani-styles');
    const state = await s.call(getOnboarding);
    expect(state.json).toMatchObject({
      step: 4,
      shop: {
        name: 'Amani Styles',
        slug: 'amani-styles',
        url: 'http://localhost:3000/amani-styles',
        whatsappPhone: '+254712345678',
        businessType: 'fashion',
        channels: ['tiktok', 'whatsapp'],
      },
    });
    expect((await s.me()).onboarding).toEqual({ step: 4, done: false });
  });

  it("refuses another shop's link (409) and updates instead of duplicating on a redo", async () => {
    await createShopFixture(db(), { slug: 'taken-link' });
    const s = await newSeller();
    const clash = await s.call(postShop, {
      name: 'Amani',
      slug: 'taken-link',
      whatsappPhone: '0712345678',
    });
    expect(clash.status).toBe(409);
    expect(clash.json.error.message).toBe('That link is taken. Try another one.');

    await throughStep3(s, 'amani-styles');
    const redo = await s.call(postShop, {
      name: 'Amani Styles KE',
      slug: 'amani-ke',
      whatsappPhone: '0712000111',
    });
    expect(redo.json.shop).toMatchObject({
      name: 'Amani Styles KE',
      slug: 'amani-ke',
      whatsappPhone: '+254712000111',
    });
    const shops = await db().select().from(schema.shops).where(eq(schema.shops.ownerId, s.userId));
    expect(shops).toHaveLength(1);
  });

  it('answers for steps 1–2 are closed once the shop exists', async () => {
    const s = await newSeller();
    await throughStep3(s);
    expect((await s.call(postAnswer, { step: 1, businessType: 'other' })).status).toBe(409);
  });
});

describe('step 4: the first product', () => {
  it('saves the product with its photos in order and moves to step 5', async () => {
    const s = await newSeller();
    const shopId = await throughStep4(s);
    const state = await s.call(getOnboarding);
    expect(state.json.step).toBe(5);
    expect(state.json.product).toMatchObject({
      name: 'Ankara wrap dress',
      price: 2500,
      sizes: ['M', 'L'],
    });
    expect(state.json.product.photos.map((p: Json) => p.objectKey)).toEqual([
      `products/${shopId}/p1.jpg`,
      `products/${shopId}/p2.jpg`,
    ]);
  });

  it('a redo replaces the product and its photos (still one product)', async () => {
    const s = await newSeller();
    const shopId = await throughStep4(s);
    await s.call(postProduct, {
      name: 'Kitenge top',
      price: 1200,
      photos: [await storedPhoto(shopId, 9)],
    });
    const products = await db()
      .select()
      .from(schema.products)
      .where(eq(schema.products.shopId, shopId));
    expect(products).toHaveLength(1);
    const state = await s.call(getOnboarding);
    expect(state.json.product).toMatchObject({ name: 'Kitenge top', price: 1200, sizes: [] });
    expect(state.json.product.photos).toHaveLength(1);
  });

  it("needs a photo, and only accepts photos stored under the seller's own shop", async () => {
    const s = await newSeller();
    await throughStep3(s);
    const other = await createShopFixture(db());
    expect((await s.call(postProduct, { name: 'Dress', price: 100, photos: [] })).status).toBe(422);
    const foreign = await s.call(postProduct, {
      name: 'Dress',
      price: 100,
      photos: [photo(other.shopId, 1)],
    });
    expect(foreign.status).toBe(403);
  });

  it('needs a shop first', async () => {
    const s = await newSeller();
    expect(
      (await s.call(postProduct, { name: 'Dress', price: 100, photos: [photo(randomUUID(), 1)] }))
        .status,
    ).toBe(404);
  });
});

describe('step 5: where buyers pay', () => {
  it('saves the account as pending and active, and moves to step 6', async () => {
    const s = await newSeller();
    await throughStep4(s);
    const res = await s.call(postPayment, TILL);
    expect(res.json.step).toBe(6);
    expect(res.json.payment).toMatchObject({
      account: {
        type: 'till',
        number: '123456',
        accountName: 'AMANI STYLES',
        verificationStatus: 'pending',
      },
      acceptsPayBefore: true,
      acceptsPayOnDelivery: false,
    });
  });

  it('a redo replaces the account details (still one account)', async () => {
    const s = await newSeller();
    const shopId = await throughStep4(s);
    await s.call(postPayment, TILL);
    await s.call(postPayment, { type: 'pochi', number: '0712345678', accountName: 'AMANI W' });
    const accounts = await db()
      .select()
      .from(schema.paymentAccounts)
      .where(eq(schema.paymentAccounts.shopId, shopId));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ type: 'pochi', number: '+254712345678', isActive: true });
  });

  it('Skip turns on pay on delivery (spec §5.2) and leaves no account', async () => {
    const s = await newSeller();
    await throughStep4(s);
    const res = await s.call(postPayment, { skip: true });
    expect(res.json).toMatchObject({
      step: 6,
      payment: { account: null, acceptsPayOnDelivery: true },
    });
  });

  it('comes after the product, and never takes server-owned fields', async () => {
    const s = await newSeller();
    await throughStep3(s);
    expect((await s.call(postPayment, TILL)).status).toBe(409);
    await s.call(postProduct, {
      name: 'Dress',
      price: 100,
      photos: [await storedPhoto((await s.call(getOnboarding)).json.shop.id, 1)],
    });
    for (const extra of [
      { verificationStatus: 'verified' },
      { isActive: false },
      { shopId: randomUUID() },
    ]) {
      expect((await s.call(postPayment, { ...TILL, ...extra })).status, JSON.stringify(extra)).toBe(
        422,
      );
    }
    expect((await s.call(getOnboarding)).json.payment.account).toBeNull();
  });
});

describe('step 6: shop is live', () => {
  it('ticks checklist items and completes onboarding', async () => {
    const s = await newSeller();
    await throughStep4(s);
    await s.call(postPayment, TILL);
    const before = await s.call(getOnboarding);
    expect(before.json.checklist).toMatchObject({ done: 1, total: 7 });
    expect(before.json.checklist.items[0]).toMatchObject({ id: 'basics', done: true });

    const ticked = await s.call(postChecklist, { item: 'tested_whatsapp' });
    expect(ticked.json.checklist.done).toBe(2);
    expect((await s.call(postChecklist, { item: 'logo' })).status).toBe(422);

    const done = await s.call(postComplete, {});
    expect(done.json).toMatchObject({ step: null, done: true });
    expect((await s.me()).onboarding).toEqual({ step: null, done: true });
    expect((await s.call(postComplete, {})).status).toBe(200); // idempotent
  });

  it('"basics" stays open when payment was skipped', async () => {
    const s = await newSeller();
    await throughStep4(s);
    const res = await s.call(postPayment, { skip: true });
    expect(res.json.checklist.items[0]).toMatchObject({ id: 'basics', done: false });
  });

  it('cannot complete before step 6, and onboarding writes stop once complete', async () => {
    const s = await newSeller();
    const shopId = await throughStep4(s);
    expect((await s.call(postComplete, {})).status).toBe(409);
    await s.call(postPayment, TILL);
    await s.call(postComplete, {});
    expect(
      (await s.call(postProduct, { name: 'X', price: 1, photos: [photo(shopId, 1)] })).status,
    ).toBe(409);
    expect((await s.call(postPayment, { skip: true })).status).toBe(409);
    expect(
      (
        await s.call(postShop, {
          name: 'New name',
          slug: 'new-name-x',
          whatsappPhone: '0712345678',
        })
      ).status,
    ).toBe(409);
  });
});

describe('authorization', () => {
  it('everything is 401 without a session', async () => {
    const anon = async (handler: Handler, body?: unknown) =>
      (
        await handler(
          new Request('http://localhost:3000/api/onboarding', {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        )
      ).status;
    expect(await anon(getOnboarding)).toBe(401);
    expect(await anon(getSlugCheck)).toBe(401);
    for (const h of [postAnswer, postShop, postProduct, postPayment, postChecklist, postComplete]) {
      expect(await anon(h, {})).toBe(401);
    }
  });

  it('a user without a shop gets 404 on the shop steps', async () => {
    const s = await newSeller();
    expect((await s.call(postPayment, { skip: true })).status).toBe(404);
    expect((await s.call(postChecklist, { item: 'shared_link' })).status).toBe(404);
    expect((await s.call(postComplete, {})).status).toBe(404);
  });

  it('each seller only ever changes their own shop', async () => {
    const a = await newSeller();
    const b = await newSeller();
    const shopA = await throughStep4(a);
    const shopB = await throughStep4(b);
    await a.call(postPayment, TILL);
    await b.call(postPayment, { skip: true });

    const stateB = (await b.call(getOnboarding)).json;
    expect(stateB.shop.id).toBe(shopB);
    expect(stateB.payment.account).toBeNull();
    const accountsB = await db()
      .select()
      .from(schema.paymentAccounts)
      .where(eq(schema.paymentAccounts.shopId, shopB));
    expect(accountsB).toHaveLength(0);
    // A can't attach B's stored photos to A's product.
    expect(
      (await a.call(postProduct, { name: 'X', price: 1, photos: [photo(shopB, 1)] })).status,
    ).toBe(403);
    expect((await a.call(getOnboarding)).json.shop.id).toBe(shopA);
  });
});
