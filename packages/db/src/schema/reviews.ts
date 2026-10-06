import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products } from './catalogue';
import { createdAt, id, tstz, updatedAt } from './columns';
import { orderItems } from './orders';

/** One per delivered order. (order_id, shop_id) → orders(id, shop_id) is added in migration 0002. */
export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    orderId: uuid('order_id').notNull().unique(),
    shopId: uuid('shop_id').notNull(),
    /** "Wanjiku K." */
    buyerDisplayName: text('buyer_display_name').notNull(),
    rating: smallint('rating').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sellerReply: text('seller_reply'),
    repliedAt: tstz('replied_at'),
    editableUntil: tstz('editable_until').notNull(),
    /** The seller reported it (decision #73 a): its photos are hidden on public pages. */
    reportedAt: tstz('reported_at'),
    reportReason: text('report_reason'),
    /** The daily support digest mailed this report (decision #74 h). */
    reportNotifiedAt: tstz('report_notified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('reviews_shop_id_idx').on(t.shopId, t.createdAt.desc()),
    // Lets notifications reference (review_id, shop_id).
    uniqueIndex('reviews_id_shop_id').on(t.id, t.shopId),
    check('reviews_rating', sql`${t.rating} between 1 and 5`),
  ],
);

/** Per-item rating, text and photo (text lives here, decision #32). */
export const reviewItems = pgTable(
  'review_items',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    /** Null when the buyer didn't rate this item. */
    rating: smallint('rating'),
    text: text('text'),
    photoPath: text('photo_path'),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.orderItemId] }),
    index('review_items_product_id_idx').on(t.productId),
    check('review_items_rating', sql`${t.rating} is null or ${t.rating} between 1 and 5`),
  ],
);
