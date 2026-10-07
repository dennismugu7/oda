import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import type { ProfileUpdate, ShopCreate } from '@oda/shared';
import type { SellerCtx, UserCtx } from '../authz';
import { ConflictError, withDbErrors } from '../errors';
import { publicUrl } from '../uploads';

// The signed-in user's own profile, and shop creation (onboarding step 3).

export function userRepo(db: Db, ctx: UserCtx | SellerCtx) {
  const byId = eq(schema.profiles.id, ctx.userId);

  return {
    async getProfile() {
      const profile = await db.query.profiles.findFirst({
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          recoveryPhone: true,
          onboardingDraft: true,
        },
        where: byId,
      });
      return profile!;
    },

    /**
     * What the seller app needs to decide where to go after sign-in (GET /api/me): the
     * onboarding step to resume (1–3 from the draft, 4–6 from the shop) or done.
     */
    async getMe() {
      const user = await db.query.authUser.findFirst({
        columns: { email: true, emailVerified: true },
        where: eq(schema.authUser.id, ctx.userId),
      });
      const profile = await db.query.profiles.findFirst({
        columns: { onboardingDraft: true },
        where: byId,
      });
      const shop = await db.query.shops.findFirst({
        columns: {
          id: true,
          name: true,
          slug: true,
          logoPath: true,
          businessType: true,
          onboardingStep: true,
          onboardingCompletedAt: true,
          ratingAvg: true,
          ratingCount: true,
          suspendedAt: true,
        },
        where: and(eq(schema.shops.ownerId, ctx.userId), isNull(schema.shops.deletedAt)),
      });
      const draftStep = (profile?.onboardingDraft as { step?: unknown } | null)?.step;
      const step = shop
        ? shop.onboardingCompletedAt
          ? null
          : shop.onboardingStep
        : typeof draftStep === 'number' && draftStep >= 1 && draftStep <= 3
          ? draftStep
          : 1;
      return {
        email: user!.email,
        emailVerified: user!.emailVerified,
        onboarding: { step, done: step === null },
        shop: shop
          ? {
              id: shop.id,
              name: shop.name,
              slug: shop.slug,
              /** The Shop tab and More cards show the logo when there is one (M8b). */
              logoUrl: publicUrl(shop.logoPath),
              businessType: shop.businessType,
              /** The More tab's Reviews row ("4.8 ★ · 38", M7). */
              ratingAvg: shop.ratingAvg === null ? null : Number(shop.ratingAvg),
              ratingCount: shop.ratingCount,
              /** Suspended by oda: read-only except existing orders (decision #81 d). */
              suspended: !!shop.suspendedAt,
            }
          : null,
      };
    },

    async updateProfile(input: ProfileUpdate) {
      const [profile] = await db
        .update(schema.profiles)
        .set(input)
        .where(byId)
        .returning({ id: schema.profiles.id });
      return profile!;
    },

    /** Creates the user's shop; answers to onboarding steps 1–2 come from the draft. */
    async createShop(input: ShopCreate) {
      const existing = await db.query.shops.findFirst({
        columns: { id: true },
        where: eq(schema.shops.ownerId, ctx.userId),
      });
      if (existing) throw new ConflictError('You already have a shop.');
      const profile = await db.query.profiles.findFirst({
        columns: { onboardingDraft: true },
        where: byId,
      });
      const draft = (profile?.onboardingDraft ?? {}) as Partial<ShopCreate>;
      const [shop] = await withDbErrors(() =>
        db
          .insert(schema.shops)
          .values({
            ownerId: ctx.userId,
            name: input.name,
            slug: input.slug,
            whatsappPhone: input.whatsappPhone,
            businessType: input.businessType ?? draft.businessType ?? 'other',
            channels: input.channels ?? draft.channels ?? [],
          })
          .returning(),
      );
      return shop!;
    },
  };
}
