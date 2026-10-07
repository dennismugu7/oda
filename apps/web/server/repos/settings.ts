import 'server-only';
import { and, eq } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import type {
  DetailsUpdate,
  FeedbackInput,
  PaymentAccountInput,
  PaymentSettingsUpdate,
  ShopProfileUpdate,
} from '@oda/shared';
import type { SellerCtx } from '../authz';
import { ConflictError, TooManyRequestsError, withDbErrors } from '../errors';
import { hitLimit } from '../rateLimit';
import { flushDeletions, publicUrl, queueDeletions, verifyStoredImage } from '../uploads';
import { sellerRepo } from './seller';

// Settings (M8a, docs/m8-plan.md): your details, shop profile, payments, pause and feedback.
// Every read and write is scoped to the signed-in seller's own profile and shop.

const t = schema;

/** A link change is rare; this stops a seller filling the slug history by accident. */
export const SLUG_CHANGES_PER_DAY = { window: 86_400, max: 5 };
/** Feedback: 5 a day per shop (m8-plan CP1). */
export const FEEDBACK_PER_DAY = { window: 86_400, max: 5 };

type AccountRow = typeof schema.paymentAccounts.$inferSelect;

/** What the app shows for an account (no verification fields: decision #72 a). */
function accountView(a: AccountRow) {
  return {
    id: a.id,
    type: a.type,
    number: a.number,
    accountName: a.accountName,
    accountRefMode: a.accountRefMode,
    accountRef: a.accountRef,
    isActive: a.isActive,
  };
}

