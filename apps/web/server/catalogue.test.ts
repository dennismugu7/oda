import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { signUpVerified } from '@/test/auth';
import { png, storedPhoto, storeJpeg } from '@/test/storage';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getProduct,
  listCategories,
  listProducts,
  reorderCategories,
  restoreProduct,
  setCategoryProducts,
  setProductPhotos,
  updateCategory,
  updateProduct,
} from './catalogueRoutes';
import { getDb } from './db';
import { postAnswer, postShop } from './onboardingRoutes';
import { localObjectExists, writeLocalObject } from './storage';

// The seller's catalogue API (M3): products, photos, undo, categories; every route through
// its handler with a real session against oda_test, and each seller only ever reaching
// their own shop.

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const db = () => getDb();

beforeEach(async () => {
  await truncateAll(db());
});
afterAll(async () => {
  await truncateAll(db());
});

async function newUser() {
  const { token } = await signUpVerified('', `s-${randomUUID().slice(0, 8)}@example.test`);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  async function call(
    handler: Handler,
    opts: { method?: string; body?: unknown; id?: string; query?: string } = {},
  ) {
    const res = await handler(
      new Request(`http://localhost:3000/api/x${opts.query ?? ''}`, {
        method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      }),
      { params: Promise.resolve({ id: opts.id ?? '' }) },
    );
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : null) as Json };
  }
  return { call };
}

/** A seller with a shop (onboarding steps 1–3 through the API). */
async function newSeller() {
  const user = await newUser();
  const onboarding = (h: (r: Request) => Promise<Response>) => h as unknown as Handler;
  await user.call(onboarding(postAnswer), { body: { step: 1, businessType: 'fashion' } });
  await user.call(onboarding(postAnswer), { body: { step: 2, skip: true } });
  const shop = await user.call(onboarding(postShop), {
    body: {
      name: 'Amani Styles',
      slug: `amani-${randomUUID().slice(0, 6)}`,
      whatsappPhone: '0712345678',
    },
  });
  expect(shop.status).toBe(200);
  return { ...user, shopId: shop.json.shop.id as string };
}

type Seller = Awaited<ReturnType<typeof newSeller>>;

async function addProduct(s: Seller, fields: Json = {}, photos = 1) {
  const list = [];
  for (let n = 1; n <= photos; n++) list.push(await storedPhoto(s.shopId, n + Math.random()));
  const res = await s.call(createProduct, {
    body: { name: 'Ankara wrap dress', price: 2500, ...fields, photos: list },
  });
  expect(res.status).toBe(201);
  return res.json;
}

