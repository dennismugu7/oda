import 'server-only';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  canReviewOrder,
  LOW_RATING_MAX,
  REVIEW_EDIT_DAYS,
  REVIEW_LIMITS,
  reviewDisplayName,
  starText,
  type ReviewTab,
  type reviewInput,
} from '@oda/shared';
import type { z } from 'zod';
import type { OrderTokenCtx, SellerCtx } from '../authz';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from '../errors';
import { hitLimit, secondsLeftInWindow } from '../rateLimit';
import { checkStoredBytes, flushDeletions, publicUrl, queueDeletions } from '../uploads';
import { checkId } from './util';

// Reviews (M7, docs/m7-plan.md, decision #73). The buyer writes and edits their order's
// review through the order token; the seller reads, replies to and reports their shop's
// reviews; public pages read a product's reviews. Aggregates follow by trigger (0002).

const t = schema;
type ReviewWrite = z.output<typeof reviewInput>;
type ReviewRow = typeof t.reviews.$inferSelect;

export const REVIEW_PAGE_SIZE = 20;
const DAY_MS = 86_400_000;

// Pages are keyed by (created time in ms, id), compared on the time truncated to milliseconds.
const createdMs = sql<Date>`date_trunc('milliseconds', ${t.reviews.createdAt})`;
const cursorOf = (r: { createdAt: Date; id: string }) => `${r.createdAt.getTime()}_${r.id}`;
function afterCursor(cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const [ms, id] = cursor.split('_') as [string, string];
  const at = new Date(Number(ms));
  return or(lt(createdMs, at), and(eq(createdMs, at), lt(t.reviews.id, checkId(id, 'page'))));
}

/** The notification row and push text for a new review (decision #73 h). */
export function newReviewText(
  review: { rating: number; buyerDisplayName: string; tags: string[] },
  orderNumber: number,
  texts: (string | null)[],
): { title: string; body: string } {
  const text = texts.find((x) => x);
  const body = text
    ? text.length > 120
      ? `${text.slice(0, 117)}…`
      : text
    : review.tags.length
      ? review.tags.join(' · ')
      : `${review.rating} out of 5`;
  return {
    title: `${starText(review.rating)} from ${review.buyerDisplayName} · #${orderNumber}`,
    body,
  };
}

/** Why an order can't be reviewed, as the API's 409. */
function notReviewable(order: { status: string; source: string }): ConflictError {
  return order.source === 'manual'
    ? new ConflictError(
        'Reviews are for orders placed in the shop. This order can’t be reviewed.',
        'review_not_allowed',
      )
    : new ConflictError('You can rate your order once it’s delivered.', 'not_delivered');
}

// Buyer ----------------------------------------------------------------------------------------

