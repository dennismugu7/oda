import 'server-only';
import { and, asc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { assertCronSecret } from './cron';
import { getDb } from './db';
import { demoShopSlugs } from './demo';
import { serverEnv } from './env';
import { toResponse } from './errors';
import { getPrivateStorage, getStorage, listAll } from './storage';
import { queueDeletions } from './uploads';

// The daily purge (/api/cron/purge; decisions #72 c, #74 c, #75). Steps, each idempotent and
// batched, so a failed run is simply repeated by the next one:
//   1. accounts deleted more than 30 days ago: their stored files, then the auth user (the
//      profile, shop, orders, reviews and everything else cascade);
//   2. soft-deleted products after 30 days: the row and its photos, except any photo a past
//      order still shows as its thumbnail;
//   3. leftover storage_deletions (failed deletes): retried;
//   4. unreferenced files under products/, logos/, reviews/ older than 24 h (abandoned
//      uploads, review photos never submitted);
//   5. sign-up attempts older than 7 days.
// A dry run reports what each step would remove and removes nothing. Every run (dry or not)
// writes one ops_events audit row; every purged account writes its own. Logs: counts only.

const t = schema;
const DAY = 86_400_000;

export const PURGE_AFTER_DAYS = 30;
export const SIGNUP_ATTEMPTS_DAYS = 7;
export const UNREFERENCED_AFTER_HOURS = 24;
export const BATCH = { accounts: 20, products: 200, retries: 200, unreferenced: 500 };
/** Prefixes checked for unreferenced files (step 4). */
export const SWEPT_PREFIXES = ['products/', 'logos/', 'reviews/'] as const;

export interface PurgedAccount {
  userId: string;
  shopId: string | null;
  slug: string | null;
  deletedAt: string | null;
  files: number;
}

export interface PurgeReport {
  dryRun: boolean;
  accounts: PurgedAccount[];
  /** Deleted accounts left alone because their shop is a demo shop (never purged). */
  skippedDemo: string[];
  products: number;
  productFiles: number;
  /** Product photos kept because a past order still shows them. */
  keptForOrders: number;
  retried: number;
  unreferenced: number;
  signupAttempts: number;
  /** File deletes that failed; queued in storage_deletions for the next run. */
  failedFiles: number;
  more: boolean;
}

interface PurgeOptions {
  dryRun: boolean;
  now?: Date;
  /** Who ran it: the GitHub user for a manual run, "schedule" for the daily one. */
  actor?: string;
  demoSlugs?: Set<string>;
}

/** Where a key lives: feedback screenshots in the private store, the rest in the public one. */
function storeFor(key: string) {
  if (key.startsWith('feedback/')) return getPrivateStorage();
  return getStorage();
}

/** Deletes files; a failure queues the key for the next run instead of stopping the purge. */
async function deleteFiles(db: Db, keys: readonly string[]): Promise<number> {
  const failed: string[] = [];
  for (const key of new Set(keys)) {
    try {
      const store = storeFor(key);
      if (!store) throw new Error('private store not connected');
      await store.delete(key);
    } catch {
      failed.push(key);
    }
  }
  await queueDeletions(db, failed);
  return failed.length;
}

/** Every listed key under `prefix`, in the store that holds it (none when it isn't there). */
async function listKeys(prefix: string): Promise<string[]> {
  const store = storeFor(prefix);
  if (!store || store.driver === 'disabled') return [];
  const keys: string[] = [];
  for await (const object of listAll(store, prefix)) keys.push(object.key);
  return keys;
}

// 1. Deleted accounts --------------------------------------------------------------------

/** Accounts whose profile or shop was deleted more than 30 days ago, oldest first. */
async function dueAccounts(db: Db, cutoff: Date, limit: number) {
  return db
    .select({
      userId: t.profiles.id,
      profileDeletedAt: t.profiles.deletedAt,
      shopId: t.shops.id,
      slug: t.shops.slug,
      name: t.shops.name,
      shopDeletedAt: t.shops.deletedAt,
    })
    .from(t.profiles)
    .leftJoin(t.shops, eq(t.shops.ownerId, t.profiles.id))
    .where(
      or(
        and(isNotNull(t.profiles.deletedAt), lt(t.profiles.deletedAt, cutoff)),
        and(isNotNull(t.shops.deletedAt), lt(t.shops.deletedAt, cutoff)),
      ),
    )
    .orderBy(asc(sql`least(${t.profiles.deletedAt}, ${t.shops.deletedAt})`))
    .limit(limit);
}

/** Every stored file of one shop: rows that point at files, plus whatever its prefixes hold. */
async function shopFiles(db: Db, shopId: string): Promise<string[]> {
  const [photos, shop, reviewPhotos, covers, feedback] = await Promise.all([
    db
      .select({ objectKey: t.productPhotos.objectKey, thumbKey: t.productPhotos.thumbKey })
      .from(t.productPhotos)
      .innerJoin(t.products, eq(t.products.id, t.productPhotos.productId))
      .where(eq(t.products.shopId, shopId)),
    db.select({ logo: t.shops.logoPath }).from(t.shops).where(eq(t.shops.id, shopId)),
    db
      .select({ key: t.reviewItems.photoPath })
      .from(t.reviewItems)
      .innerJoin(t.reviews, eq(t.reviews.id, t.reviewItems.reviewId))
      .where(and(eq(t.reviews.shopId, shopId), isNotNull(t.reviewItems.photoPath))),
    db
      .select({ key: t.orderItems.coverPathSnapshot })
      .from(t.orderItems)
      .innerJoin(t.orders, eq(t.orders.id, t.orderItems.orderId))
      .where(and(eq(t.orders.shopId, shopId), isNotNull(t.orderItems.coverPathSnapshot))),
    db
      .select({ key: t.feedback.screenshotPath })
      .from(t.feedback)
      .where(and(eq(t.feedback.shopId, shopId), isNotNull(t.feedback.screenshotPath))),
  ]);
  const listed = (
    await Promise.all(
      [`products/${shopId}/`, `logos/${shopId}/`, `feedback/${shopId}/`].map(listKeys),
    )
  ).flat();
  return [
    ...photos.flatMap((p) => [p.objectKey, p.thumbKey]),
    ...shop.flatMap((s) => (s.logo ? [s.logo] : [])),
    ...[...reviewPhotos, ...covers, ...feedback].flatMap((r) => (r.key ? [r.key] : [])),
    ...listed,
  ].filter((key, i, all) => all.indexOf(key) === i);
}

// 4. Unreferenced files ------------------------------------------------------------------

/** Of `keys`, the ones some row still points at (an order's thumbnail counts). */
async function referenced(db: Db, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const found = await Promise.all([
    db
      .select({ key: t.productPhotos.objectKey })
      .from(t.productPhotos)
      .where(inArray(t.productPhotos.objectKey, keys)),
    db
      .select({ key: t.productPhotos.thumbKey })
      .from(t.productPhotos)
      .where(inArray(t.productPhotos.thumbKey, keys)),
    db.select({ key: t.shops.logoPath }).from(t.shops).where(inArray(t.shops.logoPath, keys)),
    db
      .select({ key: t.reviewItems.photoPath })
      .from(t.reviewItems)
      .where(inArray(t.reviewItems.photoPath, keys)),
    db
      .select({ key: t.orderItems.coverPathSnapshot })
      .from(t.orderItems)
      .where(inArray(t.orderItems.coverPathSnapshot, keys)),
  ]);
  return new Set(found.flat().flatMap((r) => (r.key ? [r.key] : [])));
}

// The run ---------------------------------------------------------------------------------

export async function purge(db: Db, opts: PurgeOptions): Promise<PurgeReport> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun;
  const demo = opts.demoSlugs ?? demoShopSlugs();
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * DAY);
  const report: PurgeReport = {
    dryRun,
    accounts: [],
    skippedDemo: [],
    products: 0,
    productFiles: 0,
    keptForOrders: 0,
    retried: 0,
    unreferenced: 0,
    signupAttempts: 0,
    failedFiles: 0,
    more: false,
  };

  // 1. Deleted accounts.
  const due = await dueAccounts(db, cutoff, BATCH.accounts + 1);
  report.more ||= due.length > BATCH.accounts;
  for (const account of due.slice(0, BATCH.accounts)) {
    if (account.slug && demo.has(account.slug)) {
      report.skippedDemo.push(account.slug);
      continue;
    }
    const files = account.shopId ? await shopFiles(db, account.shopId) : [];
    const deletedAt = account.shopDeletedAt ?? account.profileDeletedAt;
    report.accounts.push({
      userId: account.userId,
      shopId: account.shopId,
      slug: account.slug,
      deletedAt: deletedAt?.toISOString() ?? null,
      files: files.length,
    });
    if (dryRun) continue;
    report.failedFiles += await deleteFiles(db, files);
    await db.transaction(async (tx) => {
      const [counts] = account.shopId
        ? await tx
            .select({
              orders: sql<number>`(select count(*)::int from orders where shop_id = ${account.shopId})`,
              products: sql<number>`(select count(*)::int from products where shop_id = ${account.shopId})`,
            })
            .from(t.shops)
            .where(eq(t.shops.id, account.shopId))
        : [];
      await tx.insert(t.opsEvents).values({
        action: 'account_purged',
        shopId: account.shopId,
        targetId: account.userId,
        reason: `Deleted ${PURGE_AFTER_DAYS}+ days ago`,
        actor: opts.actor ?? 'schedule',
        details: {
          slug: account.slug,
          name: account.name,
          deletedAt: deletedAt?.toISOString() ?? null,
          orders: counts?.orders ?? 0,
          products: counts?.products ?? 0,
          files: files.length,
        },
      });
      // Cascades: profile → shop → products, orders, reviews, feedback, notifications…
      await tx.delete(t.authUser).where(eq(t.authUser.id, account.userId));
    });
  }

  // 2. Soft-deleted products after 30 days (live shops; a deleted shop goes in step 1).
  const products = await db
    .select({ id: t.products.id })
    .from(t.products)
    .innerJoin(t.shops, eq(t.shops.id, t.products.shopId))
    .where(and(isNotNull(t.products.deletedAt), lt(t.products.deletedAt, cutoff)))
    .orderBy(asc(t.products.deletedAt))
    .limit(BATCH.products + 1);
  report.more ||= products.length > BATCH.products;
  const productIds = products.slice(0, BATCH.products).map((p) => p.id);
  if (productIds.length) {
    const photos = await db
      .select({ objectKey: t.productPhotos.objectKey, thumbKey: t.productPhotos.thumbKey })
      .from(t.productPhotos)
      .where(inArray(t.productPhotos.productId, productIds));
    const keys = [...new Set(photos.flatMap((p) => [p.objectKey, p.thumbKey]))];
    const used = keys.length
      ? await db
          .select({ key: t.orderItems.coverPathSnapshot })
          .from(t.orderItems)
          .where(inArray(t.orderItems.coverPathSnapshot, keys))
      : [];
    const kept = new Set(used.map((u) => u.key));
    const gone = keys.filter((k) => !kept.has(k));
    report.products = productIds.length;
    report.productFiles = gone.length;
    report.keptForOrders = kept.size;
    if (!dryRun) {
      report.failedFiles += await deleteFiles(db, gone);
      // order_items.product_id and review_items.product_id become null (on delete set null);
      // the items keep their name, price and thumbnail snapshot.
      await db.delete(t.products).where(inArray(t.products.id, productIds));
    }
  }

  // 3. Leftover deletes from earlier (not ones queued in the last 10 minutes: in flight).
  const leftovers = await db
    .select({ key: t.storageDeletions.objectKey })
    .from(t.storageDeletions)
    .where(lt(t.storageDeletions.createdAt, new Date(now.getTime() - 10 * 60_000)))
    .orderBy(asc(t.storageDeletions.createdAt))
    .limit(BATCH.retries);
  report.retried = leftovers.length;
  if (!dryRun && leftovers.length) {
    const done: string[] = [];
    for (const { key } of leftovers) {
      try {
        const store = storeFor(key);
        if (!store) continue;
        await store.delete(key);
        done.push(key);
      } catch {
        report.failedFiles++;
      }
    }
    if (done.length) {
      await db.delete(t.storageDeletions).where(inArray(t.storageDeletions.objectKey, done));
    }
  }

  // 4. Unreferenced files older than 24 h.
  const oldEnough = now.getTime() - UNREFERENCED_AFTER_HOURS * 3_600_000;
  const orphans: string[] = [];
  const publicStore = getStorage();
  sweep: for (const prefix of publicStore.driver === 'disabled' ? [] : SWEPT_PREFIXES) {
    let page: string[] = [];
    const check = async () => {
      const used = await referenced(db, page);
      orphans.push(...page.filter((k) => !used.has(k)));
      page = [];
    };
    for await (const object of listAll(publicStore, prefix)) {
      if (object.uploadedAt.getTime() >= oldEnough) continue;
      page.push(object.key);
      if (page.length === 200) await check();
      if (orphans.length >= BATCH.unreferenced) {
        report.more = true;
        break sweep;
      }
    }
    await check();
  }
  const sweptOrphans = orphans.slice(0, BATCH.unreferenced);
  report.unreferenced = sweptOrphans.length;
  if (!dryRun) report.failedFiles += await deleteFiles(db, sweptOrphans);

  // 5. Sign-up attempts older than 7 days (never used: a used one is deleted at sign-up).
  const attemptsCutoff = new Date(now.getTime() - SIGNUP_ATTEMPTS_DAYS * DAY);
  if (dryRun) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.signupAttempts)
      .where(lt(t.signupAttempts.createdAt, attemptsCutoff));
    report.signupAttempts = row?.n ?? 0;
  } else {
    const removed = await db
      .delete(t.signupAttempts)
      .where(lt(t.signupAttempts.createdAt, attemptsCutoff))
      .returning({ id: t.signupAttempts.id });
    report.signupAttempts = removed.length;
  }

  await db.insert(t.opsEvents).values({
    action: dryRun ? 'purge_dry_run' : 'purge_run',
    reason: dryRun ? 'Dry run: nothing removed' : 'Daily purge',
    actor: opts.actor ?? 'schedule',
    details: { ...summary(report), slugs: report.accounts.map((a) => a.slug) },
  });
  return report;
}

