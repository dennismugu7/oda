import 'server-only';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  ORDER_STATUSES,
  isSale,
  type CategoryInput,
  type CategoryUpdate,
  type DeliveryAreaInput,
  type DeliveryAreaUpdate,
  type OrderStatus,
  type PaymentAccountInput,
  type ProductInput,
  type ProductPhotoInput,
  type ProductUpdate,
  type ShopUpdate,
} from '@oda/shared';
import type { SellerCtx } from '../authz';
import { withDbErrors } from '../errors';
import { assertOwnsKey } from '../uploads';
import { checkId, one } from './util';

// Everything a seller reads or writes. Every query adds shop_id = ctx.shopId, and every
// by-id lookup is `id = $id and shop_id = $shopId`, so another shop's row is a plain 404.

const SALE_STATUSES = ORDER_STATUSES.filter(isSale);

export function sellerRepo(db: Db, ctx: SellerCtx) {
  const { shopId } = ctx;
  const t = schema;

  const inShop = {
    paymentAccount: (id: string) =>
      and(
        eq(t.paymentAccounts.id, checkId(id, 'payment account')),
        eq(t.paymentAccounts.shopId, shopId),
      ),
    deliveryArea: (id: string) =>
      and(
        eq(t.deliveryAreas.id, checkId(id, 'delivery area')),
        eq(t.deliveryAreas.shopId, shopId),
        isNull(t.deliveryAreas.deletedAt),
      ),
    category: (id: string) =>
      and(eq(t.categories.id, checkId(id, 'category')), eq(t.categories.shopId, shopId)),
    product: (id: string) =>
      and(
        eq(t.products.id, checkId(id, 'product')),
        eq(t.products.shopId, shopId),
        isNull(t.products.deletedAt),
      ),
    order: (id: string) => and(eq(t.orders.id, checkId(id, 'order')), eq(t.orders.shopId, shopId)),
    notification: (id: string) =>
      and(eq(t.notifications.id, checkId(id, 'notification')), eq(t.notifications.shopId, shopId)),
  };

  async function assertCategory(categoryId: string | null | undefined) {
    if (!categoryId) return;
    one(
      await db
        .select({ id: t.categories.id })
        .from(t.categories)
        .where(inShop.category(categoryId)),
      'category',
    );
  }

  async function getProductRow(productId: string) {
    return one(await db.select().from(t.products).where(inShop.product(productId)), 'product');
  }

  return {
    // Shop --------------------------------------------------------------------------------

    async getShop() {
      return one(await db.select().from(t.shops).where(eq(t.shops.id, shopId)), 'shop');
    },

    async updateShop(input: ShopUpdate) {
      const { checklist, ...fields } = input;
      if (fields.logoPath) assertOwnsKey(ctx, fields.logoPath, ['logos']);
      let checklistValue: SQL | undefined;
      if (checklist) {
        // Ticking stores when it happened; unticking removes the item.
        const now = new Date().toISOString();
        const ticked = Object.fromEntries(
          Object.entries(checklist)
            .filter(([, on]) => on)
            .map(([item]) => [item, now]),
        );
        const unticked = Object.entries(checklist)
          .filter(([, on]) => !on)
          .map(([item]) => item);
        checklistValue = sql`(${t.shops.checklist} || ${JSON.stringify(ticked)}::jsonb) - ${unticked}::text[]`;
      }
      const rows = await withDbErrors(() =>
        db
          .update(t.shops)
          .set({ ...fields, ...(checklistValue ? { checklist: checklistValue } : {}) })
          .where(eq(t.shops.id, shopId))
          .returning(),
      );
      return one(rows, 'shop');
    },

    // Payment accounts --------------------------------------------------------------------

    async listPaymentAccounts() {
      return db
        .select()
        .from(t.paymentAccounts)
        .where(eq(t.paymentAccounts.shopId, shopId))
        .orderBy(desc(t.paymentAccounts.isActive), asc(t.paymentAccounts.createdAt));
    },

    async getPaymentAccount(id: string) {
      return one(
        await db.select().from(t.paymentAccounts).where(inShop.paymentAccount(id)),
        'payment account',
      );
    },

    /** New accounts wait for admin verification (`pending`). The first one becomes active. */
    async createPaymentAccount(input: PaymentAccountInput) {
      return db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: t.paymentAccounts.id })
          .from(t.paymentAccounts)
          .where(and(eq(t.paymentAccounts.shopId, shopId), eq(t.paymentAccounts.isActive, true)));
        const [row] = await withDbErrors(() =>
          tx
            .insert(t.paymentAccounts)
            .values({ ...input, shopId, isActive: !active, verificationStatus: 'pending' })
            .returning(),
        );
        return row!;
      });
    },

    /** Changing type, number, name or reference sends it back to `pending` (trigger). */
    async updatePaymentAccount(id: string, input: PaymentAccountInput) {
      const rows = await withDbErrors(() =>
        db.update(t.paymentAccounts).set(input).where(inShop.paymentAccount(id)).returning(),
      );
      return one(rows, 'payment account');
    },

    /** Makes this account the one buyers see at checkout. */
    async activatePaymentAccount(id: string) {
      return db.transaction(async (tx) => {
        one(
          await tx
            .select({ id: t.paymentAccounts.id })
            .from(t.paymentAccounts)
            .where(inShop.paymentAccount(id))
            .for('update'),
          'payment account',
        );
        await tx
          .update(t.paymentAccounts)
          .set({ isActive: false })
          .where(and(eq(t.paymentAccounts.shopId, shopId), eq(t.paymentAccounts.isActive, true)));
        const [row] = await tx
          .update(t.paymentAccounts)
          .set({ isActive: true })
          .where(inShop.paymentAccount(id))
          .returning();
        return row!;
      });
    },

    async deletePaymentAccount(id: string) {
      one(
        await db.delete(t.paymentAccounts).where(inShop.paymentAccount(id)).returning({
          id: t.paymentAccounts.id,
        }),
        'payment account',
      );
    },

    // Delivery areas ----------------------------------------------------------------------

    async listDeliveryAreas() {
      return db
        .select()
        .from(t.deliveryAreas)
        .where(and(eq(t.deliveryAreas.shopId, shopId), isNull(t.deliveryAreas.deletedAt)))
        .orderBy(asc(t.deliveryAreas.position), asc(t.deliveryAreas.createdAt));
    },

    async getDeliveryArea(id: string) {
      return one(
        await db.select().from(t.deliveryAreas).where(inShop.deliveryArea(id)),
        'delivery area',
      );
    },

    async createDeliveryArea(input: DeliveryAreaInput) {
      const [row] = await db
        .insert(t.deliveryAreas)
        .values({ ...input, shopId })
        .returning();
      return row!;
    },

    async updateDeliveryArea(id: string, input: DeliveryAreaUpdate) {
      return one(
        await db.update(t.deliveryAreas).set(input).where(inShop.deliveryArea(id)).returning(),
        'delivery area',
      );
    },

    /** Soft delete: past orders keep the area's name. */
    async deleteDeliveryArea(id: string) {
      one(
        await db
          .update(t.deliveryAreas)
          .set({ deletedAt: new Date() })
          .where(inShop.deliveryArea(id))
          .returning({ id: t.deliveryAreas.id }),
        'delivery area',
      );
    },

    // Categories --------------------------------------------------------------------------

    async listCategories() {
      return db
        .select()
        .from(t.categories)
        .where(eq(t.categories.shopId, shopId))
        .orderBy(asc(t.categories.position), asc(t.categories.createdAt));
    },

    async getCategory(id: string) {
      return one(await db.select().from(t.categories).where(inShop.category(id)), 'category');
    },

    async createCategory(input: CategoryInput) {
      const [row] = await db
        .insert(t.categories)
        .values({ ...input, shopId })
        .returning();
      return row!;
    },

    async updateCategory(id: string, input: CategoryUpdate) {
      return one(
        await db.update(t.categories).set(input).where(inShop.category(id)).returning(),
        'category',
      );
    },

    /** Its products stay, without a category. */
    async deleteCategory(id: string) {
      one(
        await db.delete(t.categories).where(inShop.category(id)).returning({ id: t.categories.id }),
        'category',
      );
    },

    // Products and photos -----------------------------------------------------------------

    async listProducts() {
      return db
        .select()
        .from(t.products)
        .where(and(eq(t.products.shopId, shopId), isNull(t.products.deletedAt)))
        .orderBy(desc(t.products.createdAt));
    },

    async getProduct(id: string) {
      const product = await getProductRow(id);
      const photos = await db
        .select()
        .from(t.productPhotos)
        .where(eq(t.productPhotos.productId, product.id))
        .orderBy(asc(t.productPhotos.position));
      return { ...product, photos };
    },

    async createProduct(input: ProductInput) {
      await assertCategory(input.categoryId);
      const [row] = await withDbErrors(() =>
        db
          .insert(t.products)
          .values({ ...input, shopId })
          .returning(),
      );
      return row!;
    },

    async updateProduct(id: string, input: ProductUpdate) {
      await assertCategory(input.categoryId);
      return one(
        await withDbErrors(() =>
          db.update(t.products).set(input).where(inShop.product(id)).returning(),
        ),
        'product',
      );
    },

    /** Soft delete: past orders keep their snapshot. */
    async deleteProduct(id: string) {
      one(
        await db
          .update(t.products)
          .set({ deletedAt: new Date() })
          .where(inShop.product(id))
          .returning({ id: t.products.id }),
        'product',
      );
    },

    async addProductPhoto(productId: string, input: ProductPhotoInput) {
      const product = await getProductRow(productId);
      assertOwnsKey(ctx, input.objectKey, ['products']);
      assertOwnsKey(ctx, input.thumbKey, ['products']);
      const [row] = await db
        .insert(t.productPhotos)
        .values({ ...input, productId: product.id })
        .returning();
      return row!;
    },

    async deleteProductPhoto(photoId: string) {
      const owned = db
        .select({ id: t.products.id })
        .from(t.products)
        .where(and(eq(t.products.shopId, shopId), isNull(t.products.deletedAt)));
      one(
        await db
          .delete(t.productPhotos)
          .where(
            and(
              eq(t.productPhotos.id, checkId(photoId, 'photo')),
              inArray(t.productPhotos.productId, owned),
            ),
          )
          .returning({ id: t.productPhotos.id }),
        'photo',
      );
    },

    // Orders and customers ----------------------------------------------------------------

    async listOrders(opts: { statuses?: OrderStatus[]; limit?: number } = {}) {
      return db
        .select()
        .from(t.orders)
        .where(
          and(
            eq(t.orders.shopId, shopId),
            opts.statuses?.length ? inArray(t.orders.status, opts.statuses) : undefined,
          ),
        )
        .orderBy(desc(t.orders.placedAt))
        .limit(Math.min(opts.limit ?? 50, 200));
    },

    async getOrder(id: string) {
      const order = one(await db.select().from(t.orders).where(inShop.order(id)), 'order');
      const [items, events] = await Promise.all([
        db
          .select()
          .from(t.orderItems)
          .where(eq(t.orderItems.orderId, order.id))
          .orderBy(asc(t.orderItems.createdAt)),
        db
          .select()
          .from(t.orderEvents)
          .where(eq(t.orderEvents.orderId, order.id))
          .orderBy(asc(t.orderEvents.createdAt)),
      ]);
      return { ...order, items, events };
    },

    /** Buyers grouped by phone. Totals and counts are sales only (decision #32). */
    async listCustomers() {
      const sale = inArray(t.orders.status, SALE_STATUSES);
      return db
        .select({
          phone: t.orders.buyerPhone,
          name: sql<string>`(array_agg(${t.orders.buyerName} order by ${t.orders.placedAt} desc))[1]`,
          totalSpent: sql<number>`coalesce(sum(${t.orders.total}) filter (where ${sale}), 0)::int`,
          orderCount: sql<number>`(count(*) filter (where ${sale}))::int`,
          lastOrderAt: sql<Date>`max(${t.orders.placedAt})`,
        })
        .from(t.orders)
        .where(eq(t.orders.shopId, shopId))
        .groupBy(t.orders.buyerPhone)
        .orderBy(desc(sql`max(${t.orders.placedAt})`));
    },

    // Notifications -----------------------------------------------------------------------

    async listNotifications(limit = 50) {
      return db
        .select()
        .from(t.notifications)
        .where(eq(t.notifications.shopId, shopId))
        .orderBy(desc(t.notifications.createdAt))
        .limit(Math.min(limit, 200));
    },

    async markNotificationRead(id: string) {
      return one(
        await db
          .update(t.notifications)
          .set({ readAt: sql`coalesce(${t.notifications.readAt}, now())` })
          .where(inShop.notification(id))
          .returning(),
        'notification',
      );
    },
  };
}

export type SellerRepo = ReturnType<typeof sellerRepo>;
