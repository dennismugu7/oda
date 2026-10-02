import 'server-only';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import type { ProfileUpdate, ShopCreate } from '@oda/shared';
import type { SellerCtx, UserCtx } from '../authz';
import { ConflictError, withDbErrors } from '../errors';

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
