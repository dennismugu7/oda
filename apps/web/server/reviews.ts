import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  REVIEW_LIMITS,
  reviewInput,
  reviewRemoveInput,
  reviewReplyInput,
  reviewReportInput,
  reviewsQuery,
  reviewUploadInput,
} from '@oda/shared';
import { requireOps, requireSeller, type OpsCtx } from './authz';
import { assertSameOrigin, openOrder, type Defer } from './checkout';
import { getDb } from './db';
import {
  ConflictError,
  NotFoundError,
  parseInput,
  toResponse,
  TooManyRequestsError,
} from './errors';
import { sendSellerPushes } from './push';
import { hitLimit, secondsLeftInWindow } from './rateLimit';
import { buyerReviewRepo, sellerReviewsRepo } from './repos/reviews';
import { body, handle } from './routeHandler';
import { getStorage } from './storage';
import { flushDeletions, queueDeletions, storageStep } from './uploads';

// Review endpoints (M7, decision #73): the buyer's review through the order token (same Origin
// check and per-IP lookup limit as the other buyer endpoints), the seller's Reviews screen,
// and the ops removal called by the review-remove workflow.

const t = schema;
type Params<P> = { params: Promise<P> };
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

// Buyer ----------------------------------------------------------------------------------------

/** GET /api/o/:token/review — what the review page needs. */
export async function getBuyerReview(
  request: Request,
  { params }: Params<{ token: string }>,
): Promise<Response> {
  try {
    const db = getDb();
    const ctx = await openOrder(db, (await params).token, request.headers);
    return json(await buyerReviewRepo(db, ctx).form());
  } catch (error) {
    return toResponse(error);
  }
}

/** POST (create) / PUT (edit within 7 days) /api/o/:token/review. */
export async function writeBuyerReview(
  request: Request,
  { params }: Params<{ token: string }>,
  defer: Defer,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const ctx = await openOrder(db, (await params).token, request.headers);
    const input = parseInput(reviewInput, await body(request));
    const repo = buyerReviewRepo(db, ctx);
    if (request.method === 'PUT') {
      await repo.update(input);
      return json(await repo.form());
    }
    const { push } = await repo.create(input);
    defer(() =>
      sendSellerPushes(db, ctx.order.shopId, [
        {
          type: 'new_review',
          title: push.title,
          body: push.body,
          data: { type: 'new_review', orderId: push.orderId, reviewId: push.reviewId },
        },
      ]),
    );
    return json(await repo.form(), 201);
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * POST /api/o/:token/uploads — a signed upload for one review photo at a key under this
 * order's prefix (decision #73 k). The bytes are checked when the review is saved.
 */
export async function postReviewUpload(
  request: Request,
  { params }: Params<{ token: string }>,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const ctx = await openOrder(db, (await params).token, request.headers);
    const repo = buyerReviewRepo(db, ctx);
    if (!repo.canUpload()) {
      throw new ConflictError('You can add photos once your order is delivered.', 'not_delivered');
    }
    const input = parseInput(reviewUploadInput, await body(request));
    const l = REVIEW_LIMITS.uploadsPerOrder;
    if (!(await hitLimit(db, `review-upload:${ctx.order.id}`, l))) {
      throw new TooManyRequestsError(
        'Too many photos for now. Try again later.',
        secondsLeftInWindow(l),
      );
    }
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
      input.contentType
    ];
    const key = `${repo.photoPrefix}${randomUUID()}.${ext}`;
    const upload = await storageStep(() =>
      getStorage().presignPut(key, input.contentType, input.size),
    );
    return json({ key, publicUrl: getStorage().publicUrl(key), ...upload });
  } catch (error) {
    return toResponse(error);
  }
}

// Seller ---------------------------------------------------------------------------------------

/** GET /api/reviews?tab=all|needs_reply|low&cursor=… */
export const listReviews = handle(async (request) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  const query = parseInput(
    reviewsQuery,
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  return sellerReviewsRepo(db, ctx).list(query);
});

/** GET /api/reviews/:id */
export const getReview = handle(async (request, id) => {
  const db = getDb();
  return sellerReviewsRepo(db, await requireSeller(request, db)).get(id!);
});

/** PUT /api/reviews/:id/reply — body { reply } (empty removes it). */
export const putReviewReply = handle(async (request, id) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  const { reply } = parseInput(reviewReplyInput, await body(request));
  return sellerReviewsRepo(db, ctx).reply(id!, reply);
});

/** POST /api/reviews/:id/report — body { reason? }. */
export const postReviewReport = handle(async (request, id) => {
  const db = getDb();
  const ctx = await requireSeller(request, db);
  const { reason } = parseInput(reviewReportInput, (await body(request)) ?? {});
  return sellerReviewsRepo(db, ctx).report(id!, reason);
});

// Ops ------------------------------------------------------------------------------------------

/**
 * Removes a review (decision #73 c): an `ops_events` audit row with a snapshot, then the
 * delete in the same transaction. Items and notification rows cascade, the triggers
 * recompute the averages, and the photos are deleted from storage.
 */
export async function removeReview(
  db: Db,
  _ctx: OpsCtx,
  input: {
    reviewId?: string | undefined;
    shopSlug?: string | undefined;
    orderNumber?: number | undefined;
    reason: string;
    actor: string;
  },
) {
  const which = input.reviewId
    ? eq(t.reviews.id, input.reviewId)
    : and(eq(t.shops.slug, input.shopSlug ?? ''), eq(t.orders.number, input.orderNumber ?? 0));
  const { photos, snapshot } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ review: t.reviews, orderNumber: t.orders.number })
      .from(t.reviews)
      .innerJoin(t.orders, eq(t.orders.id, t.reviews.orderId))
      .innerJoin(t.shops, eq(t.shops.id, t.reviews.shopId))
      .where(which)
      .for('update', { of: t.reviews });
    if (!row) throw new NotFoundError('No review found for this id or order.');
    const items = await tx
      .select({ photoPath: t.reviewItems.photoPath })
      .from(t.reviewItems)
      .where(eq(t.reviewItems.reviewId, row.review.id));
    const photos = items.flatMap((i) => (i.photoPath ? [i.photoPath] : []));
    const r = row.review;
    const snapshot = {
      orderNumber: row.orderNumber,
      rating: r.rating,
      buyerDisplayName: r.buyerDisplayName,
      createdAt: r.createdAt.toISOString(),
      reportedAt: r.reportedAt?.toISOString() ?? null,
      reportReason: r.reportReason,
      photos: photos.length,
    };
    await tx.insert(t.opsEvents).values({
      action: 'review_removed',
      shopId: r.shopId,
      targetId: r.id,
      reason: input.reason,
      actor: input.actor,
      details: snapshot,
    });
    await queueDeletions(tx as unknown as Db, photos);
    await tx.delete(t.reviews).where(eq(t.reviews.id, r.id));
    return { photos, snapshot };
  });
  await flushDeletions(db, photos);
  return snapshot;
}

/** POST /api/ops/reviews/remove — Bearer OPS_SECRET; body { reviewId, reason, actor }. */
export async function postRemoveReview(request: Request): Promise<Response> {
  try {
    const ctx = requireOps(request);
    const db = getDb();
    const input = parseInput(reviewRemoveInput, await body(request));
    const removed = await removeReview(db, ctx, input);
    // Logs carry the order number only: no names or review text.
    console.info(`[ops] review removed (order #${removed.orderNumber}) by ${input.actor}`);
    return json({ removed: true, orderNumber: removed.orderNumber, rating: removed.rating });
  } catch (error) {
    return toResponse(error);
  }
}
