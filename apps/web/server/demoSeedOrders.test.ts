import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { createShopFixture, truncateAll } from '@oda/db/testing';
import { getDb } from './db';
import { DEMO_DELIVERY_AREAS, DEMO_PRODUCTS } from './demoSeed/data';
import { resetSampleOrders, SAMPLE_BUYER_PHONE } from './demoSeed/orders';

// Demo Duka's sample orders (M5; decision #110 adds one arranged with the buyer), against
// oda_test: made through insertOrder / transitionOrder, replaced on every run.

const db = getDb();
const t = schema;

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await truncateAll(db);
});

async function demoShop() {
  const { shopId, userId } = await createShopFixture(db, { slug: 'demo-duka-test' });
  await db
    .update(t.shops)
    .set({ acceptsPayOnDelivery: true, pickupEnabled: true, pickupLocation: 'Demo pickup point' })
    .where(eq(t.shops.id, shopId));
  await db.insert(t.products).values(
    DEMO_PRODUCTS.map((p) => ({
      shopId,
      name: p.name,
      price: p.price,
      sizes: p.sizes ?? [],
      colours: p.colours ?? [],
    })),
  );
  const [cbd] = DEMO_DELIVERY_AREAS;
  await db.insert(t.deliveryAreas).values({
    shopId,
    name: cbd!.name,
    fee: cbd!.fee,
    method: cbd!.method,
  });
  await db.insert(t.paymentAccounts).values({
    shopId,
    type: 'till',
    number: '000000',
    accountName: 'DEMO DUKA TEST ONLY',
    isActive: true,
  });
  return { shopId, userId };
}

describe('demo sample orders', () => {
  it('include one arranged with the buyer, ready to collect, and stay at one set per run', async () => {
    const { shopId, userId } = await demoShop();
    const first = await resetSampleOrders(db, shopId, userId);
    expect(first).toHaveLength(10);
    const second = await resetSampleOrders(db, shopId, userId);
    expect(second).toHaveLength(10);

    const orders = await db
      .select()
      .from(t.orders)
      .where(eq(t.orders.buyerPhone, SAMPLE_BUYER_PHONE));
    expect(orders).toHaveLength(10);
    const arranged = orders.filter((o) => o.fulfilment === 'arranged');
    expect(arranged).toHaveLength(1);
    expect(arranged[0]).toMatchObject({
      buyerName: 'Jabali (demo buyer)',
      status: 'sent',
      sentMethod: 'pickup',
      paymentMethod: 'pay_on_delivery',
      source: 'manual',
      deliveryAreaId: null,
      addressText: 'Near the matatu stage, after 5pm',
      deliveryFee: 0,
    });
    expect(second.map((s) => s.label)).toContain(
      'Arranged with the buyer (pay on delivery, ready to collect)',
    );
  });
});
