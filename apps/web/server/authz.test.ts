import { randomUUID } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { insertOrderFixture, truncateAll } from '@oda/db/testing';
import {
  ORDER_SERVER_OWNED_FIELDS,
  SERVER_OWNED_FIELDS,
  WRITE_SCHEMAS,
  paymentAccountInput,
  productUpdate,
  profileUpdate,
  shopUpdate,
} from '@oda/shared';

import {
  requireAdmin,
  requireOrderToken,
  requireSeller,
  requireUser,
  type HasHeaders,
} from './authz';
import { getDb } from './db';
import { ConflictError, HttpError, parseInput } from './errors';
import { insertOrder, transitionOrder } from './orders';
import { adminRepo } from './repos/admin';
import { orderTokenRepo } from './repos/order-token';
import { signUpVerified } from '@/test/auth';
import { publicRepo } from './repos/public';
import { sellerRepo } from './repos/seller';
import { userRepo } from './repos/user';
import { assertOwnsKey } from './uploads';

// The authorization test suite (docs/data-model.md → Authorization): seller isolation, anon
// lockout, admin, server-owned columns, missing-profile repair and the database guards.
// Real Better Auth sign-ups and the real repositories against oda_test.

const db = getDb();
const t = schema;

/** Resolves to the HttpError status a call fails with (fails the test if it succeeds). */
async function status(p: Promise<unknown> | (() => unknown)): Promise<number> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
  throw new Error('Expected an HttpError');
}

const bearer = (token: string | null): HasHeaders => ({
  headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
});

let userCount = 0;
async function signUp(name: string) {
  userCount += 1;
  const { userId, token } = await signUpVerified(
    name,
    `user${userCount}-${randomUUID().slice(0, 6)}@example.test`,
  );
  return { userId, token, req: bearer(token) };
}

/** A seller with a shop and one of everything, built through the real repositories. */
async function seller(name: string, slug: string, buyerPhone: string) {
  const user = await signUp(name);
  await userRepo(db, await requireUser(user.req)).createShop(
    parseInput(WRITE_SCHEMAS.shopCreate, { name, slug, whatsappPhone: '0712345678' }),
  );
  const ctx = await requireSeller(user.req);
  const repo = sellerRepo(db, ctx);
  const category = await repo.createCategory({ name: 'Dresses', isVisible: true, position: 0 });
  const product = await repo.createProduct(
    parseInput(WRITE_SCHEMAS.productInput, {
      name: 'Ankara wrap dress',
      price: 2500,
      categoryId: category.id,
    }),
  );
  const photo = await repo.addProductPhoto(
    product.id,
    parseInput(WRITE_SCHEMAS.productPhotoInput, {
      objectKey: `products/${ctx.shopId}/${product.id}/1.jpg`,
      thumbKey: `products/${ctx.shopId}/${product.id}/1-thumb.jpg`,
    }),
  );
  const account = await repo.createPaymentAccount(
    parseInput(paymentAccountInput, { type: 'till', number: '5123456', accountName: name }),
  );
  const area = await repo.createDeliveryArea(
    parseInput(WRITE_SCHEMAS.deliveryAreaInput, { name: 'Kilimani', fee: 200, method: 'rider' }),
  );
  const order = await insertOrderFixture(
    db,
    ctx.shopId,
    [{ productId: product.id, qty: 1, unitPrice: 2500 }],
    {
      buyerPhone,
      mpesaCode: 'SFK7Q2M9TX',
    },
  );
  const [notification] = await db
    .insert(t.notifications)
    .values({
      shopId: ctx.shopId,
      type: 'new_order',
      orderId: order.id,
      title: 'New order',
      body: '#1001',
    })
    .returning();
  const [item] = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, order.id));
  const [review] = await db
    .insert(t.reviews)
    .values({
      orderId: order.id,
      shopId: ctx.shopId,
      buyerDisplayName: 'Wanjiku K.',
      rating: 5,
      editableUntil: new Date(Date.now() + 86_400_000),
    })
    .returning();
  await db.insert(t.reviewItems).values({
    reviewId: review!.id,
    orderItemId: item!.id,
    productId: product.id,
    rating: 5,
    text: 'Fits well',
  });
  return {
    ...user,
    ctx,
    repo,
    category,
    product,
    photo,
    account,
    area,
    order,
    notification: notification!,
  };
}

