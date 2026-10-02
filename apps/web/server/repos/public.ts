import 'server-only';
import { and, asc, desc, eq, inArray, isNull, ne, type SQL } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { checkId, one } from './util';

// Buyer-facing shop pages: only public fields, never buyer data, the seller's email or
// recovery phone, order tokens or M-Pesa codes. Suspended and deleted shops don't exist here;
// a paused shop is returned with isPaused (browse only, docs/spec.md §6).

const t = schema;

/** Units sold is shown only from 5 (docs/spec.md §6, product page). */
const SOLD_SHOWN_FROM = 5;

const visibleShop = and(isNull(t.shops.deletedAt), isNull(t.shops.suspendedAt));

const publicShopColumns = {
  id: t.shops.id,
  name: t.shops.name,
  slug: t.shops.slug,
  logoPath: t.shops.logoPath,
  about: t.shops.about,
  locationLabel: t.shops.locationLabel,
  businessType: t.shops.businessType,
  whatsappPhone: t.shops.whatsappPhone,
  callsEnabled: t.shops.callsEnabled,
  tiktokHandle: t.shops.tiktokHandle,
  instagramHandle: t.shops.instagramHandle,
  acceptsPayBefore: t.shops.acceptsPayBefore,
  acceptsPayOnDelivery: t.shops.acceptsPayOnDelivery,
  pickupEnabled: t.shops.pickupEnabled,
  pickupLocation: t.shops.pickupLocation,
  pickupHours: t.shops.pickupHours,
  freeDeliveryThreshold: t.shops.freeDeliveryThreshold,
  isPaused: t.shops.isPaused,
  ratingAvg: t.shops.ratingAvg,
  ratingCount: t.shops.ratingCount,
  deliveredCount: t.shops.deliveredCount,
};

function selectShop(db: Db, where: SQL | undefined) {
  return db.select(publicShopColumns).from(t.shops).where(and(where, visibleShop));
}

declare const visible: unique symbol;
export type PublicShop = Awaited<ReturnType<typeof selectShop>>[number] & {
  /** Pay-now needs pay-before on and an active payment account (spec §5.2 step 5). */
  payNowAvailable: boolean;
  readonly [visible]: true;
};

export type FindShopResult =
  | { kind: 'shop'; shop: PublicShop }
  /** An old link: 301 to the shop's current slug. */
  | { kind: 'redirect'; slug: string }
  | { kind: 'not_found' };

