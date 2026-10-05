// Staging demo seed (milestones M4, owner Step 63): creates the "Demo Duka" shop with 12
// products, categories and generated placeholder photos. Resets on every run (decision #61 g,
// the repo is public): the shop's settings, payment account, delivery areas and product
// details go back to their intended values; photos are only added when missing; the sample
// orders (one per order state) are deleted and made again, links in the job summary. Run by the
// manual workflow demo-seed-staging.yml, or locally:
//   pnpm --filter @oda/web exec tsx --conditions=react-server server/demoSeed/run.ts
// Staging: DATABASE_URL (Neon staging) + STAGING_IMAGES_BLOB_READ_WRITE_TOKEN (images store).
// Locally: the local database and the local storage folder (.uploads).
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync } from 'node:fs';
import { put } from '@vercel/blob';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { schema } from '@oda/db';
import { getDb } from '../db';
import { writeLocalObject } from '../storage';
import {
  DEMO_CATEGORIES,
  DEMO_DELIVERY_AREAS,
  DEMO_OWNER,
  DEMO_PAYMENT_ACCOUNT,
  DEMO_PRODUCTS,
  DEMO_SETTINGS,
  DEMO_SHOP,
} from './data';
import { placeholderPhoto } from './images';
import { resetSampleOrders } from './orders';

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
        ...DEMO_SETTINGS,
        onboardingStep: 6,
        onboardingCompletedAt: new Date(),
      })
      .returning({ id: t.shops.id });
    log.push('shop created');
  }
  const shopId = shop!.id;

  // Settings, payment account and delivery areas: back to the intended state every run.
  await db
    .update(t.shops)
    .set({ ...DEMO_SHOP, ...DEMO_SETTINGS, suspendedAt: null, deletedAt: null })
    .where(eq(t.shops.id, shopId));
  // Orders keep their own snapshot of the account, so the rows can be replaced.
  await db.delete(t.paymentAccounts).where(eq(t.paymentAccounts.shopId, shopId));
  await db.insert(t.paymentAccounts).values({ shopId, ...DEMO_PAYMENT_ACCOUNT, isActive: true });
  for (const [position, area] of DEMO_DELIVERY_AREAS.entries()) {
    const [found] = await db
      .select({ id: t.deliveryAreas.id })
      .from(t.deliveryAreas)
      .where(
        and(
          eq(t.deliveryAreas.shopId, shopId),
          eq(t.deliveryAreas.name, area.name),
          isNull(t.deliveryAreas.deletedAt),
        ),
      );
    if (found) {
      await db
        .update(t.deliveryAreas)
        .set({ ...area, position })
        .where(eq(t.deliveryAreas.id, found.id));
    } else {
      await db.insert(t.deliveryAreas).values({ shopId, ...area, position });
    }
  }
  // Areas that aren't part of the demo (soft delete: past orders keep their area name).
  await db
    .update(t.deliveryAreas)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(t.deliveryAreas.shopId, shopId),
        isNull(t.deliveryAreas.deletedAt),
        notInArray(
          t.deliveryAreas.name,
          DEMO_DELIVERY_AREAS.map((a) => a.name),
        ),
      ),
    );
  log.push(
    `settings reset (pay now + pay on delivery, Till ${DEMO_PAYMENT_ACCOUNT.number}, ${DEMO_DELIVERY_AREAS.length} areas, pickup)`,
  );

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
    if (found) {
      // Reset what a test may have changed; units sold follow the orders.
      await db
        .update(t.products)
        .set({
          categoryId: categoryIds.get(p.category)!,
          price: p.price,
          compareAtPrice: p.compareAtPrice ?? null,
          status: p.status ?? 'available',
          sizes: p.sizes ?? [],
          colours: p.colours ?? [],
        })
        .where(eq(t.products.id, found.id));
      continue;
    }
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
  log.push(`${added} products added (${DEMO_PRODUCTS.length - added} already there, reset)`);

  // Sample orders, one per state the buyer pages show (M5), made again on every run.
  const samples = await resetSampleOrders(db, shopId, owner!.id);
  log.push(`${samples.length} sample orders`);
  const base = (process.env.PUBLIC_SHOP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const lines = samples.map((o) => `- ${o.label}: ${base}/o/${o.token}`);
  // The links go to the job summary (fake orders on a fake shop), not the log.
  const summary = process.env.GITHUB_STEP_SUMMARY;
  // Also a file the workflow keeps for a day (gh run download), since summaries are browser-only.
  if (process.env.DEMO_LINKS_FILE) {
    appendFileSync(process.env.DEMO_LINKS_FILE, `${lines.join('\n')}\n`);
  }
  if (summary) {
    appendFileSync(
      summary,
      `## Demo Duka sample orders\n\nFake orders; links change on every run.\n\n${lines.join('\n')}\n`,
    );
  } else {
    console.log(lines.join('\n'));
  }
  console.log(`demo seed (${local ? 'local' : 'staging'}): ${log.join(', ')}`);
  console.log(`demo seed: shop /${DEMO_SHOP.slug}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`demo seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