type Seller = Awaited<ReturnType<typeof seller>>;

/** Every row that belongs to a shop, to prove failed attempts change nothing. */
async function snapshot(shopId: string) {
  const products = await db.select().from(t.products).where(eq(t.products.shopId, shopId));
  return {
    shop: await db.select().from(t.shops).where(eq(t.shops.id, shopId)),
    products,
    photos: await db
      .select()
      .from(t.productPhotos)
      .where(
        inArray(
          t.productPhotos.productId,
          products.map((p) => p.id),
        ),
      )
      .orderBy(asc(t.productPhotos.id)),
    categories: await db.select().from(t.categories).where(eq(t.categories.shopId, shopId)),
    accounts: await db.select().from(t.paymentAccounts).where(eq(t.paymentAccounts.shopId, shopId)),
    areas: await db.select().from(t.deliveryAreas).where(eq(t.deliveryAreas.shopId, shopId)),
    orders: await db.select().from(t.orders).where(eq(t.orders.shopId, shopId)),
    notifications: await db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.shopId, shopId)),
  };
}

/** Every key anywhere in a value (objects and arrays, recursively). */
function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, into));
  else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      allKeys(v, into);
    }
  }
  return into;
}

const PRIVATE_KEYS = [
  'buyerName',
  'buyerPhone',
  'buyerEmail',
  'buyerWhatsapp',
  'publicToken',
  'token',
  'mpesaCode',
  'email',
  'recoveryPhone',
  'ownerId',
  'orderId',
  'orderCounter',
  'suspendedAt',
  'deletedAt',
  'checklist',
  'channels',
  'isActive',
  'number',
  'accountName',
];

let A: Seller;
let B: Seller;

beforeAll(async () => {
  await truncateAll(db);
  A = await seller('Amani Styles', 'amani-styles', '+254711000001');
  B = await seller('Baraka Shoes', 'baraka-shoes', '+254722000002');
});

afterAll(async () => {
  await truncateAll(db);
});