describe('products', () => {
  it('creates a product with its photos in order (the first is the cover)', async () => {
    const s = await newSeller();
    const p1 = await storedPhoto(s.shopId, 1);
    const p2 = await storedPhoto(s.shopId, 2);
    const res = await s.call(createProduct, {
      body: {
        name: 'Ankara wrap dress',
        price: 2500,
        compareAtPrice: 3000,
        sizes: ['M', 'L'],
        colours: [{ name: 'Maroon', hex: '#800020' }, { name: 'Sunset print' }],
        photos: [p2, p1],
      },
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ name: 'Ankara wrap dress', price: 2500, status: 'available' });
    expect(res.json.photos.map((p: Json) => [p.position, p.objectKey])).toEqual([
      [0, p2.objectKey],
      [1, p1.objectKey],
    ]);
    expect(res.json.photos[0].thumbUrl).toContain(p2.thumbKey);

    const list = await s.call(listProducts);
    expect(list.json.counts).toEqual({ all: 1, available: 1, sold_out: 0, hidden: 0 });
    expect(list.json.products[0]).toMatchObject({ id: res.json.id, compareAtPrice: 3000 });
    expect(list.json.products[0].coverUrl).toContain(p2.thumbKey);
  });

  it('refuses bad input and writes nothing', async () => {
    const s = await newSeller();
    const photo = await storedPhoto(s.shopId, 1);
    const bad: [Json, number][] = [
      [{ name: 'X', price: 100, photos: [] }, 422],
      [{ name: 'X', price: 100 }, 422],
      [{ name: 'X', price: 100, compareAtPrice: 100, photos: [photo] }, 422],
      [{ name: 'X', price: 100, unitsSold: 50, photos: [photo] }, 422],
      [{ name: 'X', price: 100, shopId: randomUUID(), photos: [photo] }, 422],
      [{ name: 'X', price: 100, deletedAt: null, photos: [photo] }, 422],
      [{ name: 'X', price: 100, categoryId: randomUUID(), photos: [photo] }, 404],
      [{ name: '', price: 100, photos: [photo] }, 422],
      [{ name: 'X', price: 0, photos: [photo] }, 422],
    ];
    for (const [body, status] of bad) {
      expect((await s.call(createProduct, { body })).status, JSON.stringify(body)).toBe(status);
    }
    expect((await s.call(listProducts)).json.counts.all).toBe(0);
  });

  it('edits any field, e.g. just the status, and keeps was-price above the price', async () => {
    const s = await newSeller();
    const p = await addProduct(s, { price: 2500, compareAtPrice: 3000 });
    const sold = await s.call(updateProduct, {
      method: 'PATCH',
      id: p.id,
      body: { status: 'sold_out' },
    });
    expect(sold.status).toBe(200);
    expect(sold.json.status).toBe('sold_out');
    // A new price at or above the stored was-price is refused by the database check.
    expect(
      (await s.call(updateProduct, { method: 'PATCH', id: p.id, body: { price: 3500 } })).status,
    ).toBe(422);
    expect(
      (await s.call(updateProduct, { method: 'PATCH', id: p.id, body: { ratingAvg: 5 } })).status,
    ).toBe(422);
    expect((await s.call(getProduct, { id: p.id })).json.price).toBe(2500);
  });

  it('filters by status and category', async () => {
    const s = await newSeller();
    const cat = (await s.call(createCategory, { body: { name: 'Dresses' } })).json;
    const a = await addProduct(s, { categoryId: cat.id });
    await addProduct(s, { status: 'hidden' });
    const ids = async (query: string) =>
      (await s.call(listProducts, { query })).json.products.map((p: Json) => p.id);
    expect(await ids(`?category=${cat.id}`)).toEqual([a.id]);
    expect((await ids('?category=none')).length).toBe(1);
    expect((await ids('?status=hidden')).length).toBe(1);
    expect((await s.call(listProducts, { query: '?status=lost' })).status).toBe(422);
    expect((await s.call(listProducts)).json.counts).toEqual({
      all: 2,
      available: 1,
      sold_out: 0,
      hidden: 1,
    });
  });
});

