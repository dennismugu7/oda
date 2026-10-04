// Enum values shared by the write whitelists and packages/db (pgEnum), so the two can't drift.

export const BUSINESS_TYPES = [
  'fashion',
  'shoes_bags',
  'beauty_hair',
  'food_drinks',
  'phones_electronics',
  'home_decor',
  'baby_kids',
  'other',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const PAYMENT_ACCOUNT_TYPES = ['till', 'pochi', 'paybill'] as const;
export type PaymentAccountType = (typeof PAYMENT_ACCOUNT_TYPES)[number];

export const ACCOUNT_REF_MODES = ['fixed', 'order_number'] as const;
export type AccountRefMode = (typeof ACCOUNT_REF_MODES)[number];

export const DELIVERY_METHODS = ['rider', 'parcel'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const PRODUCT_STATUSES = ['available', 'sold_out', 'hidden'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Where the seller sells today (onboarding step 2, decision #41). Orders the share buttons. */
export const CHANNELS = [
  'whatsapp',
  'whatsapp_status',
  'tiktok',
  'instagram',
  'facebook',
  'market_stall',
] as const;
export type Channel = (typeof CHANNELS)[number];