describe('1. seller isolation: A gets 404 on every one of B’s resources', () => {
  it('reads', async () => {
    const r = A.repo;
    expect(await status(r.getProduct(B.product.id))).toBe(404);
    expect(await status(r.getCategory(B.category.id))).toBe(404);
    expect(await status(r.getPaymentAccount(B.account.id))).toBe(404);
    expect(await status(r.getDeliveryArea(B.area.id))).toBe(404);
    expect(await status(r.getOrder(B.order.id))).toBe(404);
  });

  it('lists only A’s rows, and the shop is A’s own', async () => {
    const r = A.repo;
    expect((await r.getShop()).id).toBe(A.ctx.shopId);
    const lists = await Promise.all([
      r.listProducts(),
      r.listCategories(),
      r.listPaymentAccounts(),
      r.listDeliveryAreas(),
      r.listOrders(),
      r.listNotifications(),
    ]);
    for (const list of lists) {
      expect(list.length).toBeGreaterThan(0);
      for (const row of list) expect(row.shopId).toBe(A.ctx.shopId);
    }
    expect((await r.getProduct(A.product.id)).photos.map((p) => p.id)).toEqual([A.photo.id]);
  });

  it('customers: only A’s buyers with at least one sale', async () => {
    const order = (shop: Seller, phone: string, kind: 'manual_paid' | 'buyer_pay_now') =>
      insertOrder(db, {
        shopId: shop.ctx.shopId,
        kind,
        buyer: { name: 'Neema Otieno', phone },
        fulfilment: { kind: 'delivery', areaId: shop.area.id, addressText: 'Kilimani' },
        lines: [{ productId: shop.product.id, qty: 1 }],
      });
    await order(A, '0711000010', 'manual_paid'); // a sale
    const cancelled = await order(A, '0711000011', 'buyer_pay_now');
    await transitionOrder(
      db,
      { kind: 'seller', ctx: A.ctx, orderId: cancelled.order.id },
      { type: 'sellerCancel', reason: 'out_of_stock' },
    );
    await order(B, '0722000010', 'manual_paid'); // B's sale

    // Not listed: the cancelled-only buyer, the fixture's unpaid buyer and B's buyers.
    const customers = await A.repo.listCustomers();
    expect(customers).toMatchObject([
      { phone: '+254711000010', name: 'Neema Otieno', orderCount: 1, totalSpent: 2700 },
    ]);
  });

  it('updates and deletes, leaving every B row unchanged', async () => {
    const before = await snapshot(B.ctx.shopId);
    const r = A.repo;
    const attempts: (() => Promise<unknown>)[] = [
      () => r.updateProduct(B.product.id, { name: 'Taken' }),
      () => r.deleteProduct(B.product.id),
      () => r.deleteProductPhoto(B.photo.id),
      () =>
        r.addProductPhoto(B.product.id, {
          objectKey: `products/${A.ctx.shopId}/x.jpg`,
          thumbKey: `products/${A.ctx.shopId}/x-t.jpg`,
          position: 1,
          width: null,
          height: null,
        }),
      () => r.updateCategory(B.category.id, { name: 'Taken' }),
      () => r.deleteCategory(B.category.id),
      () =>
        r.updatePaymentAccount(B.account.id, {
          type: 'till',
          number: '9999999',
          accountName: 'Thief',
          accountRefMode: null,
          accountRef: null,
        }),
      () => r.activatePaymentAccount(B.account.id),
      () => r.updateDeliveryArea(B.area.id, { fee: 0 }),
      () => r.deleteDeliveryArea(B.area.id),
      () => r.markNotificationRead(B.notification.id),
      // Pointing A's own product at B's category
      () =>
        r.createProduct({
          ...parseInput(WRITE_SCHEMAS.productInput, { name: 'X', price: 1 }),
          categoryId: B.category.id,
        }),
      () => r.updateProduct(A.product.id, { categoryId: B.category.id }),
    ];
    for (const attempt of attempts) expect(await status(attempt)).toBe(404);
    // A's repo can't delete B's account (removeAccount answers 404 first: settings.test.ts).
    expect(await r.deleteInactivePaymentAccount(B.account.id)).toBe(false);
    expect(await snapshot(B.ctx.shopId)).toEqual(before);
  });

  it('ids that are not uuids are 404, not 500', async () => {
    expect(await status(A.repo.getProduct('1042'))).toBe(404);
    expect(await status(A.repo.getOrder("' or 1=1 --"))).toBe(404);
  });

  it('upload keys: A can’t use B’s prefix (or a made-up one)', async () => {
    const keys = [
      `products/${B.ctx.shopId}/a.jpg`,
      `logos/${B.ctx.shopId}/logo.png`,
      `feedback/${B.ctx.shopId}/s.png`,
      `products/${A.ctx.shopId}/../${B.ctx.shopId}/a.jpg`,
      `products/${A.ctx.shopId}/`,
      `reviews/${A.ctx.shopId}/a.jpg`,
      `products/${A.ctx.shopId}`,
    ];
    for (const key of keys) expect(await status(() => assertOwnsKey(A.ctx, key)), key).toBe(403);
    expect(() => assertOwnsKey(A.ctx, `logos/${A.ctx.shopId}/logo.png`)).not.toThrow();
    expect(() => assertOwnsKey(A.ctx, `logos/${A.ctx.shopId}/logo.png`, ['products'])).toThrow();

    const before = await snapshot(A.ctx.shopId);
    expect(
      await status(
        A.repo.addProductPhoto(A.product.id, {
          objectKey: `products/${B.ctx.shopId}/a.jpg`,
          thumbKey: `products/${A.ctx.shopId}/a-t.jpg`,
          position: 1,
          width: null,
          height: null,
        }),
      ),
    ).toBe(403);
    expect(await status(A.repo.updateShop({ logoPath: `logos/${B.ctx.shopId}/logo.png` }))).toBe(
      403,
    );
    expect(await snapshot(A.ctx.shopId)).toEqual(before);
  });
});