describe('product photos', () => {
  it('reorders, changes the cover and removes photos; removed files are deleted', async () => {
    const s = await newSeller();
    const p = await addProduct(s, {}, 3);
    const [a, b, c] = p.photos as Json[];
    const fresh = await storedPhoto(s.shopId, 9);
    const keep = (x: Json) => ({
      objectKey: x.objectKey,
      thumbKey: x.thumbKey,
      width: x.width,
      height: x.height,
    });
    const res = await s.call(setProductPhotos, {
      method: 'PUT',
      id: p.id,
      body: { photos: [keep(c!), fresh, keep(a!)] },
    });
    expect(res.status).toBe(200);
    expect(res.json.photos.map((x: Json) => x.objectKey)).toEqual([
      c!.objectKey,
      fresh.objectKey,
      a!.objectKey,
    ]);
    expect(await localObjectExists(b!.objectKey)).toBe(false);
    expect(await localObjectExists(b!.thumbKey)).toBe(false);
    expect(await localObjectExists(a!.objectKey)).toBe(true);
  });

  it("refuses another shop's files, fakes, location data and more than 5 photos", async () => {
    const s = await newSeller();
    const other = await newSeller();
    const p = await addProduct(s);
    const put = (photos: Json[]) =>
      s.call(setProductPhotos, { method: 'PUT', id: p.id, body: { photos } });

    expect((await put([await storedPhoto(other.shopId, 1)])).status).toBe(403);

    const gps = `products/${s.shopId}/gps.jpg`;
    await storeJpeg(gps, { gps: true });
    const res = await put([
      { objectKey: gps, thumbKey: (await storedPhoto(s.shopId, 2)).thumbKey },
    ]);
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe('PHOTO_HAS_LOCATION');
    expect(await localObjectExists(gps)).toBe(false);

    const fake = `products/${s.shopId}/fake.jpg`;
    await writeLocalObject(fake, png());
    expect((await put([{ objectKey: fake, thumbKey: fake }])).status).toBe(422);

    const six = [];
    for (let n = 0; n < 6; n++) six.push(await storedPhoto(s.shopId, 20 + n));
    expect((await put(six)).status).toBe(422);
    expect((await put([])).status).toBe(422);
    expect((await s.call(getProduct, { id: p.id })).json.photos).toHaveLength(1);
  });
});

