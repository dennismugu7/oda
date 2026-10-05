import { existsSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { createDb, schema } from '@oda/db';

// Playwright helpers that set up what sellers can't yet do through the API: delivery areas
// and pickup arrive with the Delivery screen in M6 (decision #61 c). Writes to the database
// the server under test uses (DATABASE_URL, or apps/web/.env.local).

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

export async function setDeliveryOptions(
  slug: string,
  opts: {
    areas: { name: string; fee: number; etaLabel?: string; freeDeliveryEligible?: boolean }[];
    pickup?: boolean;
    freeDeliveryThreshold?: number | null;
    payOnDelivery?: boolean;
  },
): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const { db, pool } = createDb(url);
  try {
    const [shop] = await db
      .select({ id: schema.shops.id })
      .from(schema.shops)
      .where(eq(schema.shops.slug, slug));
    if (!shop) throw new Error(`No shop ${slug}`);
    await db
      .update(schema.shops)
      .set({
        pickupEnabled: opts.pickup ?? false,
        pickupLocation: opts.pickup ? 'Moi Avenue shop' : null,
        freeDeliveryThreshold: opts.freeDeliveryThreshold ?? null,
        ...(opts.payOnDelivery !== undefined ? { acceptsPayOnDelivery: opts.payOnDelivery } : {}),
      })
      .where(eq(schema.shops.id, shop.id));
    if (opts.areas.length) {
      await db.insert(schema.deliveryAreas).values(
        opts.areas.map((a, position) => ({
          shopId: shop.id,
          name: a.name,
          fee: a.fee,
          method: 'rider' as const,
          etaLabel: a.etaLabel ?? null,
          freeDeliveryEligible: a.freeDeliveryEligible ?? true,
          position,
        })),
      );
    }
  } finally {
    await pool.end();
  }
}

/** Changes a product's price, as a seller editing it would (for the price-change test). */
export async function setProductPrice(slug: string, name: string, price: number): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const { db, pool } = createDb(url);
  try {
    const [shop] = await db
      .select({ id: schema.shops.id })
      .from(schema.shops)
      .where(eq(schema.shops.slug, slug));
    await db
      .update(schema.products)
      .set({ price })
      .where(and(eq(schema.products.shopId, shop!.id), eq(schema.products.name, name)));
  } finally {
    await pool.end();
  }
}
