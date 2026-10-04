import 'server-only';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  finishYourShop,
  SIZE_PRESETS,
  suggestSlugs,
  validateSlug,
  type BusinessType,
  type OnboardingAnswer,
  type OnboardingDraft,
  type OnboardingPayment,
  type OnboardingProduct,
  type OnboardingShop,
} from '@oda/shared';
import type { SellerCtx, UserCtx } from '../authz';
import { ConflictError, withDbErrors } from '../errors';
import { flushDeletions, publicUrl, queueDeletions, verifyStoredImage } from '../uploads';
import { sellerRepo } from './seller';
import { userRepo } from './user';

// Seller onboarding, steps 1–6 (docs/spec.md §5.2, decision #51). Steps 1–2 live in
// profiles.onboarding_draft (no shop yet); step 3 creates the shop; steps 4–6 are tracked in
// shops.onboarding_step (the next step to show, 4–6) until onboarding_completed_at is set.
// Every write is scoped to the signed-in user or their own shop. Going back and submitting
// a step again updates what that step created instead of adding a second one.

const t = schema;

async function ownShop(db: Db, userId: string) {
  return db.query.shops.findFirst({
    where: and(eq(t.shops.ownerId, userId), isNull(t.shops.deletedAt)),
  });
}

function readDraft(value: unknown): OnboardingDraft {
  const draft = (value ?? {}) as Partial<OnboardingDraft>;
  const step = draft.step === 2 || draft.step === 3 ? draft.step : 1;
  return { step, businessType: draft.businessType, channels: draft.channels };
}

/** Moves the shop's onboarding forward to `step` (never back). */
async function reachStep(db: Db, shopId: string, step: 4 | 5 | 6) {
  await db
    .update(t.shops)
    .set({ onboardingStep: sql`greatest(${t.shops.onboardingStep}, ${step})` })
    .where(eq(t.shops.id, shopId));
}

const FINISHED = 'Your shop is already set up.';

