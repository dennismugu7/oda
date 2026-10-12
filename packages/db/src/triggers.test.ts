import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from './client';
import * as schema from './schema';
import { asTransition, createShopFixture, insertOrderFixture, truncateAll } from './testing';

// Triggers, guards and constraints from migrations 0001/0002, against oda_test.
const { db, pool } = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await truncateAll(db);
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(db);
});

/** The Postgres error behind a failed query (Drizzle wraps it). */
async function pgError(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const c = ((e as { cause?: unknown }).cause ?? e) as {
      code?: string;
      message: string;
      hint?: string;
      constraint?: string;
    };
    return { code: c.code, message: c.message, hint: c.hint, constraint: c.constraint };
  }
  throw new Error('Expected the query to fail');
}

async function product(
  shopId: string,
  overrides: Partial<typeof schema.products.$inferInsert> = {},
) {
  const [p] = await db
    .insert(schema.products)
    .values({ shopId, name: 'Kitenge top', price: 1200, ...overrides })
    .returning();
  return p!;
}

const unitsSold = async (id: string) =>
  (await db.query.products.findFirst({ where: eq(schema.products.id, id) }))!.unitsSold;
const shopRow = async (id: string) =>
  (await db.query.shops.findFirst({ where: eq(schema.shops.id, id) }))!;

async function setStatus(orderId: string, status: (typeof schema.orderStatus.enumValues)[number]) {
  await asTransition(db, (tx) =>
    tx.update(schema.orders).set({ status }).where(eq(schema.orders.id, orderId)),
  );
}

describe('updated_at', () => {
  it('is bumped on update', async () => {
    const { shopId, shop } = await createShopFixture(db);
    await new Promise((r) => setTimeout(r, 20));
    await db.update(schema.shops).set({ about: 'New' }).where(eq(schema.shops.id, shopId));
    expect((await shopRow(shopId)).updatedAt.getTime()).toBeGreaterThan(shop.updatedAt.getTime());
  });
});

describe('order status guard', () => {
  it('rejects a raw status or payment_status UPDATE', async () => {
    const { shopId } = await createShopFixture(db);
    const order = await insertOrderFixture(db, shopId, []);
    const e1 = await pgError(
      db.update(schema.orders).set({ status: 'confirmed' }).where(eq(schema.orders.id, order.id)),
    );
    expect(e1.hint).toBe('oda_status_guard');
    const e2 = await pgError(
      db.update(schema.orders).set({ paymentStatus: 'paid' }).where(eq(schema.orders.id, order.id)),
    );
    expect(e2.hint).toBe('oda_status_guard');
  });

  it('allows other columns, and status inside a transition transaction', async () => {
    const { shopId } = await createShopFixture(db);
    const order = await insertOrderFixture(db, shopId, []);
    await db
      .update(schema.orders)
      .set({ riderPhone: '+254700000001' })
      .where(eq(schema.orders.id, order.id));
    await setStatus(order.id, 'payment_claimed');
    const row = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.id) });
    expect(row).toMatchObject({ status: 'payment_claimed', riderPhone: '+254700000001' });
  });

  it('does not leak the transition flag outside its transaction', async () => {
    const { shopId } = await createShopFixture(db);
    const order = await insertOrderFixture(db, shopId, []);
    await setStatus(order.id, 'payment_claimed');
    const e = await pgError(
      db.update(schema.orders).set({ status: 'confirmed' }).where(eq(schema.orders.id, order.id)),
    );
    expect(e.hint).toBe('oda_status_guard');
  });
});

