import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { nairobiDay } from '@oda/shared';
import { signUpVerified } from '@/test/auth';
import { storedPhoto } from '@/test/storage';
import { createCategory, createProduct, deleteProduct, updateCategory } from './catalogueRoutes';
import { getDb } from './db';
import { postAnswer, postShop } from './onboardingRoutes';
import { publicRepo } from './repos/public';
import { restOf, takingOrders } from './storefront';
import { postCartLookup, postVisit } from './storefrontRoutes';

// The buyer storefront's data (M4 CP1, decision #59): only listed products of visible shops,
// filters/sorts/badges, the cart lookup and once-a-day visit counting.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

const db = () => getDb();

beforeEach(async () => {
  await truncateAll(db());
});
afterAll(async () => {
  await truncateAll(db());
});

async function newSeller(slug = `shop-${randomUUID().slice(0, 6)}`) {
  const { token } = await signUpVerified('', `s-${randomUUID().slice(0, 8)}@example.test`);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  async function call(handler: Handler, body?: unknown, id = '', method = 'POST') {
    const res = await handler(
      new Request('http://localhost:3000/api/x', {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : null) as Json };
  }
  const onboarding = (h: (r: Request) => Promise<Response>) => h as unknown as Handler;
  await call(onboarding(postAnswer), { step: 1, businessType: 'fashion' });
  await call(onboarding(postAnswer), { step: 2, skip: true });
  const shop = await call(onboarding(postShop), {
    name: 'Demo Duka',
    slug,
    whatsappPhone: '0712345678',
  });
  const shopId = shop.json.shop.id as string;
  let n = 0;
  async function product(fields: Json = {}) {
    const res = await call(createProduct, {
      name: 'Product',
      price: 1000,
      ...fields,
      photos: [await storedPhoto(shopId, ++n)],
    });
    expect(res.status).toBe(201);
    return res.json;
  }
  return { call, shopId, slug, product };
}

async function shopRepo(slug: string) {
  const found = await publicRepo(db()).findShop(slug);
  if (found.kind !== 'shop') throw new Error('expected a shop');
  return { shop: found.shop, repo: publicRepo(db()).shop(found.shop) };
}

const visit = (slug: string, s?: string, cookie?: string) =>
  postVisit(
    new Request(`http://localhost:3000/api/shops/${slug}/visit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ s }),
    }),
    { params: Promise.resolve({ slug }) },
  );

async function visits(shopId: string) {
  return db()
    .select({ source: schema.shopVisitsDaily.source, visits: schema.shopVisitsDaily.visits })
    .from(schema.shopVisitsDaily)
    .where(
      and(
        eq(schema.shopVisitsDaily.shopId, shopId),
        eq(schema.shopVisitsDaily.day, nairobiDay(new Date())),
      ),
    );
}

describe('catalog (shop home and search)', () => {
  it('lists only listed products, with filters, sorts, cover and one badge each', async () => {
    const s = await newSeller();
    const dresses = (await s.call(createCategory, { name: 'Dresses' })).json;
    const kitenge = await s.product({
      name: 'Kitenge dress',
      price: 2500,
      categoryId: dresses.id,
      sizes: ['M', 'L'],
      description: 'Cotton, 50% off today',
    });
    const bag = await s.product({ name: 'Kiondo bag', price: 1800 });
    await s.product({ name: 'Secret', price: 100, status: 'hidden' });
    const gone = await s.product({ name: 'Gone', price: 100 });
    await s.call(deleteProduct, undefined, gone.id, 'DELETE');
    await db()
      .update(schema.products)
      .set({ unitsSold: 7, createdAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(schema.products.id, bag.id));

    const { repo } = await shopRepo(s.slug);
    const all = await repo.catalog();
    expect(all.map((p) => p.name).sort()).toEqual(['Kiondo bag', 'Kitenge dress']);
    const byId = Object.fromEntries(all.map((p) => [p.id, p]));
    expect(byId[bag.id]).toMatchObject({ badge: 'bestseller', hasOptions: false });
    expect(byId[kitenge.id]).toMatchObject({ badge: 'new', hasOptions: true });
    expect(byId[kitenge.id]!.coverUrl).toContain(`products/${s.shopId}/`);

    const names = async (q: Json) => (await repo.catalog(q)).map((p) => p.name);
    expect(await names({ c: dresses.id })).toEqual(['Kitenge dress']);
    expect(await names({ q: 'KIONDO' })).toEqual(['Kiondo bag']);
    expect(await names({ q: 'cotton' })).toEqual(['Kitenge dress']); // description
    expect(await names({ q: '50%' })).toEqual(['Kitenge dress']); // % is literal
    expect(await names({ q: '%' })).toEqual(['Kitenge dress']);
    expect(await names({ size: 'L' })).toEqual(['Kitenge dress']);
    expect(await names({ max: 2000 })).toEqual(['Kiondo bag']);
    expect(await names({ sort: 'price_asc' })).toEqual(['Kiondo bag', 'Kitenge dress']);
    expect(await names({ sort: 'price_desc' })).toEqual(['Kitenge dress', 'Kiondo bag']);
    expect(await names({ sort: 'popular' })).toEqual(['Kiondo bag', 'Kitenge dress']);
    expect(await names({ sort: 'newest' })).toEqual(['Kitenge dress', 'Kiondo bag']);
  });

  it("never shows another shop's products; categories only when visible and not empty", async () => {
    const a = await newSeller();
    const b = await newSeller();
    await b.product({ name: 'Not mine' });
    const full = (await a.call(createCategory, { name: 'Dresses' })).json;
    await a.call(createCategory, { name: 'Empty' });
    const hidden = (await a.call(createCategory, { name: 'Hidden' })).json;
    await a.call(updateCategory, { isVisible: false }, hidden.id, 'PATCH');
    const onlyHidden = (await a.call(createCategory, { name: 'Only hidden products' })).json;
    await a.product({ name: 'Dress', categoryId: full.id });
    await a.product({ name: 'In hidden category', categoryId: hidden.id });
    await a.product({ name: 'Hidden one', categoryId: onlyHidden.id, status: 'hidden' });

    const { repo } = await shopRepo(a.slug);
    expect((await repo.categories()).map((c) => c.name)).toEqual(['Dresses']);
    expect((await repo.catalog()).map((p) => p.name)).not.toContain('Not mine');
  });

  it('pay now needs an active account; no till badge, verified or not (decision #72 a)', async () => {
    const s = await newSeller();
    expect((await shopRepo(s.slug)).shop).toMatchObject({ payNowAvailable: false, logoUrl: null });
    await db().insert(schema.paymentAccounts).values({
      shopId: s.shopId,
      type: 'till',
      number: '123456',
      accountName: 'DEMO DUKA',
      isActive: true,
      verificationStatus: 'verified',
    });
    const { shop } = await shopRepo(s.slug);
    expect(shop.payNowAvailable).toBe(true);
    expect(shop).not.toHaveProperty('mpesaChecked');
  });

  it('takes orders with a way to pay; delivery options are optional (decision #110 a)', async () => {
    const s = await newSeller();
    // A new shop: pay before is on but there's no account yet, so no way to pay.
    expect(takingOrders((await shopRepo(s.slug)).shop)).toBe(false);
    await db()
      .update(schema.shops)
      .set({ acceptsPayOnDelivery: true })
      .where(eq(schema.shops.id, s.shopId));
    let shop = (await shopRepo(s.slug)).shop;
    // No area and no pickup: still takes orders (buyer and seller arrange delivery).
    expect(shop.hasDeliveryOption).toBe(false);
    expect(takingOrders(shop)).toBe(true);
    await db()
      .update(schema.shops)
      .set({ pickupEnabled: true })
      .where(eq(schema.shops.id, s.shopId));
    shop = (await shopRepo(s.slug)).shop;
    expect(shop.hasDeliveryOption).toBe(true);
    expect(takingOrders(shop)).toBe(true);
    await db()
      .update(schema.shops)
      .set({ pickupEnabled: false })
      .where(eq(schema.shops.id, s.shopId));
    const [area] = await db()
      .insert(schema.deliveryAreas)
      .values({ shopId: s.shopId, name: 'CBD', fee: 200, method: 'rider' })
      .returning();
    expect((await shopRepo(s.slug)).shop.hasDeliveryOption).toBe(true);
    await db()
      .update(schema.deliveryAreas)
      .set({ deletedAt: new Date() })
      .where(eq(schema.deliveryAreas.id, area!.id));
    expect((await shopRepo(s.slug)).shop.hasDeliveryOption).toBe(false);
    await db()
      .update(schema.shops)
      .set({ isPaused: true, pickupEnabled: true })
      .where(eq(schema.shops.id, s.shopId));
    expect(takingOrders((await shopRepo(s.slug)).shop)).toBe(false);
  });
});

describe('cart lookup', () => {
  it('returns the current price and status, leaving out what buyers can’t order', async () => {
    const a = await newSeller();
    const b = await newSeller();
    const dress = await a.product({ name: 'Dress', price: 2500, sizes: ['M'] });
    const sold = await a.product({ name: 'Sold', status: 'sold_out' });
    const hidden = await a.product({ name: 'Hidden', status: 'hidden' });
    const theirs = await b.product({ name: 'Theirs' });
    const lookup = (ids: unknown) =>
      postCartLookup(
        new Request(`http://localhost:3000/api/shops/${a.slug}/cart`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productIds: ids }),
        }),
        { params: Promise.resolve({ slug: a.slug }) },
      );
    const res = await lookup([dress.id, sold.id, hidden.id, theirs.id, randomUUID()]);
    expect(res.status).toBe(200);
    const { products } = (await res.json()) as Json;
    expect(products.map((p: Json) => p.name).sort()).toEqual(['Dress', 'Sold']);
    expect(products.find((p: Json) => p.name === 'Dress')).toMatchObject({
      price: 2500,
      status: 'available',
      sizes: ['M'],
    });
    expect((await lookup(['not-an-id'])).status).toBe(422);
  });
});