/** The counts of a run (logs and the audit row; no names or addresses). */
export function summary(report: PurgeReport) {
  return {
    dryRun: report.dryRun,
    accounts: report.accounts.length,
    accountFiles: report.accounts.reduce((n, a) => n + a.files, 0),
    skippedDemo: report.skippedDemo.length,
    products: report.products,
    productFiles: report.productFiles,
    keptForOrders: report.keptForOrders,
    retried: report.retried,
    unreferenced: report.unreferenced,
    signupAttempts: report.signupAttempts,
    failedFiles: report.failedFiles,
    more: report.more,
  };
}

const ACTOR = /^[A-Za-z0-9-]{1,39}$/;

/**
 * POST /api/cron/purge (Bearer CRON_SECRET). Body `{ "dryRun": true }` reports without
 * removing; the GitHub user who ran it comes in `x-oda-actor`.
 */
export async function postPurge(
  request: Request,
  secret = serverEnv().CRON_SECRET,
): Promise<Response> {
  try {
    assertCronSecret(request, secret);
    const body = (await request.json().catch(() => null)) as { dryRun?: unknown } | null;
    const dryRun = body?.dryRun === true;
    const header = request.headers.get('x-oda-actor') ?? '';
    const actor = ACTOR.test(header) ? header : 'schedule';
    const report = await purge(getDb(), { dryRun, actor });
    const counts = summary(report);
    console.info(
      `[cron] purge${dryRun ? ' (dry run)' : ''}: ${counts.accounts} accounts, ${counts.products} products, ${counts.unreferenced} unreferenced, ${counts.retried} retried, ${counts.signupAttempts} sign-up attempts, ${counts.failedFiles} failed`,
    );
    return Response.json(
      { ...counts, slugs: report.accounts.map((a) => a.slug), skippedDemo: report.skippedDemo },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return toResponse(error);
  }
}