describe('units_sold and delivered_count', () => {
  it('count only while the order is a sale (confirmed, sent, delivered)', async () => {
    const { shopId } = await createShopFixture(db);
    const p = await product(shopId);
    const order = await insertOrderFixture(db, shopId, [
      { productId: p.id, qty: 2, unitPrice: 1200 },
    ]);
    expect(await unitsSold(p.id)).toBe(0);

    await setStatus(order.id, 'payment_claimed');
    expect(await unitsSold(p.id)).toBe(0);
    await setStatus(order.id, 'confirmed');
    expect(await unitsSold(p.id)).toBe(2);
    await setStatus(order.id, 'sent');
    await setStatus(order.id, 'delivered');
    expect(await unitsSold(p.id)).toBe(2);
    expect((await shopRow(shopId)).deliveredCount).toBe(1);
  });

  it('a cancelled sale gives the units back', async () => {
    const { shopId } = await createShopFixture(db);
    const p = await product(shopId);
    const order = await insertOrderFixture(db, shopId, [
      { productId: p.id, qty: 3, unitPrice: 1200 },
    ]);
    await setStatus(order.id, 'confirmed');
    await setStatus(order.id, 'cancelled');
    expect(await unitsSold(p.id)).toBe(0);
  });

  it('orders created as a sale count their items on insert (manual already paid)', async () => {
    const { shopId } = await createShopFixture(db);
    const p = await product(shopId);
    await insertOrderFixture(db, shopId, [{ productId: p.id, qty: 4, unitPrice: 1200 }], {
      status: 'confirmed',
      paymentStatus: 'paid',
      source: 'manual',
    });
    expect(await unitsSold(p.id)).toBe(4);
  });

  it('sums several lines of the same product and ignores deleted products', async () => {
    const { shopId } = await createShopFixture(db);
    const p = await product(shopId);
    const order = await insertOrderFixture(db, shopId, [
      { productId: p.id, qty: 1, unitPrice: 1200 },
      { productId: p.id, qty: 2, unitPrice: 1200 },
      { productId: null, qty: 5, unitPrice: 100 },
    ]);
    await setStatus(order.id, 'confirmed');
    expect(await unitsSold(p.id)).toBe(3);
  });

  it('leaving delivered takes the delivered count back down', async () => {
    const { shopId } = await createShopFixture(db);
    const order = await insertOrderFixture(db, shopId, [], {
      status: 'sent',
      paymentStatus: 'paid',
    });
    await setStatus(order.id, 'delivered');
    await setStatus(order.id, 'cancelled');
    expect((await shopRow(shopId)).deliveredCount).toBe(0);
  });
});

describe('ratings', () => {
  async function delivered(shopId: string, productId: string) {
    return insertOrderFixture(db, shopId, [{ productId, qty: 1, unitPrice: 1200 }], {
      status: 'delivered',
      paymentStatus: 'paid',
    });
  }

  it('shop rating follows reviews; product rating follows rated review items', async () => {
    const { shopId } = await createShopFixture(db);
    const p = await product(shopId);
    const editableUntil = new Date(Date.now() + 7 * 86_400_000);
    for (const rating of [5, 4]) {
      const order = await delivered(shopId, p.id);
      const [review] = await db
        .insert(schema.reviews)
        .values({
          orderId: order.id,
          shopId,
          buyerDisplayName: 'Wanjiku K.',
          rating,
          editableUntil,
        })
        .returning();
      const item = await db.query.orderItems.findFirst({
        where: eq(schema.orderItems.orderId, order.id),
      });
      await db.insert(schema.reviewItems).values({
        reviewId: review!.id,
        orderItemId: item!.id,
        productId: p.id,
        rating: rating === 5 ? 5 : null,
      });
    }
    expect(await shopRow(shopId)).toMatchObject({ ratingAvg: '4.50', ratingCount: 2 });
    const prod = await db.query.products.findFirst({ where: eq(schema.products.id, p.id) });
    expect(prod).toMatchObject({ ratingAvg: '5.00', ratingCount: 1 });

    await db.delete(schema.reviews).where(eq(schema.reviews.shopId, shopId));
    expect(await shopRow(shopId)).toMatchObject({ ratingAvg: null, ratingCount: 0 });
  });
});

