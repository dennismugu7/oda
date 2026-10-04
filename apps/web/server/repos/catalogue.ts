import 'server-only';
import { and, asc, count, desc, eq, gt, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  PRODUCT_UNDO_MINUTES,
  type CategoryInput,
  type CategoryUpdate,
  type ProductInput,
  type ProductPhotoList,
  type ProductStatus,
  type ProductUpdate,
} from '@oda/shared';
import type { SellerCtx } from '../authz';
import { NotFoundError, ValidationError } from '../errors';
import { flushDeletions, publicUrl, queueDeletions, verifyStoredImage } from '../uploads';
import { sellerRepo } from './seller';
import { checkId } from './util';

// The seller's catalogue (M3, spec §5.4): products with their photos, and categories. Built
// on sellerRepo, so every query stays inside the seller's shop (another shop's row is a 404).
// Photo files go through the same checks as onboarding (decision #52): new keys must be under
// the shop's own prefix and be real JPEG/PNG/WebP files without location data, and replaced
// files are deleted from storage.

const t = schema;

type PhotoRow = typeof t.productPhotos.$inferSelect;

const photoView = (p: PhotoRow) => ({
  id: p.id,
  objectKey: p.objectKey,
  thumbKey: p.thumbKey,
  position: p.position,
  width: p.width,
  height: p.height,
  url: publicUrl(p.objectKey),
  thumbUrl: publicUrl(p.thumbKey),
});

export interface ProductFilter {
  status?: ProductStatus;
  /** A category id, or 'none' for products without one. */
  categoryId?: string;
}