describe('delete and undo', () => {
  it('a deleted product leaves the lists at once and can be brought back for a few minutes', async () => {
    const s = await newSeller();
    const p = await addProduct(s);
    expect((await s.call(deleteProduct, { method: 'DELETE', id: p.id })).status).toBe(204);
    expect((await s.call(listProducts)).json.counts.all).toBe(0);
    expect((await s.call(getProduct, { id: p.id })).status).toBe(404);

    const back = await s.call(restoreProduct, { method: 'POST', id: p.id, body: {} });
    expect(back.status).toBe(200);
    expect((await s.call(listProducts)).json.counts.all).toBe(1);

    await s.call(deleteProduct, { method: 'DELETE', id: p.id });
    await db()
      .update(schema.products)
      .set({ deletedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(schema.products.id, p.id));
    expect((await s.call(restoreProduct, { method: 'POST', id: p.id, body: {} })).status).toBe(404);
  });
});

describe('categories', () => {
  it('new ones go to the end; list with counts and a thumbnail; rename and hide', async () => {
    const s = await newSeller();
    const dresses = (await s.call(createCategory, { body: { name: 'Dresses' } })).json;
    const bags = (await s.call(createCategory, { body: { name: 'Bags' } })).json;
    expect([dresses.position, bags.position]).toEqual([0, 1]);
    await addProduct(s, { categoryId: dresses.id });

    const list = (await s.call(listCategories)).json as Json[];
    expect(list.map((c) => [c.name, c.productCount])).toEqual([
      ['Dresses', 1],
      ['Bags', 0],
    ]);
    expect(list[0]!.thumbUrl).toContain(`products/${s.shopId}/`);
    expect(list[1]!.thumbUrl).toBeNull();

    const renamed = await s.call(updateCategory, {
      method: 'PATCH',
      id: bags.id,
      body: { name: 'Handbags', isVisible: false },
    });
    expect(renamed.json).toMatchObject({ name: 'Handbags', isVisible: false });
    expect(
      (await s.call(updateCategory, { method: 'PATCH', id: bags.id, body: { position: 9 } }))
        .status,
    ).toBe(422);
  });

  it('reorders only with exactly the shop’s categories', async () => {
    const s = await newSeller();
    const a = (await s.call(createCategory, { body: { name: 'A' } })).json;
    const b = (await s.call(createCategory, { body: { name: 'B' } })).json;
    const c = (await s.call(createCategory, { body: { name: 'C' } })).json;
    const res = await s.call(reorderCategories, {
      method: 'PUT',
      body: { ids: [c.id, a.id, b.id] },
    });
    expect(res.status).toBe(200);
    expect(res.json.map((x: Json) => x.name)).toEqual(['C', 'A', 'B']);
    expect(
      (await s.call(reorderCategories, { method: 'PUT', body: { ids: [c.id, a.id] } })).status,
    ).toBe(422);
    expect(
      (
        await s.call(reorderCategories, {
          method: 'PUT',
          body: { ids: [c.id, a.id, b.id, randomUUID()] },
        })
      ).status,
    ).toBe(422);
    expect(
      (await s.call(reorderCategories, { method: 'PUT', body: { ids: [c.id, c.id, a.id] } }))
        .status,
    ).toBe(422);
  });

  it('assigns exactly the chosen products; deleting a category keeps its products', async () => {
    const s = await newSeller();
    const cat = (await s.call(createCategory, { body: { name: 'Dresses' } })).json;
    const p1 = await addProduct(s, { categoryId: cat.id });
    const p2 = await addProduct(s);
    const res = await s.call(setCategoryProducts, {
      method: 'PUT',
      id: cat.id,
      body: { productIds: [p2.id] },
    });
    expect(res.status).toBe(200);
    expect(res.json.products.map((p: Json) => p.id)).toEqual([p2.id]);
    expect((await s.call(getProduct, { id: p1.id })).json.categoryId).toBeNull();

    expect((await s.call(deleteCategory, { method: 'DELETE', id: cat.id })).status).toBe(204);
    expect((await s.call(getProduct, { id: p2.id })).json.categoryId).toBeNull();
    expect((await s.call(listProducts)).json.counts.all).toBe(2);
  });
});

describe('authorization', () => {
  it("a seller never reaches another shop's products or categories (404)", async () => {
    const a = await newSeller();
    const b = await newSeller();
    const product = await addProduct(a);
    const category = (await a.call(createCategory, { body: { name: 'Dresses' } })).json;
    const photo = await storedPhoto(b.shopId, 1);

    const attempts: [Handler, Json][] = [
      [getProduct, { id: product.id }],
      [updateProduct, { method: 'PATCH', id: product.id, body: { status: 'hidden' } }],
      [deleteProduct, { method: 'DELETE', id: product.id }],
      [restoreProduct, { method: 'POST', id: product.id, body: {} }],
      [setProductPhotos, { method: 'PUT', id: product.id, body: { photos: [photo] } }],
      [updateCategory, { method: 'PATCH', id: category.id, body: { name: 'Mine' } }],
      [deleteCategory, { method: 'DELETE', id: category.id }],
      [setCategoryProducts, { method: 'PUT', id: category.id, body: { productIds: [] } }],
    ];
    for (const [handler, opts] of attempts) {
      expect((await b.call(handler, opts)).status, handler.name).toBe(404);
    }
    // Their own category can't take someone else's product either.
    const mine = (await b.call(createCategory, { body: { name: 'Mine' } })).json;
    expect(
      (
        await b.call(setCategoryProducts, {
          method: 'PUT',
          id: mine.id,
          body: { productIds: [product.id] },
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.call(reorderCategories, { method: 'PUT', body: { ids: [category.id, mine.id] } }))
        .status,
    ).toBe(422);

    // Nothing changed for seller A.
    const still = (await a.call(getProduct, { id: product.id })).json;
    expect(still.status).toBe('available');
    expect((await a.call(listCategories)).json.map((c: Json) => c.name)).toEqual(['Dresses']);
    expect((await b.call(listProducts)).json.counts.all).toBe(0);
  });

  it('is 401 signed out and 404 without a shop', async () => {
    const anon = await listProducts(new Request('http://localhost:3000/api/products'), {
      params: Promise.resolve({ id: '' }),
    });
    expect(anon.status).toBe(401);
    const noShop = await newUser();
    expect((await noShop.call(listProducts)).status).toBe(404);
    expect((await noShop.call(createCategory, { body: { name: 'X' } })).status).toBe(404);
  });
});
