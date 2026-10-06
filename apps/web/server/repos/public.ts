import 'server-only';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { productBadges, type OrderSource, type StoreQuery } from '@oda/shared';
import { publicUrl } from '../uploads';
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
  /** At least one delivery area, or pickup on: needed to take orders (decision #61 c). */
  hasDeliveryOption: boolean;
  /** "M-Pesa till checked by oda": the active account was verified by an admin. */
  mpesaChecked: boolean;
  logoUrl: string | null;
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
        const [[active], [area]] = await Promise.all([
          db
            .select({ id: t.paymentAccounts.id, status: t.paymentAccounts.verificationStatus })
            .from(t.paymentAccounts)
            .where(and(eq(t.paymentAccounts.shopId, row.id), eq(t.paymentAccounts.isActive, true))),
          db
            .select({ id: t.deliveryAreas.id })
            .from(t.deliveryAreas)
            .where(and(eq(t.deliveryAreas.shopId, row.id), isNull(t.deliveryAreas.deletedAt)))
            .limit(1),
        ]);
        const shop = {
          ...row,
          payNowAvailable: row.acceptsPayBefore && !!active,
          hasDeliveryOption: row.pickupEnabled || !!area,
          mpesaChecked: active?.status === 'verified',
          logoUrl: publicUrl(row.logoPath),
        } as PublicShop;
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
              url: publicUrl(ph.objectKey),
              thumbUrl: publicUrl(ph.thumbKey),
            })),
        }));
      }

      return {
        /** Visible categories that have a listed product, in the seller's order (spec §5.6). */
        async categories() {
          const hasProduct = db
            .select({ one: sql`1` })
            .from(t.products)
            .where(and(listed, eq(t.products.categoryId, t.categories.id)));
          return db
            .select({ id: t.categories.id, name: t.categories.name })
            .from(t.categories)
            .where(
              and(
                eq(t.categories.shopId, shop.id),
                eq(t.categories.isVisible, true),
                exists(hasProduct),
              ),
            )
            .orderBy(asc(t.categories.position), asc(t.categories.createdAt));
        },

        /**
         * Shop home and search (spec §6.1): listed products filtered by category, text, size and
         * max price, sorted (default: the seller's order, newest first), as cards with the
         * cover thumbnail and one badge each.
         */
        async catalog(query: StoreQuery = {}, now = new Date()) {
          const conditions: SQL[] = [listed!];
          if (query.c) conditions.push(eq(t.products.categoryId, query.c));
          if (query.max) conditions.push(lte(t.products.price, query.max));
          if (query.size) conditions.push(sql`${query.size} = any(${t.products.sizes})`);
          if (query.q) {
            // Escape LIKE's wildcards so "50%" searches for "50%" (Postgres' default escape is \).
            const like = `%${query.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
            conditions.push(or(ilike(t.products.name, like), ilike(t.products.description, like))!);
          }
          const order =
            query.sort === 'popular'
              ? [desc(t.products.unitsSold), desc(t.products.createdAt)]
              : query.sort === 'newest'
                ? [desc(t.products.createdAt)]
                : query.sort === 'price_asc'
                  ? [asc(t.products.price), desc(t.products.createdAt)]
                  : query.sort === 'price_desc'
                    ? [desc(t.products.price), desc(t.products.createdAt)]
                    : [asc(t.products.position), desc(t.products.createdAt)];
          const rows = await db
            .select(productColumns)
            .from(t.products)
            .where(and(...conditions))
            .orderBy(...order);
          // Badges compare against the whole shop, not just the filtered rows.
          const all = await db
            .select({
              id: t.products.id,
              status: t.products.status,
              unitsSold: t.products.unitsSold,
              createdAt: t.products.createdAt,
            })
            .from(t.products)
            .where(listed);
          const badges = productBadges(all, now);
          const covers = rows.length
            ? await db
                .select({
                  productId: t.productPhotos.productId,
                  thumbKey: t.productPhotos.thumbKey,
                })
                .from(t.productPhotos)
                .where(
                  and(
                    inArray(
                      t.productPhotos.productId,
                      rows.map((r) => r.id),
                    ),
                    eq(t.productPhotos.position, 0),
                  ),
                )
            : [];
          const coverOf = new Map(covers.map((c) => [c.productId, publicUrl(c.thumbKey)]));
          return rows.map((p) => ({
            id: p.id,
            categoryId: p.categoryId,
            name: p.name,
            price: p.price,
            compareAtPrice: p.compareAtPrice,
            status: p.status,
            /** "+" quick-adds only without sizes and colours (spec §6.1). */
            hasOptions: p.sizes.length > 0 || (p.colours as unknown[]).length > 0,
            sizes: p.sizes,
            ratingAvg: p.ratingAvg,
            ratingCount: p.ratingCount,
            badge: badges.get(p.id) ?? null,
            coverUrl: coverOf.get(p.id) ?? null,
          }));
        },

        /** The cart's check: current name, price, status and options of these products. */
        async lookup(productIds: string[]) {
          if (productIds.length === 0) return [];
          const rows = await db
            .select(productColumns)
            .from(t.products)
            .where(and(listed, inArray(t.products.id, productIds)));
          const products = await withPhotos(rows);
          return products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            compareAtPrice: p.compareAtPrice,
            status: p.status,
            sizes: p.sizes,
            colours: p.colours,
            categoryId: p.categoryId,
            coverUrl: p.photos[0] ? publicUrl(p.photos[0].thumbKey) : null,
          }));
        },

        /** One visit (already de-duplicated per day by the oda_v cookie). */
        async recordVisit(day: string, source: OrderSource) {
          await db
            .insert(t.shopVisitsDaily)
            .values({ shopId: shop.id, day, source, visits: 1 })
            .onConflictDoUpdate({
              target: [t.shopVisitsDaily.shopId, t.shopVisitsDaily.day, t.shopVisitsDaily.source],
              set: { visits: sql`${t.shopVisitsDaily.visits} + 1` },
            });
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
              reportedAt: t.reviews.reportedAt,
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
          // A reported review's photos are hidden on public pages (decision #73 a).
          return reviews.map(({ reportedAt, ...r }) => ({
            ...r,
            items: items
              .filter((i) => i.reviewId === r.id)
              .map((i) => ({
                productId: i.productId,
                productName: i.productName,
                rating: i.rating,
                text: i.text,
                photoPath: reportedAt ? null : i.photoPath,
              })),
          }));
        },
      };
    },
  };
}
