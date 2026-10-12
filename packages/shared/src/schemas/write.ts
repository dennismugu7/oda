import { z } from 'zod';
import { normalizeKePhone } from '../phone';
import {
  ACCOUNT_REF_MODES,
  BUSINESS_TYPES,
  CHANNELS,
  DELIVERY_METHODS,
  FEEDBACK_KINDS,
  PAYMENT_ACCOUNT_TYPES,
  PRODUCT_STATUSES,
} from './enums';
import {
  kePhone,
  objectKey,
  optionalText,
  requiredText,
  shillings,
  slug,
  socialHandle,
  uuid,
} from './fields';

// Write whitelists (docs/data-model.md → Authorization): one strict zod schema per writable
// resource. Unknown keys are rejected, so server-owned columns (serverOwned.ts) can never be
// set from a request body. Repositories accept only these parsed types.

const businessType = z.enum(BUSINESS_TYPES, { error: 'Pick what you sell.' });
// Decision #41: the onboarding choices; "I'm just starting out" is an empty list.
export const channels = z
  .array(z.enum(CHANNELS, { error: 'Pick from the list.' }))
  .max(CHANNELS.length)
  .transform((list) => [...new Set(list)]);
const position = z.number().int().min(0).max(10_000);

// Profile -------------------------------------------------------------------------------

export const onboardingDraftInput = z.strictObject({
  businessType: businessType.optional(),
  channels: channels.optional(),
});