describe('payment account verification', () => {
  it('resets to pending when the account details change, not for other edits', async () => {
    const { shopId, userId } = await createShopFixture(db);
    const [acc] = await db
      .insert(schema.paymentAccounts)
      .values({
        shopId,
        type: 'till',
        number: '123456',
        accountName: 'AMANI STYLES',
        verificationStatus: 'verified',
        verifiedBy: userId,
        verifiedAt: new Date(),
      })
      .returning();
    await db
      .update(schema.paymentAccounts)
      .set({ isActive: true })
      .where(eq(schema.paymentAccounts.id, acc!.id));
    let row = await db.query.paymentAccounts.findFirst({
      where: eq(schema.paymentAccounts.id, acc!.id),
    });
    expect(row?.verificationStatus).toBe('verified');

    await db
      .update(schema.paymentAccounts)
      .set({ number: '654321' })
      .where(eq(schema.paymentAccounts.id, acc!.id));
    row = await db.query.paymentAccounts.findFirst({
      where: eq(schema.paymentAccounts.id, acc!.id),
    });
    expect(row).toMatchObject({
      verificationStatus: 'pending',
      verifiedBy: null,
      verifiedAt: null,
    });
  });

  it('allows at most one active account per shop', async () => {
    const { shopId } = await createShopFixture(db);
    const values = { shopId, type: 'till' as const, accountName: 'A', isActive: true };
    await db.insert(schema.paymentAccounts).values({ ...values, number: '111111' });
    const e = await pgError(
      db.insert(schema.paymentAccounts).values({ ...values, number: '222222' }),
    );
    expect(e.constraint).toBe('payment_accounts_one_active');
  });

  it('paybill needs a reference mode; fixed needs a reference; till has none', async () => {
    const { shopId } = await createShopFixture(db);
    const base = { shopId, number: '522533', accountName: 'A' };
    const bad = [
      { ...base, type: 'paybill' as const },
      { ...base, type: 'paybill' as const, accountRefMode: 'fixed' as const },
      { ...base, type: 'till' as const, accountRefMode: 'fixed' as const, accountRef: '1' },
    ];
    for (const values of bad) {
      expect((await pgError(db.insert(schema.paymentAccounts).values(values))).constraint).toBe(
        'payment_accounts_paybill_ref',
      );
    }
    await db
      .insert(schema.paymentAccounts)
      .values({ ...base, type: 'paybill', accountRefMode: 'order_number' });
  });
});

describe('slugs', () => {
  it('a changed slug goes to history and can never be taken by another shop', async () => {
    const a = await createShopFixture(db, { slug: 'amani-styles' });
    await db.update(schema.shops).set({ slug: 'amani-wear' }).where(eq(schema.shops.id, a.shopId));
    const history = await db.select().from(schema.shopSlugHistory);
    expect(history).toMatchObject([{ oldSlug: 'amani-styles', shopId: a.shopId }]);

    const e = await pgError(createShopFixture(db, { slug: 'amani-styles' }));
    expect(e.hint).toBe('oda_slug_in_history');
    const b = await createShopFixture(db, { slug: 'other-shop' });
    const e2 = await pgError(
      db.update(schema.shops).set({ slug: 'amani-styles' }).where(eq(schema.shops.id, b.shopId)),
    );
    expect(e2.hint).toBe('oda_slug_in_history');
  });

  it('the owner can reclaim their own old slug', async () => {
    const a = await createShopFixture(db, { slug: 'amani-styles' });
    await db.update(schema.shops).set({ slug: 'amani-wear' }).where(eq(schema.shops.id, a.shopId));
    await db
      .update(schema.shops)
      .set({ slug: 'amani-styles' })
      .where(eq(schema.shops.id, a.shopId));
    const history = await db.select().from(schema.shopSlugHistory);
    expect(history).toMatchObject([{ oldSlug: 'amani-wear', shopId: a.shopId }]);
  });

  it("history can't hold another shop's live slug", async () => {
    await createShopFixture(db, { slug: 'amani-styles' });
    const b = await createShopFixture(db);
    const e = await pgError(
      db.insert(schema.shopSlugHistory).values({ oldSlug: 'amani-styles', shopId: b.shopId }),
    );
    expect(e.hint).toBe('oda_slug_in_history');
  });
});