export function buyerReviewRepo(db: Db, ctx: OrderTokenCtx) {
  const order = ctx.order;
  const photoPrefix = `reviews/${order.id}/`;

  async function orderItems() {
    return db
      .select({
        id: t.orderItems.id,
        productId: t.orderItems.productId,
        name: t.orderItems.nameSnapshot,
        size: t.orderItems.size,
        colour: t.orderItems.colour,
        coverPath: t.orderItems.coverPathSnapshot,
      })
      .from(t.orderItems)
      .where(eq(t.orderItems.orderId, order.id))
      .orderBy(asc(t.orderItems.createdAt));
  }

  async function current() {
    const [review] = await db.select().from(t.reviews).where(eq(t.reviews.orderId, order.id));
    if (!review) return null;
    const items = await db
      .select()
      .from(t.reviewItems)
      .where(eq(t.reviewItems.reviewId, review.id));
    return { review, items };
  }

  /** Item ids must be this order's own (once each); photos must be under this order's prefix. */
  async function checkInput(input: ReviewWrite, keptPhotos: ReadonlySet<string>) {
    const own = await orderItems();
    const ids = new Set(own.map((i) => i.id));
    const seen = new Set<string>();
    for (const item of input.items) {
      if (!ids.has(item.orderItemId) || seen.has(item.orderItemId)) {
        throw new ValidationError('Some items aren’t part of this order. Refresh and try again.');
      }
      seen.add(item.orderItemId);
      const key = item.photoKey;
      if (!key) continue;
      if (!key.startsWith(photoPrefix) || key.length === photoPrefix.length || key.includes('..')) {
        throw new ForbiddenError('This photo upload is not valid.');
      }
      if (!keptPhotos.has(key)) await checkStoredBytes(key, db);
    }
    const byId = new Map(own.map((i) => [i.id, i]));
    return input.items
      .filter((i) => i.rating !== null || i.text !== null || i.photoKey !== null)
      .map((i) => ({
        orderItemId: i.orderItemId,
        productId: byId.get(i.orderItemId)!.productId,
        rating: i.rating,
        text: i.text,
        photoPath: i.photoKey,
      }));
  }

  async function limitWrites() {
    const l = REVIEW_LIMITS.writesPerOrder;
    if (!(await hitLimit(db, `review-write:${order.id}`, l))) {
      throw new TooManyRequestsError(
        'You’ve changed this review many times today. Try again tomorrow.',
        secondsLeftInWindow(l),
      );
    }
  }

  return {
    /** What the review page (5d) needs. */
    async form(now = new Date()) {
      const [shop, items, mine] = await Promise.all([
        db.query.shops.findFirst({
          columns: { name: true, slug: true, logoPath: true },
          where: eq(t.shops.id, order.shopId),
        }),
        orderItems(),
        current(),
      ]);
      return {
        order: {
          number: order.number,
          token: order.publicToken,
          status: order.status,
          deliveredAt: order.deliveredAt,
          reviewable: canReviewOrder(order),
          manual: order.source === 'manual',
        },
        shop: shop ? { name: shop.name, slug: shop.slug, logoUrl: publicUrl(shop.logoPath) } : null,
        displayName: reviewDisplayName(order.buyerName),
        items: items.map((i) => ({
          orderItemId: i.id,
          name: i.name,
          size: i.size,
          colour: i.colour,
          coverUrl: publicUrl(i.coverPath),
        })),
        review: mine
          ? {
              rating: mine.review.rating,
              tags: mine.review.tags,
              createdAt: mine.review.createdAt,
              editableUntil: mine.review.editableUntil,
              editable: mine.review.editableUntil > now,
              items: mine.items.map((i) => ({
                orderItemId: i.orderItemId,
                rating: i.rating,
                text: i.text,
                photoKey: i.photoPath,
                photoUrl: publicUrl(i.photoPath),
              })),
            }
          : null,
      };
    },

    /** The review's creation time, or null (the order page's timeline). */
    async reviewedAt(): Promise<Date | null> {
      const [row] = await db
        .select({ createdAt: t.reviews.createdAt })
        .from(t.reviews)
        .where(eq(t.reviews.orderId, order.id));
      return row?.createdAt ?? null;
    },

    /**
     * Writes the order's review with a `new_review` notification row, in one transaction.
     * Returns what the push needs (sent after the response).
     */
    async create(input: ReviewWrite, now = new Date()) {
      if (!canReviewOrder(order)) throw notReviewable(order);
      await limitWrites();
      const rows = await checkInput(input, new Set());
      const buyerDisplayName = reviewDisplayName(order.buyerName);
      return db.transaction(async (tx) => {
        const [review] = await tx
          .insert(t.reviews)
          .values({
            orderId: order.id,
            shopId: order.shopId,
            buyerDisplayName,
            rating: input.rating,
            tags: input.tags,
            editableUntil: new Date(now.getTime() + REVIEW_EDIT_DAYS * DAY_MS),
            createdAt: now,
          })
          .onConflictDoNothing({ target: t.reviews.orderId })
          .returning();
        if (!review) {
          throw new ConflictError('You’ve already reviewed this order.', 'already_reviewed');
        }
        if (rows.length) {
          await tx.insert(t.reviewItems).values(rows.map((r) => ({ ...r, reviewId: review.id })));
        }
        const text = newReviewText(
          review,
          order.number,
          rows.map((r) => r.text),
        );
        await tx.insert(t.notifications).values({
          shopId: order.shopId,
          type: 'new_review',
          orderId: order.id,
          reviewId: review.id,
          ...text,
        });
        return { review, push: { ...text, orderId: order.id, reviewId: review.id } };
      });
    },

    /** Edits the review within its 7 days; photos no longer used are deleted. No push. */
    async update(input: ReviewWrite, now = new Date()) {
      if (!canReviewOrder(order)) throw notReviewable(order);
      const mine = await current();
      if (!mine) throw new NotFoundError('You haven’t reviewed this order yet.');
      const locked = () =>
        new ConflictError(
          `Reviews can be changed for ${REVIEW_EDIT_DAYS} days. This one can’t be changed any more.`,
          'review_locked',
        );
      if (mine.review.editableUntil <= now) throw locked();
      await limitWrites();
      const oldPhotos = new Set(mine.items.flatMap((i) => (i.photoPath ? [i.photoPath] : [])));
      const rows = await checkInput(input, oldPhotos);
      const kept = new Set(rows.flatMap((r) => (r.photoPath ? [r.photoPath] : [])));
      const removed = [...oldPhotos].filter((k) => !kept.has(k));
      const review = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(t.reviews)
          .set({ rating: input.rating, tags: input.tags })
          .where(and(eq(t.reviews.id, mine.review.id), sql`${t.reviews.editableUntil} > ${now}`))
          .returning();
        if (!updated) throw locked();
        await tx.delete(t.reviewItems).where(eq(t.reviewItems.reviewId, updated.id));
        if (rows.length) {
          await tx.insert(t.reviewItems).values(rows.map((r) => ({ ...r, reviewId: updated.id })));
        }
        await queueDeletions(tx as unknown as Db, removed);
        return updated;
      });
      await flushDeletions(db, removed);
      return { review };
    },

    /** Whether review photos may be uploaded for this order now. */
    canUpload(): boolean {
      return canReviewOrder(order);
    },
    photoPrefix,
  };
}