describe('2. anon lockout', () => {
  it('no session, or a bad one, is 401 on every seller and user path', async () => {
    for (const req of [
      bearer(null),
      bearer('not-a-real-session-token'),
      { headers: new Headers({ cookie: 'x=1' }) },
    ]) {
      expect(await status(requireUser(req))).toBe(401);
      expect(await status(requireSeller(req))).toBe(401);
    }
  });

  it('a signed-in user without a shop gets 404 from requireSeller', async () => {
    const user = await signUp('No Shop Yet');
    await expect(requireUser(user.req)).resolves.toMatchObject({ userId: user.userId });
    expect(await status(requireSeller(user.req))).toBe(404);
  });

  it('order access needs the exact public token', async () => {
    const bad = [
      undefined,
      null,
      '',
      'short',
      A.order.publicToken + 'x',
      'AAAAAAAAAAAA',
      A.order.id,
      1001,
      A.order.number,
    ];
    for (const token of bad)
      expect(await status(requireOrderToken(token)), String(token)).toBe(404);
    const ctx = await requireOrderToken(A.order.publicToken);
    expect(ctx.order.id).toBe(A.order.id);
  });

  it('the buyer order view has no internal ids', async () => {
    const view = await orderTokenRepo(db, await requireOrderToken(A.order.publicToken)).view();
    expect(view.number).toBe(A.order.number);
    const keys = allKeys(view);
    for (const key of [
      'id',
      'shopId',
      'idempotencyKey',
      'ownerId',
      'orderCounter',
      'recoveryPhone',
      'email',
    ]) {
      expect(keys.has(key), key).toBe(false);
    }
  });

  it('public shop pages expose only public fields', async () => {
    const pub = publicRepo(db);
    const found = await pub.findShop('amani-styles');
    if (found.kind !== 'shop') throw new Error('expected the shop');
    const shopRepo = pub.shop(found.shop);
    const [products, product, reviews, categories, areas] = await Promise.all([
      shopRepo.products(),
      shopRepo.product(A.product.id),
      shopRepo.reviews(),
      shopRepo.categories(),
      shopRepo.deliveryAreas(),
    ]);
    expect(products.map((p) => p.id)).toEqual([A.product.id]);
    expect(reviews[0]?.items[0]).toMatchObject({
      productName: 'Item', // the order item's name snapshot (fixture)
      text: 'Fits well',
    });
    expect(found.shop.payNowAvailable).toBe(true);

    for (const [name, value] of Object.entries({
      shop: found.shop,
      products,
      product,
      reviews,
      categories,
      areas,
    })) {
      const keys = allKeys(value);
      for (const key of PRIVATE_KEYS) expect(keys.has(key), `${name}.${key}`).toBe(false);
    }
    // A product of another shop isn't reachable through this shop.
    expect(await status(shopRepo.product(B.product.id))).toBe(404);
  });

  it('hidden and deleted products are not public', async () => {
    const extra = await A.repo.createProduct(
      parseInput(WRITE_SCHEMAS.productInput, { name: 'Secret', price: 900, status: 'hidden' }),
    );
    const gone = await A.repo.createProduct(
      parseInput(WRITE_SCHEMAS.productInput, { name: 'Gone', price: 900 }),
    );
    await A.repo.deleteProduct(gone.id);
    const found = await publicRepo(db).findShop('amani-styles');
    if (found.kind !== 'shop') throw new Error('expected the shop');
    const ids = (await publicRepo(db).shop(found.shop).products()).map((p) => p.id);
    expect(ids).not.toContain(extra.id);
    expect(ids).not.toContain(gone.id);
    expect(await status(publicRepo(db).shop(found.shop).product(extra.id))).toBe(404);
    await A.repo.deleteProduct(extra.id);
  });

  it('paused shops stay browsable; suspended and deleted shops don’t exist', async () => {
    const pub = publicRepo(db);
    await B.repo.updateShop({ isPaused: true });
    expect(await pub.findShop('baraka-shoes')).toMatchObject({
      kind: 'shop',
      shop: { isPaused: true },
    });
    await B.repo.updateShop({ isPaused: false });

    for (const column of ['suspendedAt', 'deletedAt'] as const) {
      await db
        .update(t.shops)
        .set({ [column]: new Date() })
        .where(eq(t.shops.id, B.ctx.shopId));
      expect(await pub.findShop('baraka-shoes'), column).toEqual({ kind: 'not_found' });
      await db
        .update(t.shops)
        .set({ [column]: null })
        .where(eq(t.shops.id, B.ctx.shopId));
    }
    expect(await pub.findShop('no-such-shop')).toEqual({ kind: 'not_found' });
  });

  it('a deleted shop locks its seller out (404) and a deleted profile signs them out (401)', async () => {
    await db.update(t.shops).set({ deletedAt: new Date() }).where(eq(t.shops.id, B.ctx.shopId));
    expect(await status(requireSeller(B.req))).toBe(404);
    await db.update(t.shops).set({ deletedAt: null }).where(eq(t.shops.id, B.ctx.shopId));

    await db.update(t.profiles).set({ deletedAt: new Date() }).where(eq(t.profiles.id, B.userId));
    expect(await status(requireUser(B.req))).toBe(401);
    await db.update(t.profiles).set({ deletedAt: null }).where(eq(t.profiles.id, B.userId));
    await expect(requireSeller(B.req)).resolves.toMatchObject({ shopId: B.ctx.shopId });
  });
});