export function onboardingUserRepo(db: Db, ctx: UserCtx | SellerCtx) {
  return {
    /** Everything the onboarding screens need to resume and prefill. */
    async getState(shopBaseUrl: string) {
      const profile = await db.query.profiles.findFirst({
        columns: { onboardingDraft: true },
        where: eq(t.profiles.id, ctx.userId),
      });
      const draft = readDraft(profile?.onboardingDraft);
      const shop = await ownShop(db, ctx.userId);
      if (!shop) {
        return {
          step: draft.step as number,
          done: false,
          draft: { businessType: draft.businessType ?? null, channels: draft.channels ?? null },
          shop: null,
          product: null,
          payment: null,
          checklist: null,
          sizePresets: SIZE_PRESETS[draft.businessType ?? 'other'],
        };
      }

      const [product] = await db
        .select()
        .from(t.products)
        .where(and(eq(t.products.shopId, shop.id), isNull(t.products.deletedAt)))
        .orderBy(asc(t.products.createdAt))
        .limit(1);
      const photos = product
        ? await db
            .select({
              objectKey: t.productPhotos.objectKey,
              thumbKey: t.productPhotos.thumbKey,
              width: t.productPhotos.width,
              height: t.productPhotos.height,
            })
            .from(t.productPhotos)
            .where(eq(t.productPhotos.productId, product.id))
            .orderBy(asc(t.productPhotos.position))
        : [];
      const [account] = await db
        .select()
        .from(t.paymentAccounts)
        .where(and(eq(t.paymentAccounts.shopId, shop.id), eq(t.paymentAccounts.isActive, true)));
      const [counts] = await db
        .select({
          products: sql<number>`(select count(*)::int from products where shop_id = ${shop.id} and deleted_at is null)`,
          areas: sql<number>`(select count(*)::int from delivery_areas where shop_id = ${shop.id} and deleted_at is null)`,
        })
        .from(t.shops)
        .where(eq(t.shops.id, shop.id));

      return {
        step: shop.onboardingCompletedAt ? null : shop.onboardingStep,
        done: !!shop.onboardingCompletedAt,
        draft: { businessType: shop.businessType, channels: shop.channels },
        shop: {
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          url: `${shopBaseUrl}/${shop.slug}`,
          whatsappPhone: shop.whatsappPhone,
          logoPath: shop.logoPath,
          logoUrl: publicUrl(shop.logoPath),
          businessType: shop.businessType,
          channels: shop.channels,
        },
        product: product
          ? {
              id: product.id,
              name: product.name,
              price: product.price,
              sizes: product.sizes,
              photos: photos.map((p) => ({
                ...p,
                url: publicUrl(p.objectKey),
                thumbUrl: publicUrl(p.thumbKey),
              })),
            }
          : null,
        payment: {
          account: account
            ? {
                type: account.type,
                number: account.number,
                accountName: account.accountName,
                accountRefMode: account.accountRefMode,
                accountRef: account.accountRef,
                verificationStatus: account.verificationStatus,
              }
            : null,
          acceptsPayBefore: shop.acceptsPayBefore,
          acceptsPayOnDelivery: shop.acceptsPayOnDelivery,
        },
        checklist: finishYourShop({
          productCount: counts?.products ?? 0,
          hasActivePaymentAccount: !!account,
          hasLogo: !!shop.logoPath,
          hasSocialHandle: !!(shop.tiktokHandle || shop.instagramHandle),
          deliveryAreaCount: counts?.areas ?? 0,
          ticks: (shop.checklist ?? {}) as Record<string, string>,
        }),
        sizePresets: SIZE_PRESETS[shop.businessType as BusinessType],
      };
    },

    /** Steps 1–2: an answer or Skip, saved in the draft; the draft moves to the next step. */
    async saveAnswer(input: OnboardingAnswer) {
      if (await ownShop(db, ctx.userId)) {
        throw new ConflictError('Your shop already exists. Change this in your shop settings.');
      }
      const profile = await db.query.profiles.findFirst({
        columns: { onboardingDraft: true },
        where: eq(t.profiles.id, ctx.userId),
      });
      const draft = readDraft(profile?.onboardingDraft);
      const next: OnboardingDraft =
        input.step === 1
          ? {
              ...draft,
              businessType: 'skip' in input ? 'other' : input.businessType,
              step: draft.step < 2 ? 2 : draft.step,
            }
          : { ...draft, channels: 'skip' in input ? [] : input.channels, step: 3 };
      await db
        .update(t.profiles)
        .set({ onboardingDraft: next })
        .where(eq(t.profiles.id, ctx.userId));
      return next;
    },

    /**
     * Live link check for step 3: whether `slug` is free (or already this seller's), and up to
     * 3 free alternatives. A slug another shop uses, or ever used, is taken (decision #34 e).
     */
    async checkSlug(slug: string) {
      const shop = await ownShop(db, ctx.userId);
      const check = validateSlug(slug);
      const candidates = [slug, ...suggestSlugs(slug, () => false, 25)];
      const notMine = shop ? ne(t.shops.id, shop.id) : undefined;
      const live = await db
        .select({ slug: t.shops.slug })
        .from(t.shops)
        .where(and(inArray(t.shops.slug, candidates), notMine));
      const old = await db
        .select({ slug: t.shopSlugHistory.oldSlug })
        .from(t.shopSlugHistory)
        .where(
          and(
            inArray(t.shopSlugHistory.oldSlug, candidates),
            shop ? ne(t.shopSlugHistory.shopId, shop.id) : undefined,
          ),
        );
      const taken = new Set([...live, ...old].map((r) => r.slug));
      const available = check.ok && !taken.has(slug);
      return {
        slug,
        available,
        message: !check.ok ? check.message : taken.has(slug) ? 'That link is taken.' : null,
        suggestions: available ? [] : suggestSlugs(slug, (s) => taken.has(s)),
      };
    },

    /** Step 3: creates the shop (answers from steps 1–2), or updates it when going back. */
    async saveShop(input: OnboardingShop) {
      const existing = await ownShop(db, ctx.userId);
      if (existing?.onboardingCompletedAt) throw new ConflictError(FINISHED);
      if (existing) {
        const [shop] = await withDbErrors(() =>
          db
            .update(t.shops)
            .set({ name: input.name, slug: input.slug, whatsappPhone: input.whatsappPhone })
            .where(eq(t.shops.id, existing.id))
            .returning(),
        );
        return shop!;
      }
      const shop = await userRepo(db, ctx).createShop(input);
      await reachStep(db, shop.id, 4);
      return { ...shop, onboardingStep: 4 };
    },
  };
}