// Seller ---------------------------------------------------------------------------------------

type SellerReviewRow = ReviewRow & { orderNumber: number };

export function sellerReviewsRepo(db: Db, ctx: SellerCtx) {
  const inShop = eq(t.reviews.shopId, ctx.shopId);
  const TAB_FILTER: Record<ReviewTab, SQL | undefined> = {
    all: undefined,
    needs_reply: isNull(t.reviews.sellerReply),
    low: lte(t.reviews.rating, LOW_RATING_MAX),
  };

  async function withItems(rows: SellerReviewRow[]) {
    const ids = rows.map((r) => r.id);
    const items = ids.length
      ? await db
          .select({
            reviewId: t.reviewItems.reviewId,
            orderItemId: t.reviewItems.orderItemId,
            productId: t.reviewItems.productId,
            productName: t.orderItems.nameSnapshot,
            coverPath: t.orderItems.coverPathSnapshot,
            rating: t.reviewItems.rating,
            text: t.reviewItems.text,
            photoPath: t.reviewItems.photoPath,
          })
          .from(t.reviewItems)
          .innerJoin(t.orderItems, eq(t.orderItems.id, t.reviewItems.orderItemId))
          .where(inArray(t.reviewItems.reviewId, ids))
          .orderBy(asc(t.orderItems.createdAt))
      : [];
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      buyerDisplayName: r.buyerDisplayName,
      rating: r.rating,
      tags: r.tags,
      createdAt: r.createdAt,
      edited: r.updatedAt.getTime() - r.createdAt.getTime() > 1000,
      sellerReply: r.sellerReply,
      repliedAt: r.repliedAt,
      reportedAt: r.reportedAt,
      /** Photos are hidden on public pages once reported (decision #73 a). */
      photosHidden: r.reportedAt !== null,
      items: items
        .filter((i) => i.reviewId === r.id)
        .map((i) => ({
          orderItemId: i.orderItemId,
          productId: i.productId,
          productName: i.productName,
          coverUrl: publicUrl(i.coverPath),
          rating: i.rating,
          text: i.text,
          photoUrl: publicUrl(i.photoPath),
        })),
    }));
  }

  const selectRows = () =>
    db
      .select({ review: t.reviews, orderNumber: t.orders.number })
      .from(t.reviews)
      .innerJoin(t.orders, eq(t.orders.id, t.reviews.orderId));
  const flat = (rows: { review: ReviewRow; orderNumber: number }[]) =>
    rows.map((r) => ({ ...r.review, orderNumber: r.orderNumber }));

  async function one(id: string) {
    const rows = await selectRows().where(and(inShop, eq(t.reviews.id, checkId(id, 'review'))));
    if (!rows[0]) throw new NotFoundError('We couldn’t find this review.');
    const [review] = await withItems(flat(rows));
    return review!;
  }

  return {
    /** 20b-reviews: summary (average, count, 5→1 histogram, tab counts) + one page. */
    async list(query: { tab: ReviewTab; cursor?: string | undefined }) {
      const [histogram, [counts], [shop]] = await Promise.all([
        db
          .select({ rating: t.reviews.rating, n: count() })
          .from(t.reviews)
          .where(inShop)
          .groupBy(t.reviews.rating),
        db
          .select({
            all: count(),
            needsReply: sql<number>`count(*) filter (where ${t.reviews.sellerReply} is null)::int`,
            low: sql<number>`count(*) filter (where ${t.reviews.rating} <= ${LOW_RATING_MAX})::int`,
          })
          .from(t.reviews)
          .where(inShop),
        db
          .select({ avg: t.shops.ratingAvg, n: t.shops.ratingCount })
          .from(t.shops)
          .where(eq(t.shops.id, ctx.shopId)),
      ]);
      const rows = await selectRows()
        .where(and(inShop, TAB_FILTER[query.tab], afterCursor(query.cursor)))
        .orderBy(desc(createdMs), desc(t.reviews.id))
        .limit(REVIEW_PAGE_SIZE + 1);
      const page = flat(rows).slice(0, REVIEW_PAGE_SIZE);
      const last = page.at(-1);
      return {
        summary: {
          average: shop?.avg !== null && shop?.avg !== undefined ? Number(shop.avg) : null,
          count: shop?.n ?? 0,
          histogram: [5, 4, 3, 2, 1].map((stars) => ({
            stars,
            count: histogram.find((h) => h.rating === stars)?.n ?? 0,
          })),
        },
        counts: {
          all: counts?.all ?? 0,
          needs_reply: counts?.needsReply ?? 0,
          low: counts?.low ?? 0,
        },
        reviews: await withItems(page),
        next: rows.length > REVIEW_PAGE_SIZE && last ? cursorOf(last) : null,
      };
    },

    get: one,

    /** One reply per review, editable; an empty reply removes it. */
    async reply(id: string, reply: string | null) {
      const updated = await db
        .update(t.reviews)
        .set({ sellerReply: reply, repliedAt: reply ? new Date() : null })
        .where(and(inShop, eq(t.reviews.id, checkId(id, 'review'))))
        .returning({ id: t.reviews.id });
      if (!updated[0]) throw new NotFoundError('We couldn’t find this review.');
      return one(id);
    },

    /**
     * Reports a review (decision #73 a): its photos are hidden on public pages at once; stars
     * and text stay and it still counts. Reporting again changes nothing.
     */
    async report(id: string, reason: string | null) {
      const review = await one(id);
      if (review.reportedAt) return review;
      const l = REVIEW_LIMITS.reportsPerShop;
      if (!(await hitLimit(db, `review-report:${ctx.shopId}`, l))) {
        throw new TooManyRequestsError(
          'You’ve reported several reviews today. Try again tomorrow.',
          secondsLeftInWindow(l),
        );
      }
      await db
        .update(t.reviews)
        .set({ reportedAt: new Date(), reportReason: reason })
        .where(and(inShop, eq(t.reviews.id, review.id), isNull(t.reviews.reportedAt)));
      return one(id);
    },
  };
}