describe('3. admin', () => {
  it('anon and non-admins get 404; an admin passes', async () => {
    expect(await status(requireAdmin(bearer(null)))).toBe(404);
    expect(await status(requireAdmin(bearer('bogus')))).toBe(404);
    expect(await status(requireAdmin(A.req))).toBe(404);

    const admin = await signUp('oda Admin');
    await db.update(t.profiles).set({ isAdmin: true }).where(eq(t.profiles.id, admin.userId));
    const ctx = await requireAdmin(admin.req);
    const verified = await adminRepo(db, ctx).setPaymentVerification(B.account.id, {
      status: 'verified',
    });
    expect(verified).toMatchObject({ verificationStatus: 'verified', verifiedBy: admin.userId });

    // Shop search treats LIKE wildcards literally.
    const shops = adminRepo(db, ctx);
    expect((await shops.listShops('amani')).map((s) => s.slug)).toEqual(['amani-styles']);
    expect(await shops.listShops('%')).toEqual([]);
    expect(await shops.listShops('_')).toEqual([]);
  });

  it('is_admin can’t be set through any whitelist', async () => {
    for (const [name, s] of Object.entries(WRITE_SCHEMAS)) {
      for (const key of ['isAdmin', 'is_admin']) {
        expect(await status(() => parseInput(s, { [key]: true })), `${name}.${key}`).toBe(422);
      }
    }
    expect(
      await status(() => parseInput(profileUpdate, { firstName: 'Amani', isAdmin: true })),
    ).toBe(422);
    const profile = await db.query.profiles.findFirst({ where: eq(t.profiles.id, A.userId) });
    expect(profile?.isAdmin).toBe(false);
  });
});

describe('4. server-owned columns', () => {
  const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

  it('every write schema rejects every server-owned column with 422', async () => {
    for (const [name, s] of Object.entries(WRITE_SCHEMAS)) {
      const owned: readonly string[] = name.startsWith('product')
        ? SERVER_OWNED_FIELDS
        : ORDER_SERVER_OWNED_FIELDS;
      for (const key of owned) {
        for (const variant of new Set([key, snake(key)])) {
          expect(await status(() => parseInput(s, { [variant]: 1 })), `${name}.${variant}`).toBe(
            422,
          );
        }
      }
    }
  });

  it('through the repositories, the database is unchanged after each rejected body', async () => {
    const before = await snapshot(A.ctx.shopId);
    const bodies: [
      schema: (typeof WRITE_SCHEMAS)[keyof typeof WRITE_SCHEMAS],
      write: (input: never) => Promise<unknown>,
    ][] = [
      [shopUpdate, (i) => A.repo.updateShop(i)],
      [productUpdate, (i) => A.repo.updateProduct(A.product.id, i)],
      [paymentAccountInput, (i) => A.repo.updatePaymentAccount(A.account.id, i)],
      [WRITE_SCHEMAS.categoryUpdate, (i) => A.repo.updateCategory(A.category.id, i)],
      [WRITE_SCHEMAS.deliveryAreaUpdate, (i) => A.repo.updateDeliveryArea(A.area.id, i)],
    ];
    const values: Record<string, unknown> = {
      isAdmin: true,
      suspendedAt: null,
      orderCounter: 1,
      ratingAvg: '5.00',
      ratingCount: 999,
      deliveredCount: 999,
      unitsSold: 999,
      verificationStatus: 'verified',
      verifiedBy: A.userId,
      verifiedAt: new Date().toISOString(),
      verificationNote: 'ok',
      shopId: B.ctx.shopId,
      ownerId: B.userId,
      id: randomUUID(),
      status: 'delivered',
      paymentStatus: 'paid',
      isActive: true,
    };
    for (const [s, write] of bodies) {
      for (const [key, value] of Object.entries(values)) {
        const body = { name: 'Still mine', [key]: value };
        expect(await status(async () => write(parseInput(s, body) as never)), key).toBe(422);
      }
    }
    expect(await snapshot(A.ctx.shopId)).toEqual(before);
  });
});