export function onboardingShopRepo(db: Db, ctx: SellerCtx) {
  const seller = sellerRepo(db, ctx);

  async function shopInProgress() {
    const shop = await seller.getShop();
    if (shop.onboardingCompletedAt) throw new ConflictError(FINISHED);
    return shop;
  }

  return {
    /** Step 4: the first product with its photos (first = cover); replaces them on a redo. */
    async saveProduct(input: OnboardingProduct) {
      await shopInProgress();
      // Every photo must really be stored, a JPEG/PNG/WebP without location data (#52).
      for (const photo of input.photos) {
        await verifyStoredImage(ctx, photo.objectKey, ['products'], db);
        await verifyStoredImage(ctx, photo.thumbKey, ['products'], db);
      }
      const replaced: string[] = [];
      const product = await db.transaction(async (tx) => {
        const scoped = sellerRepo(tx as unknown as Db, ctx);
        const [first] = await tx
          .select({ id: t.products.id })
          .from(t.products)
          .where(and(eq(t.products.shopId, ctx.shopId), isNull(t.products.deletedAt)))
          .orderBy(asc(t.products.createdAt))
          .limit(1);
        const fields = { name: input.name, price: input.price, sizes: input.sizes };
        const row = first
          ? await scoped.updateProduct(first.id, fields)
          : await scoped.createProduct({
              ...fields,
              description: null,
              compareAtPrice: null,
              categoryId: null,
              status: 'available',
              colours: [],
              position: 0,
            });
        if (first) {
          // Going back to step 4: the old photos go, and their stored files with them.
          const old = await tx
            .delete(t.productPhotos)
            .where(eq(t.productPhotos.productId, row.id))
            .returning({
              objectKey: t.productPhotos.objectKey,
              thumbKey: t.productPhotos.thumbKey,
            });
          const kept = new Set(input.photos.flatMap((p) => [p.objectKey, p.thumbKey]));
          replaced.push(
            ...old.flatMap((p) => [p.objectKey, p.thumbKey]).filter((k) => !kept.has(k)),
          );
          await queueDeletions(tx as unknown as Db, replaced);
        }
        for (const [position, photo] of input.photos.entries()) {
          await scoped.addProductPhoto(row.id, { ...photo, position });
        }
        await reachStep(tx as unknown as Db, ctx.shopId, 5);
        return row;
      });
      await flushDeletions(db, replaced);
      return product;
    },

    /** Step 3's logo (tap the avatar in the preview), or null to remove it. */
    async saveLogo(logoPath: string | null) {
      const shop = await shopInProgress();
      if (logoPath) await verifyStoredImage(ctx, logoPath, ['logos'], db);
      const old = shop.logoPath && shop.logoPath !== logoPath ? [shop.logoPath] : [];
      await db.transaction(async (tx) => {
        await tx.update(t.shops).set({ logoPath }).where(eq(t.shops.id, ctx.shopId));
        await queueDeletions(tx as unknown as Db, old);
      });
      await flushDeletions(db, old);
    },

    /**
     * Step 5: the M-Pesa account buyers pay (verification `pending`), or Skip, which turns on
     * pay on delivery (spec §5.2). A redo replaces the active account's details.
     */
    async savePayment(input: OnboardingPayment) {
      const shop = await shopInProgress();
      if (shop.onboardingStep < 5) {
        throw new ConflictError('Add your first product first.', 'step_order');
      }
      if ('skip' in input) {
        await seller.updateShop({ acceptsPayOnDelivery: true });
      } else {
        const [active] = await db
          .select({ id: t.paymentAccounts.id })
          .from(t.paymentAccounts)
          .where(
            and(eq(t.paymentAccounts.shopId, ctx.shopId), eq(t.paymentAccounts.isActive, true)),
          );
        if (active) await seller.updatePaymentAccount(active.id, input);
        else await seller.createPaymentAccount(input);
      }
      await reachStep(db, ctx.shopId, 6);
    },

    /** Step 6 and Home: tick "Share your link" or "Test your WhatsApp link". */
    async tick(item: 'shared_link' | 'tested_whatsapp') {
      await seller.updateShop({ checklist: { [item]: true } });
    },

    /** Step 6 "Done": onboarding is over; Home takes over (M6). */
    async complete() {
      const shop = await seller.getShop();
      if (shop.onboardingCompletedAt) return;
      if (shop.onboardingStep < 6) {
        throw new ConflictError('Finish the earlier steps first.', 'step_order');
      }
      await db
        .update(t.shops)
        .set({ onboardingCompletedAt: new Date() })
        .where(and(eq(t.shops.id, ctx.shopId), isNull(t.shops.onboardingCompletedAt)));
    },
  };
}