// Public ---------------------------------------------------------------------------------------

/**
 * A product's reviews for its public page, newest first: the shown name, overall stars, this
 * product's item (stars, text, photo unless the review was reported), tags and the seller's
 * reply. Never the buyer's phone, email or order number.
 */
export async function productReviews(db: Db, shopId: string, productId: string, cursor?: string) {
  const rows = await db
    .select({
      id: t.reviews.id,
      buyerDisplayName: t.reviews.buyerDisplayName,
      rating: t.reviews.rating,
      tags: t.reviews.tags,
      sellerReply: t.reviews.sellerReply,
      reportedAt: t.reviews.reportedAt,
      createdAt: t.reviews.createdAt,
      itemRating: t.reviewItems.rating,
      text: t.reviewItems.text,
      photoPath: t.reviewItems.photoPath,
    })
    .from(t.reviews)
    .innerJoin(t.reviewItems, eq(t.reviewItems.reviewId, t.reviews.id))
    .where(
      and(
        eq(t.reviews.shopId, shopId),
        eq(t.reviewItems.productId, checkId(productId, 'product')),
        afterCursor(cursor),
      ),
    )
    .orderBy(desc(createdMs), desc(t.reviews.id))
    .limit((REVIEW_PAGE_SIZE + 1) * 2);
  // The same product twice in one order (two sizes) gives two rows: keep the first.
  const unique = rows.filter((r, i) => rows.findIndex((x) => x.id === r.id) === i);
  const page = unique.slice(0, REVIEW_PAGE_SIZE);
  const last = page.at(-1);
  return {
    reviews: page.map((r) => ({
      id: r.id,
      buyerDisplayName: r.buyerDisplayName,
      rating: r.rating,
      itemRating: r.itemRating,
      text: r.text,
      photoUrl: r.reportedAt ? null : publicUrl(r.photoPath),
      tags: r.tags,
      sellerReply: r.sellerReply,
      createdAt: r.createdAt,
    })),
    next: unique.length > REVIEW_PAGE_SIZE && last ? cursorOf(last) : null,
  };
}