export function settingsRepo(db: Db, ctx: SellerCtx) {
  const seller = sellerRepo(db, ctx);

  async function payments() {
    const shop = await seller.getShop();
    const accounts = await seller.listPaymentAccounts();
    return {
      accounts: accounts.map(accountView),
      acceptsPayBefore: shop.acceptsPayBefore,
      acceptsPayOnDelivery: shop.acceptsPayOnDelivery,
    };
  }

  /** Pay before delivery needs an active account; without one, keep pay on delivery on. */
  async function assertCanPay(next: { acceptsPayBefore: boolean; acceptsPayOnDelivery: boolean }) {
    if (next.acceptsPayOnDelivery) return;
    const [active] = await db
      .select({ id: t.paymentAccounts.id })
      .from(t.paymentAccounts)
      .where(and(eq(t.paymentAccounts.shopId, ctx.shopId), eq(t.paymentAccounts.isActive, true)));
    if (!active) {
      throw new ConflictError(
        'Add an M-Pesa account first, or keep "On delivery" on.',
        'no_payment_account',
      );
    }
  }

  return {
    // Your details ---------------------------------------------------------------------

    async getDetails() {
      const [row] = await db
        .select({
          email: t.authUser.email,
          firstName: t.profiles.firstName,
          lastName: t.profiles.lastName,
          recoveryPhone: t.profiles.recoveryPhone,
          memberSince: t.profiles.createdAt,
        })
        .from(t.profiles)
        .innerJoin(t.authUser, eq(t.authUser.id, t.profiles.id))
        .where(eq(t.profiles.id, ctx.userId));
      const shop = await seller.getShop();
      return { ...row!, shopName: shop.name };
    },

    async updateDetails(input: DetailsUpdate) {
      if (Object.keys(input).length > 0) {
        await db.update(t.profiles).set(input).where(eq(t.profiles.id, ctx.userId));
      }
    },

    // Shop profile ---------------------------------------------------------------------

    async getProfile(shopBaseUrl: string) {
      const shop = await seller.getShop();
      return {
        name: shop.name,
        slug: shop.slug,
        url: `${shopBaseUrl}/${shop.slug}`,
        /** "oda.shop/" before the link name (the configured base URL, never hardcoded). */
        linkPrefix: `${shopBaseUrl.replace(/^https?:\/\//, '')}/`,
        logoPath: shop.logoPath,
        logoUrl: publicUrl(shop.logoPath),
        about: shop.about,
        locationLabel: shop.locationLabel,
        whatsappPhone: shop.whatsappPhone,
        callsEnabled: shop.callsEnabled,
        tiktokHandle: shop.tiktokHandle,
        instagramHandle: shop.instagramHandle,
      };
    },

    /**
     * Saves the profile. A new logo is checked like any upload (#52) and the old one deleted;
     * a new link moves the old one into shop_slug_history (trigger), where it keeps
     * redirecting and no other shop can take it.
     */
    async updateProfile(input: ShopProfileUpdate) {
      const shop = await seller.getShop();
      const slugChanges = input.slug !== undefined && input.slug !== shop.slug;
      if (slugChanges && !(await hitLimit(db, `slug-change:${ctx.shopId}`, SLUG_CHANGES_PER_DAY))) {
        throw new TooManyRequestsError('You changed your link a lot today. Try again tomorrow.');
      }
      const logoChanges = input.logoPath !== undefined && input.logoPath !== shop.logoPath;
      if (logoChanges && input.logoPath) {
        await verifyStoredImage(ctx, input.logoPath, ['logos'], db);
      }
      const old = logoChanges && shop.logoPath ? [shop.logoPath] : [];
      await db.transaction(async (tx) => {
        if (Object.keys(input).length > 0) {
          await withDbErrors(() => tx.update(t.shops).set(input).where(eq(t.shops.id, ctx.shopId)));
        }
        await queueDeletions(tx as unknown as Db, old);
      });
      await flushDeletions(db, old);
    },

    // Payments -------------------------------------------------------------------------

    payments,

    async addAccount(input: PaymentAccountInput) {
      await seller.createPaymentAccount(input);
      return payments();
    },

    async updateAccount(id: string, input: PaymentAccountInput) {
      await seller.updatePaymentAccount(id, input);
      return payments();
    },

    async activateAccount(id: string) {
      await seller.activatePaymentAccount(id);
      return payments();
    },

    /** Only a saved (not active) account can be removed: checkout always has one to show. */
    async removeAccount(id: string) {
      await seller.getPaymentAccount(id); // 404 when it isn't this shop's
      // One statement, so an account made active at the same moment is never deleted.
      if (!(await seller.deleteInactivePaymentAccount(id))) {
        throw new ConflictError(
          'This is the account buyers pay. Make another one active first.',
          'account_active',
        );
      }
      return payments();
    },

    async updatePaymentSettings(input: PaymentSettingsUpdate) {
      const shop = await seller.getShop();
      const next = {
        acceptsPayBefore: input.acceptsPayBefore ?? shop.acceptsPayBefore,
        acceptsPayOnDelivery: input.acceptsPayOnDelivery ?? shop.acceptsPayOnDelivery,
      };
      if (!next.acceptsPayBefore && !next.acceptsPayOnDelivery) {
        throw new ConflictError(
          'Keep at least one way for buyers to pay: before delivery or on delivery.',
          'payment_option',
        );
      }
      await assertCanPay(next);
      await seller.updateShop(next);
      return payments();
    },

    // Pause ----------------------------------------------------------------------------

    async getPaused() {
      return { paused: (await seller.getShop()).isPaused };
    },

    async setPaused(paused: boolean) {
      const shop = await seller.updateShop({ isPaused: paused });
      return { paused: shop.isPaused };
    },

    // Feedback -------------------------------------------------------------------------

    async sendFeedback(input: FeedbackInput) {
      if (input.screenshotPath) {
        await verifyStoredImage(ctx, input.screenshotPath, ['feedback'], db);
      }
      if (!(await hitLimit(db, `feedback:${ctx.shopId}`, FEEDBACK_PER_DAY))) {
        throw new TooManyRequestsError(
          "You've sent a lot of feedback today. Thank you! Try again tomorrow.",
        );
      }
      const [row] = await db
        .insert(t.feedback)
        .values({ ...input, shopId: ctx.shopId })
        .returning({ id: t.feedback.id });
      return { id: row!.id };
    },
  };
}