export function catalogueRepo(db: Db, ctx: SellerCtx) {
  const { shopId } = ctx;
  const seller = sellerRepo(db, ctx);
  const live = and(eq(t.products.shopId, shopId), isNull(t.products.deletedAt));

  /** Checks new photo files; keys already on this product were checked when added. */
  async function verifyNewPhotos(photos: ProductPhotoList, known: ReadonlySet<string>) {
    for (const photo of photos) {
      for (const key of [photo.objectKey, photo.thumbKey]) {
        if (!known.has(key)) await verifyStoredImage(ctx, key, ['products'], db);
      }
    }
  }

  async function covers(productIds: string[]) {
    if (productIds.length === 0) return new Map<string, string | null>();
    const rows = await db
      .select({ productId: t.productPhotos.productId, thumbKey: t.productPhotos.thumbKey })
      .from(t.productPhotos)
      .where(and(inArray(t.productPhotos.productId, productIds), eq(t.productPhotos.position, 0)));
    return new Map(rows.map((r) => [r.productId, publicUrl(r.thumbKey)]));
  }

  async function product(id: string) {
    const { photos, ...row } = await seller.getProduct(id);
    return { ...row, photos: photos.map(photoView) };
  }

  /** The Shop tab: products (newest first) with their cover, and counts for the filters. */
  async function listProducts(filter: ProductFilter = {}) {
    const conditions = [live];
    if (filter.status) conditions.push(eq(t.products.status, filter.status));
    if (filter.categoryId === 'none') conditions.push(isNull(t.products.categoryId));
    else if (filter.categoryId) {
      conditions.push(eq(t.products.categoryId, checkId(filter.categoryId, 'category')));
    }
    const rows = await db
      .select()
      .from(t.products)
      .where(and(...conditions))
      .orderBy(asc(t.products.position), desc(t.products.createdAt));
    const coverOf = await covers(rows.map((r) => r.id));
    const byStatus = await db
      .select({ status: t.products.status, n: count() })
      .from(t.products)
      .where(live)
      .groupBy(t.products.status);
    const counts = { all: 0, available: 0, sold_out: 0, hidden: 0 };
    for (const { status, n } of byStatus) {
      counts[status] = n;
      counts.all += n;
    }
    return {
      products: rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
        compareAtPrice: r.compareAtPrice,
        status: r.status,
        categoryId: r.categoryId,
        sizes: r.sizes,
        colours: r.colours,
        unitsSold: r.unitsSold,
        coverUrl: coverOf.get(r.id) ?? null,
        updatedAt: r.updatedAt,
      })),
      counts,
    };
  }

  /** 20b-categories: in order, with how many products each has and a thumbnail. */
  async function listCategories() {
    const categories = await seller.listCategories();
    if (categories.length === 0) return [];
    const products = await db
      .select({ id: t.products.id, categoryId: t.products.categoryId })
      .from(t.products)
      .where(
        and(
          live,
          inArray(
            t.products.categoryId,
            categories.map((c) => c.id),
          ),
        ),
      )
      .orderBy(asc(t.products.position), desc(t.products.createdAt));
    const coverOf = await covers(products.map((p) => p.id));
    return categories.map((c) => {
      const mine = products.filter((p) => p.categoryId === c.id);
      return {
        id: c.id,
        name: c.name,
        isVisible: c.isVisible,
        position: c.position,
        productCount: mine.length,
        // Up to three covers, shown overlapping in 20b-categories.
        thumbUrls: mine
          .map((p) => coverOf.get(p.id))
          .filter((url): url is string => !!url)
          .slice(0, 3),
      };
    });
  }

  return {
    product,

    listProducts,

    /** A new product with its photos (1–5, the first is the cover). */
    async createProduct(input: ProductInput, photos: ProductPhotoList) {
      await verifyNewPhotos(photos, new Set());
      const id = await db.transaction(async (tx) => {
        const scoped = sellerRepo(tx as unknown as Db, ctx);
        const row = await scoped.createProduct(input);
        for (const [position, photo] of photos.entries()) {
          await scoped.addProductPhoto(row.id, { ...photo, position });
        }
        return row.id;
      });
      return product(id);
    },

    async updateProduct(id: string, input: ProductUpdate) {
      await seller.updateProduct(id, input);
      return product(id);
    },

    /** Replaces the photo list (add, remove, reorder, new cover) in one go. */
    async setPhotos(id: string, photos: ProductPhotoList) {
      const current = await product(id);
      const known = new Set(current.photos.flatMap((p) => [p.objectKey, p.thumbKey]));
      await verifyNewPhotos(photos, known);
      const kept = new Set(photos.flatMap((p) => [p.objectKey, p.thumbKey]));
      const removed = [...known].filter((key) => !kept.has(key));
      await db.transaction(async (tx) => {
        const scoped = sellerRepo(tx as unknown as Db, ctx);
        await tx.delete(t.productPhotos).where(eq(t.productPhotos.productId, current.id));
        for (const [position, photo] of photos.entries()) {
          await scoped.addProductPhoto(current.id, { ...photo, position });
        }
        await queueDeletions(tx as unknown as Db, removed);
      });
      await flushDeletions(db, removed);
      return product(id);
    },

    /** Soft delete: gone from the seller's lists; past orders keep their snapshot. */
    async deleteProduct(id: string) {
      await seller.deleteProduct(id);
    },

    /** "Undo" a delete, for a few minutes afterwards. */
    async restoreProduct(id: string) {
      const since = new Date(Date.now() - PRODUCT_UNDO_MINUTES * 60_000);
      const [row] = await db
        .update(t.products)
        .set({ deletedAt: null })
        .where(
          and(
            eq(t.products.id, checkId(id, 'product')),
            eq(t.products.shopId, shopId),
            gt(t.products.deletedAt, since),
          ),
        )
        .returning({ id: t.products.id });
      if (!row) throw new NotFoundError("This product can't be brought back any more.");
      return product(row.id);
    },

    // Categories ---------------------------------------------------------------------------

    listCategories,

    /** New categories go to the end of the list. */
    async createCategory(input: CategoryInput) {
      const [last] = await db
        .select({ max: sql<number | null>`max(${t.categories.position})` })
        .from(t.categories)
        .where(eq(t.categories.shopId, shopId));
      return seller.createCategory({ ...input, position: (last?.max ?? -1) + 1 });
    },

    updateCategory: (id: string, input: CategoryUpdate) => seller.updateCategory(id, input),

    /** Its products stay, without a category. */
    deleteCategory: (id: string) => seller.deleteCategory(id),

    /** Saves a new order; the list must be exactly the shop's categories. */
    async reorderCategories(ids: string[]) {
      const current = await seller.listCategories();
      const mine = new Set(current.map((c) => c.id));
      if (ids.length !== mine.size || ids.some((id) => !mine.has(id))) {
        throw new ValidationError('The categories changed. Pull to refresh and try again.');
      }
      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx
            .update(t.categories)
            .set({ position })
            .where(and(eq(t.categories.id, id), eq(t.categories.shopId, shopId)));
        }
      });
      return listCategories();
    },

    /** 20b1: exactly these products are in the category; others leave it. */
    async setCategoryProducts(categoryId: string, productIds: string[]) {
      const category = await seller.getCategory(categoryId);
      if (productIds.length > 0) {
        const [found] = await db
          .select({ n: count() })
          .from(t.products)
          .where(and(live, inArray(t.products.id, productIds)));
        if ((found?.n ?? 0) !== productIds.length) throw new NotFoundError('Product not found.');
      }
      await db.transaction(async (tx) => {
        const leaving = [eq(t.products.categoryId, category.id), eq(t.products.shopId, shopId)];
        if (productIds.length > 0) leaving.push(notInArray(t.products.id, productIds));
        await tx
          .update(t.products)
          .set({ categoryId: null })
          .where(and(...leaving));
        if (productIds.length > 0) {
          await tx
            .update(t.products)
            .set({ categoryId: category.id })
            .where(and(live, inArray(t.products.id, productIds)));
        }
      });
      return listProducts({ categoryId: category.id });
    },
  };
}
