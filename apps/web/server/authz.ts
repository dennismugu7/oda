import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { isOrderToken } from '@oda/shared';
import { getAuth } from './auth';
import { getDb } from './db';
import { serverEnv } from './env';
import { NotFoundError, ShopSuspendedError, UnauthorizedError } from './errors';
import { ensureProfile } from './profiles';

// The authorization layer (docs/data-model.md → Authorization). Every route handler and
// server component starts with one of these; repositories only accept the contexts they
// return. The brand makes a context impossible to build anywhere else.

declare const authorized: unique symbol;
type Branded<T, K extends string> = T & { readonly [authorized]: K };

export type UserCtx = Branded<{ userId: string }, 'user'>;
/** `suspended`: oda suspended the shop (decision #81 d); edits go through assertCanEditShop. */
export type SellerCtx = Branded<{ userId: string; shopId: string; suspended?: boolean }, 'seller'>;
export type OrderRow = typeof schema.orders.$inferSelect;
export type OrderTokenCtx = Branded<{ order: OrderRow }, 'order-token'>;
export type OpsCtx = Branded<{ ops: true }, 'ops'>;

/** Anything with request headers: a Request, or `{ headers: await headers() }`. */
export interface HasHeaders {
  headers: Headers;
}

async function sessionUserId(req: HasHeaders): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

/**
 * A signed-in user (onboarding steps 1–2, before a shop exists). Repairs a missing profile.
 * 401 without a session or when the account was deleted.
 */
export async function requireUser(req: HasHeaders, db: Db = getDb()): Promise<UserCtx> {
  const userId = await sessionUserId(req);
  if (!userId) throw new UnauthorizedError();
  await ensureProfile(db, userId);
  const profile = await db.query.profiles.findFirst({
    columns: { deletedAt: true },
    where: eq(schema.profiles.id, userId),
  });
  if (!profile || profile.deletedAt) throw new UnauthorizedError();
  return { userId } as UserCtx;
}

/** A signed-in seller with a (not deleted) shop. 401 without a session, 404 without a shop. */
export async function requireSeller(req: HasHeaders, db: Db = getDb()): Promise<SellerCtx> {
  const { userId } = await requireUser(req, db);
  const shop = await db.query.shops.findFirst({
    columns: { id: true, suspendedAt: true },
    where: and(eq(schema.shops.ownerId, userId), isNull(schema.shops.deletedAt)),
  });
  if (!shop) throw new NotFoundError("You don't have a shop yet.");
  return { userId, shopId: shop.id, suspended: !!shop.suspendedAt } as SellerCtx;
}

/**
 * A suspended shop (decision #81 d) can still finish its existing orders, read everything and
 * change the seller's own account, but can't create orders or edit the shop or catalogue:
 * 403 `shop_suspended` with the support email.
 */
export function assertCanEditShop(ctx: SellerCtx): void {
  if (ctx.suspended) throw new ShopSuspendedError(serverEnv().ODA_SUPPORT_EMAIL);
}

/** Buyer order access: only the order's public token. Anything else is 404. */
export async function requireOrderToken(token: unknown, db: Db = getDb()): Promise<OrderTokenCtx> {
  if (!isOrderToken(token)) throw new NotFoundError("We couldn't find this order.");
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.publicToken, token) });
  if (!order) throw new NotFoundError("We couldn't find this order.");
  return { order } as OrderTokenCtx;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time check of a Bearer secret (hashing first makes the lengths equal); 404 otherwise. */
export function assertBearer(request: HasHeaders, secret: string | undefined): void {
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !given || !timingSafeEqual(digest(given), digest(secret))) {
    throw new NotFoundError();
  }
}

/**
 * Manual ops workflows (GitHub Actions, decision #73 c): `Authorization: Bearer <OPS_SECRET>`.
 * No secret configured, no header or a wrong one: 404, so the routes stay invisible.
 */
export function requireOps(request: HasHeaders, secret = serverEnv().OPS_SECRET): OpsCtx {
  assertBearer(request, secret);
  return { ops: true } as OpsCtx;
}