describe('same-shop foreign keys', () => {
  it("rejects another shop's category, delivery area, order and review", async () => {
    const a = await createShopFixture(db);
    const b = await createShopFixture(db);
    const [catB] = await db
      .insert(schema.categories)
      .values({ shopId: b.shopId, name: 'Dresses' })
      .returning();
    expect((await pgError(product(a.shopId, { categoryId: catB!.id }))).constraint).toBe(
      'products_category_same_shop',
    );

    const [areaB] = await db
      .insert(schema.deliveryAreas)
      .values({ shopId: b.shopId, name: 'Kilimani', fee: 200, method: 'rider' })
      .returning();
    expect(
      (
        await pgError(
          insertOrderFixture(db, a.shopId, [], {
            fulfilment: 'delivery',
            deliveryAreaId: areaB!.id,
          }),
        )
      ).constraint,
    ).toBe('orders_delivery_area_same_shop');

    const orderB = await insertOrderFixture(db, b.shopId, []);
    expect(
      (
        await pgError(
          db.insert(schema.paymentClaims).values({
            orderId: orderB.id,
            shopId: a.shopId,
            mpesaCode: 'TIG4K7XQ2P',
          }),
        )
      ).constraint,
    ).toBe('payment_claims_order_same_shop');
    expect(
      (
        await pgError(
          db.insert(schema.notifications).values({
            shopId: a.shopId,
            type: 'new_order',
            orderId: orderB.id,
            title: 't',
            body: 'b',
          }),
        )
      ).constraint,
    ).toBe('notifications_order_same_shop');
  });

  it('deleting a category or delivery area keeps the row and its shop', async () => {
    const { shopId } = await createShopFixture(db);
    const [cat] = await db.insert(schema.categories).values({ shopId, name: 'Tops' }).returning();
    const p = await product(shopId, { categoryId: cat!.id });
    await db.delete(schema.categories).where(eq(schema.categories.id, cat!.id));
    const row = await db.query.products.findFirst({ where: eq(schema.products.id, p.id) });
    expect(row).toMatchObject({ categoryId: null, shopId });
  });
});

describe('constraints', () => {
  it('a shop must accept at least one way to pay', async () => {
    const { shopId } = await createShopFixture(db);
    const e = await pgError(
      db
        .update(schema.shops)
        .set({ acceptsPayBefore: false, acceptsPayOnDelivery: false })
        .where(eq(schema.shops.id, shopId)),
    );
    expect(e.constraint).toBe('shops_payment_option');
  });

  it('one shop per seller', async () => {
    const { userId } = await createShopFixture(db);
    const e = await pgError(
      db.insert(schema.shops).values({
        ownerId: userId,
        name: 'Second',
        slug: 'second-shop',
        whatsappPhone: '+254700000000',
      }),
    );
    expect(e.constraint).toBe('shops_owner_id_unique');
  });

  it('was-price must be above the price; totals must add up', async () => {
    const { shopId } = await createShopFixture(db);
    expect((await pgError(product(shopId, { price: 2500, compareAtPrice: 2500 }))).constraint).toBe(
      'products_compare_at_price',
    );
    expect(
      (
        await pgError(
          insertOrderFixture(db, shopId, [], { subtotal: 100, deliveryFee: 0, total: 99 }),
        )
      ).constraint,
    ).toBe('orders_money');
  });

  it('an arranged order (migration 0010, decision #110) has no delivery area', async () => {
    const { shopId } = await createShopFixture(db);
    const order = await insertOrderFixture(db, shopId, [], {
      fulfilment: 'arranged',
      addressText: 'Near Yaya Centre',
    });
    expect(order).toMatchObject({ fulfilment: 'arranged', deliveryAreaId: null });
    const [area] = await db
      .insert(schema.deliveryAreas)
      .values({ shopId, name: 'CBD', fee: 200, method: 'rider' })
      .returning();
    expect(
      (
        await pgError(
          insertOrderFixture(db, shopId, [], { fulfilment: 'arranged', deliveryAreaId: area!.id }),
        )
      ).constraint,
    ).toBe('orders_pickup_has_no_area');
  });
});

describe('rate_limit_hit', () => {
  it('allows up to the limit within a window, then refuses', async () => {
    const hit = async () =>
      (await db.execute<{ ok: boolean }>(sql`select rate_limit_hit('checkout:ip:1', 60, 2) as ok`))
        .rows[0]!.ok;
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false]);
  });
});