describe('5. missing profile', () => {
  it('is created on first use, once, without overwriting an existing one', async () => {
    const user = await signUp('Hook Failed');
    await db.delete(t.profiles).where(eq(t.profiles.id, user.userId));

    await Promise.all([
      requireUser(user.req),
      requireUser(user.req),
      requireSeller(user.req).catch(() => null),
    ]);
    const rows = await db.select().from(t.profiles).where(eq(t.profiles.id, user.userId));
    expect(rows).toHaveLength(1);

    await db.update(t.profiles).set({ firstName: 'Neema' }).where(eq(t.profiles.id, user.userId));
    await requireUser(user.req);
    const [again] = await db.select().from(t.profiles).where(eq(t.profiles.id, user.userId));
    expect(again?.firstName).toBe('Neema');
  });

  it('a seller whose profile vanished is repaired too', async () => {
    // Shops cascade from profiles, so simulate the hook failing before the shop existed.
    const user = await signUp('Late Profile');
    await db.delete(t.profiles).where(eq(t.profiles.id, user.userId));
    const ctx = await requireUser(user.req);
    await userRepo(db, ctx).createShop(
      parseInput(WRITE_SCHEMAS.shopCreate, {
        name: 'Late Shop',
        slug: 'late-shop',
        whatsappPhone: '0712345678',
      }),
    );
    await expect(requireSeller(user.req)).resolves.toMatchObject({ userId: user.userId });
  });
});

describe('checklist', () => {
  it('ticks with a timestamp and unticks, leaving other items alone', async () => {
    const ticked = await A.repo.updateShop({
      checklist: { shared_link: true, tested_whatsapp: true },
    });
    expect(Object.keys(ticked.checklist as object).sort()).toEqual([
      'shared_link',
      'tested_whatsapp',
    ]);
    const unticked = await A.repo.updateShop({ checklist: { tested_whatsapp: false } });
    expect(Object.keys(unticked.checklist as object)).toEqual(['shared_link']);
    expect(Date.parse((unticked.checklist as Record<string, string>).shared_link!)).not.toBeNaN();
  });
});

describe('6. database guards', () => {
  it('a raw status UPDATE outside transitionOrder() fails', async () => {
    await expect(
      db.update(t.orders).set({ status: 'confirmed' }).where(eq(t.orders.id, A.order.id)),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`update orders set payment_status = 'paid' where id = ${A.order.id}`),
    ).rejects.toThrow();
    const [order] = await db.select().from(t.orders).where(eq(t.orders.id, A.order.id));
    expect(order).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
  });

  it('another shop’s live or old link can’t be taken (409)', async () => {
    expect(await status(A.repo.updateShop({ slug: 'baraka-shoes' }))).toBe(409);
    await B.repo.updateShop({ slug: 'baraka-kicks' });
    const err = await A.repo.updateShop({ slug: 'baraka-shoes' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).message).toBe('That link is taken. Try another one.');
    // The old link redirects to the new one.
    expect(await publicRepo(db).findShop('baraka-shoes')).toEqual({
      kind: 'redirect',
      slug: 'baraka-kicks',
    });
    // B can take its own old link back.
    await B.repo.updateShop({ slug: 'baraka-shoes' });
  });

  it('only one payment account is active per shop', async () => {
    const second = await A.repo.createPaymentAccount(
      parseInput(paymentAccountInput, {
        type: 'pochi',
        number: '0711000001',
        accountName: 'Amani',
      }),
    );
    expect(second.isActive).toBe(false);
    await expect(
      db
        .update(t.paymentAccounts)
        .set({ isActive: true })
        .where(eq(t.paymentAccounts.id, second.id)),
    ).rejects.toThrow();
    await A.repo.activatePaymentAccount(second.id);
    const active = (await A.repo.listPaymentAccounts()).filter((a) => a.isActive);
    expect(active.map((a) => a.id)).toEqual([second.id]);
  });

  it('pay-before and pay-on-delivery can’t both be off (422)', async () => {
    expect(
      await status(() =>
        parseInput(shopUpdate, { acceptsPayBefore: false, acceptsPayOnDelivery: false }),
      ),
    ).toBe(422);
    // A partial update passes the schema; the database check still refuses it.
    expect(await status(A.repo.updateShop({ acceptsPayBefore: false }))).toBe(422);
    expect((await A.repo.getShop()).acceptsPayBefore).toBe(true);
  });
});
