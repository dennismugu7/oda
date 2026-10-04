import { z } from 'zod';
import { BUSINESS_TYPES, type BusinessType } from './schemas/enums';
import { objectKey, requiredText, shillings } from './schemas/fields';
import { channels, paymentAccountInput, shopCreate } from './schemas/write';

// Seller onboarding, screens 09–14 (docs/spec.md §5.2, decisions #41, #32): the inputs of
// each step, the size presets per business type, and the "Finish your shop" checklist.
// Shared by the server (validation) and the seller app (forms, checklist card).

export const ONBOARDING_STEPS = 6;

/** Sizes on a product: at most 20, each at most 20 characters. */
export const SIZES_MAX = 20;
export const SIZE_MAX_LENGTH = 20;

/** Steps 1–2 (before the shop exists): an answer, or Skip. */
export const onboardingAnswer = z.union([
  z.strictObject({
    step: z.literal(1),
    businessType: z.enum(BUSINESS_TYPES, { error: 'Pick what you sell.' }),
  }),
  z.strictObject({ step: z.literal(1), skip: z.literal(true) }),
  z.strictObject({ step: z.literal(2), channels }),
  z.strictObject({ step: z.literal(2), skip: z.literal(true) }),
]);
export type OnboardingAnswer = z.infer<typeof onboardingAnswer>;

/** What steps 1–2 store in profiles.onboarding_draft until the shop row exists. */
export interface OnboardingDraft {
  /** The step to show next (1–3). */
  step: 1 | 2 | 3;
  businessType?: BusinessType;
  channels?: string[];
}

/** Step 3: name, link and WhatsApp number create the shop. */
export const onboardingShop = shopCreate.pick({ name: true, slug: true, whatsappPhone: true });
export type OnboardingShop = z.infer<typeof onboardingShop>;

/** Step 3's logo (tap the avatar in the preview); null removes it. */
export const onboardingLogo = z.strictObject({ logoPath: objectKey.nullable() });

/** One photo, already resized on the phone into a full image and a thumbnail. */
export const onboardingPhoto = z.strictObject({
  objectKey,
  thumbKey: objectKey,
  width: z.number().int().min(1).max(10_000).nullable().default(null),
  height: z.number().int().min(1).max(10_000).nullable().default(null),
});

/** A product has a cover photo plus up to 4 more. */
export const PRODUCT_PHOTOS_MAX = 5;

/** Step 4: the first product. The first photo is the cover; up to 5 photos. */
export const onboardingProduct = z.strictObject({
  name: requiredText(1, 80, 'Product name'),
  price: shillings('Price').min(1, { error: 'Price must be at least KSh 1.' }),
  // Presets are suggestions: sellers add their own ("One size", "42 wide") and remove any.
  sizes: z
    .array(requiredText(1, SIZE_MAX_LENGTH, 'A size'))
    .max(SIZES_MAX, { error: `Add at most ${SIZES_MAX} sizes.` })
    .transform((list) => [...new Set(list)])
    .default([]),
  photos: z
    .array(onboardingPhoto)
    .min(1, { error: 'Add a photo of the product.' })
    .max(PRODUCT_PHOTOS_MAX, { error: `Add at most ${PRODUCT_PHOTOS_MAX} photos.` }),
});
export type OnboardingProduct = z.infer<typeof onboardingProduct>;

/** Step 5: where buyers pay, or Skip (buyers pay on delivery until an account is added). */
export const onboardingPayment = z.union([
  z.strictObject({ skip: z.literal(true) }),
  paymentAccountInput,
]);
export type OnboardingPayment = z.infer<typeof onboardingPayment>;

/**
 * Size chips suggested on step 4 for the business type (decision #41: no categories; owner,
 * Step 52). Suggestions only: the seller can remove them and add their own.
 */
export const SIZE_PRESETS: Record<BusinessType, readonly string[]> = {
  fashion: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size'],
  shoes_bags: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  baby_kids: ['0–6m', '6–12m', '1–2y', '3–4y', '5–6y'],
  beauty_hair: [],
  food_drinks: [],
  phones_electronics: [],
  home_decor: [],
  other: [],
};

// "Finish your shop" (spec §5.3, design-changes 14): 7 items, hidden on Home when complete.

export const FINISH_ITEMS = [
  'basics',
  'shared_link',
  'logo',
  'more_products',
  'reach',
  'delivery',
  'tested_whatsapp',
] as const;
export type FinishItem = (typeof FINISH_ITEMS)[number];

const FINISH_LABELS: Record<FinishItem, string> = {
  basics: 'Shop, first product and payment set',
  shared_link: 'Share your link',
  logo: 'Add your shop logo',
  more_products: 'Add 4 more products',
  reach: 'Add more ways buyers reach you',
  delivery: 'Set delivery areas',
  tested_whatsapp: 'Test your WhatsApp link',
};

export interface ChecklistFacts {
  productCount: number;
  hasActivePaymentAccount: boolean;
  hasLogo: boolean;
  /** A TikTok or Instagram handle. */
  hasSocialHandle: boolean;
  deliveryAreaCount: number;
  /** shops.checklist: items without their own data, ticked with a timestamp. */
  ticks: Partial<Record<'shared_link' | 'tested_whatsapp', string>>;
}

export interface FinishYourShop {
  items: { id: FinishItem; label: string; done: boolean }[];
  done: number;
  total: number;
  complete: boolean;
}

export function finishYourShop(facts: ChecklistFacts): FinishYourShop {
  const done: Record<FinishItem, boolean> = {
    basics: facts.productCount >= 1 && facts.hasActivePaymentAccount,
    shared_link: !!facts.ticks.shared_link,
    logo: facts.hasLogo,
    more_products: facts.productCount >= 5,
    reach: facts.hasSocialHandle,
    delivery: facts.deliveryAreaCount >= 1,
    tested_whatsapp: !!facts.ticks.tested_whatsapp,
  };
  const items = FINISH_ITEMS.map((id) => ({ id, label: FINISH_LABELS[id], done: done[id] }));
  const count = items.filter((i) => i.done).length;
  return { items, done: count, total: items.length, complete: count === items.length };
}
