import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { schema as t, type Db } from '@oda/db';
import { shopSuspensionInput, type ShopSuspensionInput } from '@oda/shared';
import { requireOps, type OpsCtx } from './authz';
import { getDb } from './db';
import { NotFoundError, parseInput, toResponse } from './errors';

// Suspend / unsuspend a shop (decisions #72 d, #81 d): the shop-suspend workflow calls this
// with OPS_SECRET. Suspended = its page, products and checkout are 404 (publicRepo and
// checkout already skip suspended shops); the seller stays signed in, can finish existing
// orders but can't edit the shop or take new orders (assertCanEditShop). Every change writes
// an ops_events row; asking for the state the shop is already in changes and writes nothing.

export async function setShopSuspension(db: Db, _ctx: OpsCtx, input: ShopSuspensionInput) {
  const suspend = input.action === 'suspend';
  return db.transaction(async (tx) => {
    // The current link name only, exactly: never an old link or a partial match, so a typo
    // can't reach another shop (e.g. the demo shop). Deleted shops are gone already.
    const [shop] = await tx
      .select({
        id: t.shops.id,
        name: t.shops.name,
        slug: t.shops.slug,
        suspendedAt: t.shops.suspendedAt,
      })
      .from(t.shops)
      .where(and(eq(t.shops.slug, input.shopSlug), isNull(t.shops.deletedAt)))
      .for('update');
    if (!shop) throw new NotFoundError(`No shop has the link name "${input.shopSlug}".`);

    const already = suspend === !!shop.suspendedAt;
    if (already) {
      return { slug: shop.slug, suspended: suspend, changed: false, since: shop.suspendedAt };
    }
    const now = new Date();
    await tx
      .update(t.shops)
      .set({ suspendedAt: suspend ? now : null })
      .where(eq(t.shops.id, shop.id));
    await tx.insert(t.opsEvents).values({
      action: suspend ? 'shop_suspended' : 'shop_unsuspended',
      shopId: shop.id,
      targetId: shop.id,
      reason: input.reason,
      actor: input.actor,
      details: {
        slug: shop.slug,
        name: shop.name,
        suspendedAt: shop.suspendedAt?.toISOString() ?? null,
      },
    });
    return { slug: shop.slug, suspended: suspend, changed: true, since: suspend ? now : null };
  });
}

/** POST /api/ops/shops/suspension — Bearer OPS_SECRET; body { shopSlug, action, reason, actor }. */
export async function postShopSuspension(request: Request): Promise<Response> {
  try {
    const ctx = requireOps(request);
    const input = parseInput(shopSuspensionInput, await request.json().catch(() => null));
    const result = await setShopSuspension(getDb(), ctx, input);
    // Logs carry the link name and who ran it: no reasons (they may name people).
    console.info(
      `[ops] shop /${result.slug} ${input.action}${result.changed ? '' : ' (no change)'} by ${input.actor}`,
    );
    return Response.json(
      {
        shop: result.slug,
        suspended: result.suspended,
        changed: result.changed,
        since: result.since?.toISOString() ?? null,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return toResponse(error);
  }
}