describe('visit counting (oda_v)', () => {
  it('counts once per shop per day per browser, by source; unknown tags are direct', async () => {
    const s = await newSeller();
    const first = await visit(s.slug, 'tt');
    expect(first.status).toBe(204);
    const cookie = first.headers.get('set-cookie')!;
    expect(cookie).toMatch(
      /^oda_v=\d{4}-\d{2}-\d{2}\.[0-9a-f]{8}; Path=\/; Max-Age=\d+; SameSite=Lax; HttpOnly/,
    );
    const value = cookie.split(';')[0]!;
    await visit(s.slug, 'tt', value);
    await visit(s.slug, 'wa', value);
    await visit(s.slug, 'wa'); // another browser
    await visit(s.slug, 'evil');
    expect(Object.fromEntries((await visits(s.shopId)).map((v) => [v.source, v.visits]))).toEqual({
      tt: 1,
      wa: 1,
      direct: 1,
    });
  });

  it('old links count for the shop they point to; unknown and suspended shops are 404', async () => {
    const s = await newSeller('old-name');
    await db().update(schema.shops).set({ slug: 'new-name' }).where(eq(schema.shops.id, s.shopId));
    // The slug-history trigger (migration 0002) keeps the old link.
    expect((await visit('old-name', 'wa')).status).toBe(204);
    expect(await visits(s.shopId)).toEqual([{ source: 'wa', visits: 1 }]);
    expect((await visit('no-such-shop')).status).toBe(404);
    await db()
      .update(schema.shops)
      .set({ suspendedAt: new Date() })
      .where(eq(schema.shops.id, s.shopId));
    expect((await visit('new-name')).status).toBe(404);
  });
});

describe('old-link redirects', () => {
  it('keep the rest of the path and the whole query', () => {
    expect(restOf('')).toBe('');
    expect(restOf('', { s: 'wa' })).toBe('?s=wa');
    expect(restOf('/search', { q: 'wrap dress', size: ['M', 'L'], max: undefined })).toBe(
      '/search?q=wrap+dress&size=M&size=L',
    );
  });
});