export const profileUpdate = z
  .strictObject({
    firstName: optionalText(40, 'First name'),
    lastName: optionalText(40, 'Last name'),
    recoveryPhone: kePhone.nullable(),
    onboardingDraft: onboardingDraftInput.nullable(),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof profileUpdate>;

/** 20b-your-details. The email is read-only ("Email can't be changed yet"). */
export const detailsUpdate = z
  .strictObject({
    firstName: profileUpdate.shape.firstName,
    lastName: profileUpdate.shape.lastName,
    // An empty field removes the recovery number.
    recoveryPhone: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      kePhone.nullable(),
    ),
  })
  .partial();
export type DetailsUpdate = z.infer<typeof detailsUpdate>;

// Shop ----------------------------------------------------------------------------------

/** "I'll arrange delivery with buyers" ticks the optional delivery item (decision #110 e). */
export const CHECKLIST_ITEMS = ['shared_link', 'tested_whatsapp', 'arrange_delivery'] as const;

const shopFields = {
  name: requiredText(2, 40, 'Shop name'),
  slug,
  whatsappPhone: kePhone,
  businessType,
  channels,
  about: optionalText(300, 'About'),
  locationLabel: optionalText(80, 'Location'),
  callsEnabled: z.boolean(),
  tiktokHandle: socialHandle,
  instagramHandle: socialHandle,
  acceptsPayBefore: z.boolean(),
  acceptsPayOnDelivery: z.boolean(),
  pickupEnabled: z.boolean(),
  pickupLocation: optionalText(120, 'Pickup location'),
  pickupHours: optionalText(80, 'Pickup hours'),
  freeDeliveryThreshold: shillings('Free delivery amount')
    .min(1, { error: 'Free delivery amount must be more than 0.' })
    .nullable(),
  isPaused: z.boolean(),
  logoPath: objectKey.nullable(),
  /** Tick (true) or untick (false) checklist items without their own data. */
  checklist: z.partialRecord(z.enum(CHECKLIST_ITEMS), z.boolean()),
  onboardingStep: z.number().int().min(3).max(6),
};

/** Onboarding step 3: the shop row is created with its name, link and WhatsApp number. */
export const shopCreate = z.strictObject({
  name: shopFields.name,
  slug: shopFields.slug,
  whatsappPhone: shopFields.whatsappPhone,
  businessType: shopFields.businessType.optional(),
  channels: shopFields.channels.optional(),
});
export type ShopCreate = z.infer<typeof shopCreate>;

export const shopUpdate = z
  .strictObject(shopFields)
  .partial()
  .refine((s) => !(s.acceptsPayBefore === false && s.acceptsPayOnDelivery === false), {
    error: 'Keep at least one way for buyers to pay: before delivery or on delivery.',
  });
export type ShopUpdate = z.infer<typeof shopUpdate>;

/** 20b-shop-profile: what buyers see at the top of the shop (the link change included). */
export const shopProfileUpdate = z
  .strictObject({
    name: shopFields.name,
    slug: shopFields.slug,
    logoPath: shopFields.logoPath,
    about: shopFields.about,
    locationLabel: shopFields.locationLabel,
    whatsappPhone: shopFields.whatsappPhone,
    callsEnabled: shopFields.callsEnabled,
    tiktokHandle: shopFields.tiktokHandle,
    instagramHandle: shopFields.instagramHandle,
  })
  .partial();
export type ShopProfileUpdate = z.infer<typeof shopProfileUpdate>;

/** 20b-payments "When buyers pay": at least one stays on. */
export const paymentSettingsUpdate = z
  .strictObject({
    acceptsPayBefore: shopFields.acceptsPayBefore,
    acceptsPayOnDelivery: shopFields.acceptsPayOnDelivery,
  })
  .partial()
  .refine((s) => !(s.acceptsPayBefore === false && s.acceptsPayOnDelivery === false), {
    error: 'Keep at least one way for buyers to pay: before delivery or on delivery.',
  });
export type PaymentSettingsUpdate = z.infer<typeof paymentSettingsUpdate>;

/** 20b-settings "Pause my shop". */
export const pauseUpdate = z.strictObject({ paused: z.boolean({ error: 'Choose on or off.' }) });

// Feedback ------------------------------------------------------------------------------

export const FEEDBACK_MAX = 500;

/** 21-share-feedback (and Help → Report a problem / Suggest an idea, M8b). */
export const feedbackInput = z.strictObject({
  kind: z.enum(FEEDBACK_KINDS, { error: "Choose what it's about." }),
  message: requiredText(1, FEEDBACK_MAX, 'Your message'),
  screenshotPath: objectKey.nullable().default(null),
  replyOnWhatsapp: z.boolean().default(false),
});
export type FeedbackInput = z.infer<typeof feedbackInput>;

/** 20b-delivery: pickup and free delivery (the areas have their own endpoints). */
export const deliverySettingsUpdate = z
  .strictObject({
    pickupEnabled: shopFields.pickupEnabled,
    pickupLocation: shopFields.pickupLocation,
    pickupHours: shopFields.pickupHours,
    freeDeliveryThreshold: shopFields.freeDeliveryThreshold,
  })
  .partial();
export type DeliverySettingsUpdate = z.infer<typeof deliverySettingsUpdate>;

// Payment accounts ----------------------------------------------------------------------

/** Full replace on create and edit (the paybill rules need every field together). */
export const paymentAccountInput = z
  .strictObject({
    type: z.enum(PAYMENT_ACCOUNT_TYPES, { error: 'Pick Till, Pochi or Paybill.' }),
    number: z
      .string()
      .trim()
      .min(1, { error: 'Enter the number.' })
      .max(32, { error: 'That number is too long.' }),
    accountName: requiredText(2, 60, 'The name on the account'),
    accountRefMode: z.enum(ACCOUNT_REF_MODES).nullable().default(null),
    accountRef: optionalText(30, 'Account number').default(null),
  })
  .superRefine((a, ctx) => {
    if (a.type === 'pochi') {
      // Pochi la Biashara is paid to the seller's phone number (stored in E.164).
      if (!normalizeKePhone(a.number)) {
        ctx.addIssue({
          code: 'custom',
          path: ['number'],
          message: 'Enter the Pochi phone number, e.g. 0712 345 678.',
        });
      }
    } else if (!/^\d{5,7}$/.test(a.number)) {
      ctx.addIssue({
        code: 'custom',
        path: ['number'],
        message:
          a.type === 'till'
            ? 'Enter the Till number: 5 to 7 digits.'
            : 'Enter the Paybill number: 5 to 7 digits.',
      });
    }
    if (a.type === 'paybill') {
      if (!a.accountRefMode) {
        ctx.addIssue({
          code: 'custom',
          path: ['accountRefMode'],
          message: 'Choose a fixed account number or the order number.',
        });
      } else if (a.accountRefMode === 'fixed' && !a.accountRef) {
        ctx.addIssue({
          code: 'custom',
          path: ['accountRef'],
          message: 'Enter the account number.',
        });
      } else if (a.accountRefMode === 'order_number' && a.accountRef) {
        ctx.addIssue({
          code: 'custom',
          path: ['accountRef'],
          message: 'Leave the account number empty when buyers use the order number.',
        });
      }
    } else if (a.accountRefMode || a.accountRef) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountRefMode'],
        message: 'Only Paybill accounts have an account number.',
      });
    }
  })
  .transform((a) =>
    a.type === 'pochi' ? { ...a, number: normalizeKePhone(a.number) ?? a.number } : a,
  );
