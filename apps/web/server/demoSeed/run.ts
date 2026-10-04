// Staging demo seed (milestones M4, owner Step 63): creates the "Demo Duka" shop with 12
// products, categories and generated placeholder photos. Idempotent: what exists is kept,
// only what's missing is added. Run by the manual workflow demo-seed-staging.yml, or locally:
//   pnpm --filter @oda/web exec tsx --conditions=react-server server/demoSeed/run.ts
// Staging: DATABASE_URL (Neon staging) + STAGING_IMAGES_BLOB_READ_WRITE_TOKEN (images store).
// Locally: the local database and the local storage folder (.uploads).
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { put } from '@vercel/blob';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@oda/db';
import { getDb } from '../db';
import { writeLocalObject } from '../storage';
import { DEMO_CATEGORIES, DEMO_OWNER, DEMO_PRODUCTS, DEMO_SHOP } from './data';
import { placeholderPhoto } from './images';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const t = schema;
const DAY = 24 * 60 * 60 * 1000;
const token = process.env.STAGING_IMAGES_BLOB_READ_WRITE_TOKEN;
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const local = ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
if (!local && !token) {
  throw new Error('STAGING_IMAGES_BLOB_READ_WRITE_TOKEN is needed to seed a remote database');
}

async function store(key: string, bytes: Uint8Array) {
  if (token) {
    await put(key, Buffer.from(bytes), {
      access: 'public',
      token,
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } else {
    await writeLocalObject(key, bytes);
  }
}

async function main() {
  const db = getDb();
  const log: string[] = [];

  let [owner] = await db
    .select({ id: t.authUser.id })
    .from(t.authUser)
    .where(eq(t.authUser.email, DEMO_OWNER.email));
  if (!owner) {
    // No credential account: nobody can sign in as the demo owner.
    [owner] = await db
      .insert(t.authUser)
      .values({ name: DEMO_OWNER.name, email: DEMO_OWNER.email, emailVerified: true })
      .returning({ id: t.authUser.id });
    await db.insert(t.profiles).values({ id: owner!.id }).onConflictDoNothing();
    log.push('owner created');
  }

  let [shop] = await db
    .select({ id: t.shops.id })
    .from(t.shops)
    .where(eq(t.shops.slug, DEMO_SHOP.slug));
  if (!shop) {
    [shop] = await db
      .insert(t.shops)
      .values({
        ownerId: owner!.id,
        ...DEMO_SHOP,
        businessType: 'fashion',
        channels: ['whatsapp', 'tiktok'],
        acceptsPayBefore: false,
        acceptsPayOnDelivery: true,
        onboardingStep: 6,
        onboardingCompletedAt: new Date(),
      })
      .returning({ id: t.shops.id });
    log.push('shop created');
  }
  const shopId = shop!.id;

  const categoryIds = new Map<string, string>();
  for (const [position, name] of DEMO_CATEGORIES.entries()) {
    const [found] = await db
      .select({ id: t.categories.id })
      .from(t.categories)
      .where(and(eq(t.categories.shopId, shopId), eq(t.categories.name, name)));
    if (found) categoryIds.set(name, found.id);
    else {
      const [row] = await db
        .insert(t.categories)
        .values({ shopId, name, position })
        .returning({ id: t.categories.id });
      categoryIds.set(name, row!.id);
      log.push(`category ${name}`);
    }
  }

  let added = 0;
  for (const p of DEMO_PRODUCTS) {
    const [found] = await db
      .select({ id: t.products.id })
      .from(t.products)
      .where(
        and(
          eq(t.products.shopId, shopId),
          eq(t.products.name, p.name),
          isNull(t.products.deletedAt),
        ),
      );
    if (found) continue;
    const id = randomUUID();
    const full = `products/${shopId}/${randomUUID()}.png`;
    const thumb = `products/${shopId}/${randomUUID()}.png`;
    await store(full, await placeholderPhoto(p, 1200));
    await store(thumb, await placeholderPhoto(p, 400));
    const createdAt = new Date(Date.now() - p.ageDays * DAY);
    await db.transaction(async (tx) => {
      await tx.insert(t.products).values({
        id,
        shopId,
        categoryId: categoryIds.get(p.category)!,
        name: p.name,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        status: p.status ?? 'available',
        sizes: p.sizes ?? [],
        colours: p.colours ?? [],
        createdAt,
      });
      // units_sold is kept by order triggers; the demo has no orders, so set it directly.
      if (p.unitsSold) {
        await tx.update(t.products).set({ unitsSold: p.unitsSold }).where(eq(t.products.id, id));
      }
      await tx.insert(t.productPhotos).values({
        productId: id,
        objectKey: full,
        thumbKey: thumb,
        position: 0,
        width: 1200,
        height: 1200,
      });
    });
    added++;
  }
  log.push(`${added} products added (${DEMO_PRODUCTS.length - added} already there)`);
  console.log(`demo seed (${local ? 'local' : 'staging'}): ${log.join(', ')}`);
  console.log(`demo seed: shop /${DEMO_SHOP.slug}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`demo seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
