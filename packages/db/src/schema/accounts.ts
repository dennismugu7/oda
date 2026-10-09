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
import { authUser } from './auth';
import { createdAt, id, tstz, updatedAt } from './columns';
import {
  accountRefMode,
  businessType,
  deliveryMethod,
  paymentAccountType,
  verificationStatus,
} from './enums';

/** One per auth user (docs/data-model.md → profiles). */
export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  recoveryPhone: text('recovery_phone'),
  expoPushTokens: text('expo_push_tokens')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** Answers to onboarding steps 1–2 before the shop row exists. */
  onboardingDraft: jsonb('onboarding_draft'),
  deletedAt: tstz('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One per seller in v1 (owner_id is unique). */
export const shops = pgTable(
  'shops',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logoPath: text('logo_path'),
    about: text('about'),
    locationLabel: text('location_label'),
    businessType: businessType('business_type').notNull().default('other'),
    channels: text('channels')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    whatsappPhone: text('whatsapp_phone').notNull(),
    callsEnabled: boolean('calls_enabled').notNull().default(false),
    tiktokHandle: text('tiktok_handle'),
    instagramHandle: text('instagram_handle'),
    acceptsPayBefore: boolean('accepts_pay_before').notNull().default(true),
    acceptsPayOnDelivery: boolean('accepts_pay_on_delivery').notNull().default(false),
    pickupEnabled: boolean('pickup_enabled').notNull().default(false),
    pickupLocation: text('pickup_location'),
    pickupHours: text('pickup_hours'),
    freeDeliveryThreshold: integer('free_delivery_threshold'),
    isPaused: boolean('is_paused').notNull().default(false),
    suspendedAt: tstz('suspended_at'),
    deletedAt: tstz('deleted_at'),
    /** The row is created at onboarding step 3; steps 4–6 are tracked here. */
    onboardingStep: integer('onboarding_step').notNull().default(3),
    onboardingCompletedAt: tstz('onboarding_completed_at'),
    /** Ticked checklist items without their own data, e.g. {shared_link: ts}. */
    checklist: jsonb('checklist')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Next order number = order_counter + 1, taken inside the order-insert transaction. */
    orderCounter: integer('order_counter').notNull().default(1000),
    ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }),
    ratingCount: integer('rating_count').notNull().default(0),
    deliveredCount: integer('delivered_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('shops_payment_option', sql`${t.acceptsPayBefore} or ${t.acceptsPayOnDelivery}`),
    check(
      'shops_free_delivery_threshold',
      sql`${t.freeDeliveryThreshold} is null or ${t.freeDeliveryThreshold} > 0`,
    ),
    check('shops_onboarding_step', sql`${t.onboardingStep} between 3 and 6`),
    check('shops_counts', sql`${t.ratingCount} >= 0 and ${t.deliveredCount} >= 0`),
  ],
);

/** Old slugs keep redirecting (301) and can never be taken by another shop. */
export const shopSlugHistory = pgTable(
  'shop_slug_history',
  {
    oldSlug: text('old_slug').primaryKey(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    changedAt: tstz('changed_at').notNull().defaultNow(),
  },
  (t) => [index('shop_slug_history_shop_id_idx').on(t.shopId)],
);

export const paymentAccounts = pgTable(
  'payment_accounts',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    type: paymentAccountType('type').notNull(),
    number: text('number').notNull(),
    /** The name M-Pesa shows the buyer before they enter their PIN. */
    accountName: text('account_name').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    accountRefMode: accountRefMode('account_ref_mode'),
    accountRef: text('account_ref'),
    verificationStatus: verificationStatus('verification_status').notNull().default('unverified'),
    verifiedBy: uuid('verified_by').references(() => profiles.id, { onDelete: 'set null' }),
    verifiedAt: tstz('verified_at'),
    verificationNote: text('verification_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payment_accounts_shop_id_idx').on(t.shopId),
    uniqueIndex('payment_accounts_one_active')
      .on(t.shopId)
      .where(sql`${t.isActive}`),
    check(
      'payment_accounts_paybill_ref',
      sql`(${t.type} = 'paybill') = (${t.accountRefMode} is not null)
        and (${t.accountRefMode} is distinct from 'fixed' or ${t.accountRef} is not null)
        and (${t.type} = 'paybill' or ${t.accountRef} is null)`,
    ),
  ],
);

export const deliveryAreas = pgTable(
  'delivery_areas',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fee: integer('fee').notNull(),
    method: deliveryMethod('method').notNull(),
    etaLabel: text('eta_label'),
    freeDeliveryEligible: boolean('free_delivery_eligible').notNull().default(false),
    position: integer('position').notNull().default(0),
    deletedAt: tstz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('delivery_areas_shop_id_idx').on(t.shopId, t.position),
    // Lets orders reference (delivery_area_id, shop_id) so an order can't use another shop's area.
    uniqueIndex('delivery_areas_id_shop_id').on(t.id, t.shopId),
    check('delivery_areas_fee', sql`${t.fee} >= 0`),
  ],
);
