// Test-database helpers for Vitest (packages/db and apps/web). Never import from app code.
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { APP_ROLE, appRoleUrl, ensureAppRole } from './appRole';
import type { Db } from './client';
import { runMigrations } from './migrator';
import * as schema from './schema';

/**
 * The test database URL: DATABASE_URL with the database renamed to `name`. Each package uses
 * its own (apps/web: oda_test, packages/db: oda_db_test) because Turbo runs their tests in
 * parallel. Refuses any name not ending in _test, so tests can never wipe real data.
 */
export function testDatabaseUrl(name = 'oda_test'): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL to run the database tests');
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to use ${name} as a test database (name must end in _test)`);
  }
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Creates the test database if missing (connecting to the server's postgres database). */
async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const pool = new Pool({ connectionString: admin.toString(), max: 1 });
  try {
    const found = await pool.query('select 1 from pg_database where datname = $1', [name]);
    if (found.rowCount === 0) await pool.query(`create database "${name.replaceAll('"', '""')}"`);
  } finally {
    await pool.end();
  }
}

/** Vitest globalSetup: make sure the test database exists and is fully migrated. */
export async function prepareTestDatabase(
  name?: string,
  opts: { appRole?: boolean } = {},
): Promise<string> {
  const url = testDatabaseUrl(name);
  await ensureDatabase(url);
  await runMigrations(url);
  // apps/web's server tests run as the app's least-privilege role, like production (#93 D5),
  // so a query that needs more than row access fails here first.
  if (opts.appRole) await ensureAppRole({ ownerUrl: url, password: TEST_APP_ROLE_PASSWORD });
  return url;
}

/** Local and CI only: the password of the app role on the test server. */
const TEST_APP_ROLE_PASSWORD = 'oda-app-role-local-test-only-7f3k2';

/** The test database URL as the app role (see prepareTestDatabase). */
export function testAppRoleUrl(ownerUrl: string): string {
  return appRoleUrl(ownerUrl, TEST_APP_ROLE_PASSWORD, APP_ROLE);
}

let ownerPool: Pool | undefined;

/**
 * Test clean-up needs the owner role (TRUNCATE): when apps/web's setup sets
 * ODA_TEST_OWNER_DATABASE_URL, truncateAll uses that instead of the app-role connection.
 */
function cleanupDb(db: Db): Db | Pool {
  const owner = process.env.ODA_TEST_OWNER_DATABASE_URL;
  if (!owner) return db;
  ownerPool ??= new Pool({ connectionString: owner, max: 1, allowExitOnIdle: true });
  return ownerPool;
}

/** Empties every application and auth table (keeps the schema and migration history). */
export async function truncateAll(db: Db): Promise<void> {
  const target = cleanupDb(db);
  const run = async <T extends Record<string, unknown>>(text: string) =>
    target instanceof Pool
      ? (await target.query<T>(text)).rows
      : (await target.execute<T>(sql.raw(text))).rows;
  const tables = await run<{ name: string }>(
    `select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
  );
  if (tables.length === 0) return;
  const list = tables.map((r) => r.name).join(', ');
  await run(`truncate ${list} restart identity cascade`);
}

/** A seller (auth user + profile) with a shop, inserted directly (no Better Auth). */
export async function createShopFixture(
  db: Db,
  opts: { slug?: string; name?: string; email?: string } = {},
) {
  const userId = randomUUID();
  const tag = userId.slice(0, 8);
  await db.insert(schema.authUser).values({
    id: userId,
    name: opts.name ?? `Seller ${tag}`,
    email: opts.email ?? `seller-${tag}@example.test`,
  });
  await db.insert(schema.profiles).values({ id: userId });
  const [shop] = await db
    .insert(schema.shops)
    .values({
      ownerId: userId,
      name: opts.name ?? `Shop ${tag}`,
      slug: opts.slug ?? `shop-${tag}`,
      whatsappPhone: '+254712345678',
    })
    .returning();
  return { userId, shopId: shop!.id, shop: shop! };
}

type OrderRow = typeof schema.orders.$inferInsert;

/**
 * Inserts an order row with items directly (bypassing transitionOrder, for trigger tests).
 * Defaults to a buyer pay-now order awaiting payment.
 */
export async function insertOrderFixture(
  db: Db,
  shopId: string,
  items: { productId: string | null; qty: number; unitPrice: number }[],
  overrides: Partial<OrderRow> = {},
) {
  const [{ next }] = (
    await db.execute<{ next: number }>(
      sql`update shops set order_counter = order_counter + 1 where id = ${shopId} returning order_counter as next`,
    )
  ).rows as [{ next: number }];
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const [order] = await db
    .insert(schema.orders)
    .values({
      shopId,
      number: next,
      publicToken: randomBytes(9).toString('base64url'),
      status: 'awaiting_payment',
      paymentMethod: 'pay_before',
      buyerName: 'Wanjiku Mwangi',
      buyerPhone: '+254712345901',
      fulfilment: 'pickup',
      subtotal,
      deliveryFee: 0,
      total: subtotal,
      ...overrides,
    })
    .returning();
  if (items.length > 0) {
    await db.insert(schema.orderItems).values(
      items.map((i) => ({
        orderId: order!.id,
        productId: i.productId,
        nameSnapshot: 'Item',
        unitPrice: i.unitPrice,
        qty: i.qty,
      })),
    );
  }
  return order!;
}

/** Runs `fn` in a transaction that is allowed to change order status (like transitionOrder). */
export async function asTransition<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('oda.transition', 'on', true)`);
    return fn(tx as unknown as Db);
  });
}
