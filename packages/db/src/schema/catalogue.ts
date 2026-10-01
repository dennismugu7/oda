import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { shops } from './accounts';
import { createdAt, id, tstz, updatedAt } from './columns';
import { productStatus } from './enums';

export const categories = pgTable(
  'categories',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isVisible: boolean('is_visible').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('categories_shop_id_idx').on(t.shopId, t.position),
    // Lets products reference (category_id, shop_id): no cross-shop categories.
    uniqueIndex('categories_id_shop_id').on(t.id, t.shopId),
  ],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    /** Same-shop foreign key added in migration 0002 (on delete set null). */
    categoryId: uuid('category_id'),
    name: text('name').notNull(),
    description: text('description'),
    price: integer('price').notNull(),
    compareAtPrice: integer('compare_at_price'),
    status: productStatus('status').notNull().default('available'),
    sizes: text('sizes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** [{name, hex}] */
    colours: jsonb('colours')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Maintained by triggers: qty on orders currently confirmed/sent/delivered. */
    unitsSold: integer('units_sold').notNull().default(0),
    ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }),
    ratingCount: integer('rating_count').notNull().default(0),
    position: integer('position').notNull().default(0),
    deletedAt: tstz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('products_shop_listing_idx')
      .on(t.shopId, t.status, t.position)
      .where(sql`${t.deletedAt} is null`),
    index('products_category_id_idx').on(t.categoryId),
    index('products_search_idx').using(
      'gin',
      sql`to_tsvector('simple', ${t.name} || ' ' || coalesce(${t.description}, ''))`,
    ),
    check('products_price', sql`${t.price} >= 0`),
    check(
      'products_compare_at_price',
      sql`${t.compareAtPrice} is null or ${t.compareAtPrice} > ${t.price}`,
    ),
    check('products_counts', sql`${t.unitsSold} >= 0 and ${t.ratingCount} >= 0`),
  ],
);

/** Photos in R2: full (~1600px) and thumbnail (~400px), both made on the device. */
export const productPhotos = pgTable(
  'product_photos',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    /** 0 = cover */
    position: integer('position').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    createdAt: createdAt(),
  },
  (t) => [index('product_photos_product_id_idx').on(t.productId, t.position)],
);