export type PaymentAccountInput = z.infer<typeof paymentAccountInput>;

// Delivery areas ------------------------------------------------------------------------

const deliveryAreaFields = z.strictObject({
  name: requiredText(1, 60, 'Area name'),
  fee: shillings('Delivery fee', 100_000),
  method: z.enum(DELIVERY_METHODS, { error: 'Pick rider or parcel.' }),
  etaLabel: optionalText(40, 'Delivery time'),
  freeDeliveryEligible: z.boolean(),
  position,
});
export const deliveryAreaInput = deliveryAreaFields.extend({
  etaLabel: deliveryAreaFields.shape.etaLabel.default(null),
  freeDeliveryEligible: z.boolean().default(false),
  position: position.default(0),
});
export const deliveryAreaUpdate = deliveryAreaFields.partial();
export type DeliveryAreaInput = z.infer<typeof deliveryAreaInput>;
export type DeliveryAreaUpdate = z.infer<typeof deliveryAreaUpdate>;

// Categories ----------------------------------------------------------------------------

const categoryFields = z.strictObject({
  name: requiredText(1, 40, 'Category name'),
  isVisible: z.boolean(),
  position,
});
export const categoryInput = categoryFields.extend({
  isVisible: z.boolean().default(true),
  position: position.default(0),
});
export const categoryUpdate = categoryFields.partial();
export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryUpdate = z.infer<typeof categoryUpdate>;

// Products ------------------------------------------------------------------------------

const colour = z.strictObject({
  name: requiredText(1, 30, 'Colour name'),
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Colour must be a hex value like #C2185B.' })
    .transform((hex) => hex.toUpperCase())
    .optional(),
});

const productFields = z.strictObject({
  name: requiredText(1, 80, 'Product name'),
  description: optionalText(2000, 'Description'),
  price: shillings('Price').min(1, { error: 'Price must be at least KSh 1.' }),
  compareAtPrice: shillings('Was-price').nullable(),
  categoryId: uuid('Category').nullable(),
  status: z.enum(PRODUCT_STATUSES, { error: 'Pick Available, Sold out or Hidden.' }),
  sizes: z
    .array(requiredText(1, 20, 'A size'))
    .max(30, { error: 'Add at most 30 sizes.' })
    .transform((list) => [...new Set(list)]),
  colours: z.array(colour).max(20, { error: 'Add at most 20 colours.' }),
  position,
});

const wasPriceAbovePrice = (p: { price?: number; compareAtPrice?: number | null }) =>
  p.compareAtPrice == null || p.price === undefined || p.compareAtPrice > p.price;
const wasPriceMessage = { error: 'The was-price must be higher than the price.' };

export const productInput = productFields
  .extend({
    description: productFields.shape.description.default(null),
    compareAtPrice: productFields.shape.compareAtPrice.default(null),
    categoryId: productFields.shape.categoryId.default(null),
    status: productFields.shape.status.default('available'),
    sizes: productFields.shape.sizes.default([]),
    colours: productFields.shape.colours.default([]),
    position: position.default(0),
  })
  .refine(wasPriceAbovePrice, wasPriceMessage);
/** A partial edit; the database re-checks was-price > price against the stored price. */
export const productUpdate = productFields.partial().refine(wasPriceAbovePrice, wasPriceMessage);
export type ProductInput = z.infer<typeof productInput>;
export type ProductUpdate = z.infer<typeof productUpdate>;

export const productPhotoInput = z.strictObject({
  objectKey,
  thumbKey: objectKey,
  position: z.number().int().min(0).max(4).default(0),
  width: z.number().int().min(1).max(10_000).nullable().default(null),
  height: z.number().int().min(1).max(10_000).nullable().default(null),
});
export type ProductPhotoInput = z.infer<typeof productPhotoInput>;

/** Every write whitelist, for the server-owned contract test (and future endpoints). */
export const WRITE_SCHEMAS = {
  profileUpdate,
  detailsUpdate,
  shopCreate,
  shopUpdate,
  shopProfileUpdate,
  paymentSettingsUpdate,
  pauseUpdate,
  feedbackInput,
  deliverySettingsUpdate,
  paymentAccountInput,
  deliveryAreaInput,
  deliveryAreaUpdate,
  categoryInput,
  categoryUpdate,
  productInput,
  productUpdate,
  productPhotoInput,
} as const;