export function publicRepo(db: Db) {
  async function shopBy(where: SQL) {
    const [row] = await selectShop(db, where);
    return row;
  }

  return {
    async findShop(slug: string): Promise<FindShopResult> {
      const normalized = slug.trim().toLowerCase();
      const row = await shopBy(eq(t.shops.slug, normalized));
      if (row) {
        const [active] = await db
          .select({ id: t.paymentAccounts.id })
          .from(t.paymentAccounts)
          .where(and(eq(t.paymentAccounts.shopId, row.id), eq(t.paymentAccounts.isActive, true)));
        const shop = { ...row, payNowAvailable: row.acceptsPayBefore && !!active } as PublicShop;
        return { kind: 'shop', shop };
      }
      const [old] = await db
        .select({ shopId: t.shopSlugHistory.shopId })
        .from(t.shopSlugHistory)
        .where(eq(t.shopSlugHistory.oldSlug, normalized));
      const current = old ? await shopBy(eq(t.shops.id, old.shopId)) : undefined;
      return current ? { kind: 'redirect', slug: current.slug } : { kind: 'not_found' };
    },

    /** Everything below takes a PublicShop, so it can only run for a visible shop. */
    shop(shop: PublicShop) {
      const listed = and(
        eq(t.products.shopId, shop.id),
        isNull(t.products.deletedAt),
        ne(t.products.status, 'hidden'),
      );
      const productColumns = {
        id: t.products.id,
        categoryId: t.products.categoryId,
        name: t.products.name,
        description: t.products.description,
        price: t.products.price,
        compareAtPrice: t.products.compareAtPrice,
        status: t.products.status,
        sizes: t.products.sizes,
        colours: t.products.colours,
        unitsSold: t.products.unitsSold,
        ratingAvg: t.products.ratingAvg,
        ratingCount: t.products.ratingCount,
        createdAt: t.products.createdAt,
      };
      async function withPhotos<P extends { id: string; unitsSold: number }>(products: P[]) {
        const ids = products.map((p) => p.id);
        const photos = ids.length
          ? await db
              .select({
                productId: t.productPhotos.productId,
                objectKey: t.productPhotos.objectKey,
                thumbKey: t.productPhotos.thumbKey,
                position: t.productPhotos.position,
                width: t.productPhotos.width,
                height: t.productPhotos.height,
              })
              .from(t.productPhotos)
              .where(inArray(t.productPhotos.productId, ids))
              .orderBy(asc(t.productPhotos.position))
          : [];
        return products.map(({ unitsSold, ...p }) => ({
          ...p,
          unitsSold: unitsSold >= SOLD_SHOWN_FROM ? unitsSold : null,
          photos: photos
            .filter((ph) => ph.productId === p.id)
            .map((ph) => ({
              objectKey: ph.objectKey,
              thumbKey: ph.thumbKey,
              position: ph.position,
              width: ph.width,
              height: ph.height,
            })),
        }));
      }

      return {
        async categories() {
          return db
            .select({ id: t.categories.id, name: t.categories.name })
            .from(t.categories)
            .where(and(eq(t.categories.shopId, shop.id), eq(t.categories.isVisible, true)))
            .orderBy(asc(t.categories.position), asc(t.categories.createdAt));
        },

        async deliveryAreas() {
          return db
            .select({
              id: t.deliveryAreas.id,
              name: t.deliveryAreas.name,
              fee: t.deliveryAreas.fee,
              method: t.deliveryAreas.method,
              etaLabel: t.deliveryAreas.etaLabel,
              freeDeliveryEligible: t.deliveryAreas.freeDeliveryEligible,
            })
            .from(t.deliveryAreas)
            .where(and(eq(t.deliveryAreas.shopId, shop.id), isNull(t.deliveryAreas.deletedAt)))
            .orderBy(asc(t.deliveryAreas.position), asc(t.deliveryAreas.createdAt));
        },

        async products() {
          const rows = await db
            .select(productColumns)
            .from(t.products)
            .where(listed)
            .orderBy(asc(t.products.position), desc(t.products.createdAt));
          return withPhotos(rows);
        },

        async product(productId: string) {
          const rows = await db
            .select(productColumns)
            .from(t.products)
            .where(and(listed, eq(t.products.id, checkId(productId, 'product'))));
          const [product] = await withPhotos([one(rows, 'product')]);
          return product!;
        },

        async reviews(limit = 50) {
          const reviews = await db
            .select({
              id: t.reviews.id,
              buyerDisplayName: t.reviews.buyerDisplayName,
              rating: t.reviews.rating,
              tags: t.reviews.tags,
              sellerReply: t.reviews.sellerReply,
              repliedAt: t.reviews.repliedAt,
              createdAt: t.reviews.createdAt,
            })
            .from(t.reviews)
            .where(eq(t.reviews.shopId, shop.id))
            .orderBy(desc(t.reviews.createdAt))
            .limit(Math.min(limit, 200));
          const ids = reviews.map((r) => r.id);
          const items = ids.length
            ? await db
                .select({
                  reviewId: t.reviewItems.reviewId,
                  productId: t.reviewItems.productId,
                  productName: t.orderItems.nameSnapshot,
                  rating: t.reviewItems.rating,
                  text: t.reviewItems.text,
                  photoPath: t.reviewItems.photoPath,
                })
                .from(t.reviewItems)
                .innerJoin(t.orderItems, eq(t.orderItems.id, t.reviewItems.orderItemId))
                .where(inArray(t.reviewItems.reviewId, ids))
            : [];
          return reviews.map((r) => ({
            ...r,
            items: items
              .filter((i) => i.reviewId === r.id)
              .map((i) => ({
                productId: i.productId,
                productName: i.productName,
                rating: i.rating,
                text: i.text,
                photoPath: i.photoPath,
              })),
          }));
        },
      };
    },
  };
}
