import { z } from 'zod';
import { onboardingPhoto, PRODUCT_PHOTOS_MAX } from './onboarding';

// Catalogue management (M3, spec §5.4): request shapes the seller app sends besides the
// product and category fields in schemas/write.ts, plus the colour palette.

/** A product's photos in order; the first is the cover (1–5, each file once). */
export const productPhotoList = z
  .array(onboardingPhoto)
  .min(1, { error: 'Add a photo of the product.' })
  .max(PRODUCT_PHOTOS_MAX, { error: `Add at most ${PRODUCT_PHOTOS_MAX} photos.` })
  .refine(
    (photos) => {
      const keys = photos.flatMap((p) => [p.objectKey, p.thumbKey]);
      return new Set(keys).size === keys.length;
    },
    { error: 'Each photo can only be used once.' },
  );
export type ProductPhotoList = z.infer<typeof productPhotoList>;

export const productPhotosInput = z.strictObject({ photos: productPhotoList });

const idList = (what: string, max: number) =>
  z
    .array(z.uuid({ error: `Unknown ${what}.` }))
    .max(max, { error: `Too many ${what}s at once.` })
    .refine((ids) => new Set(ids).size === ids.length, { error: `A ${what} is listed twice.` });

/** The new order of all the shop's categories (drag to reorder). */
export const categoryOrderInput = z.strictObject({
  ids: idList('category', 200).refine((ids) => ids.length > 0, { error: 'No categories.' }),
});

/** Exactly which products belong to a category (20b1: assign products). */
export const categoryProductsInput = z.strictObject({ productIds: idList('product', 500) });

/** "Undo" after deleting a product: the server keeps the restore open this long. */
export const PRODUCT_UNDO_MINUTES = 10;

/**
 * Colour presets for products (owner Step 60): pick any, or type a custom name (no swatch).
 * Hex values are what the swatch shows; the name is what buyers read.
 */
export const COLOUR_PRESETS = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Grey', hex: '#9E9E9E' },
  { name: 'Navy', hex: '#1F2A44' },
  { name: 'Blue', hex: '#1E63D6' },
  { name: 'Red', hex: '#D32F2F' },
  { name: 'Pink', hex: '#EC6CA8' },
  { name: 'Green', hex: '#2E7D32' },
  { name: 'Yellow', hex: '#F9D423' },
  { name: 'Orange', hex: '#F57C00' },
  { name: 'Brown', hex: '#795548' },
  { name: 'Beige', hex: '#D9C3A0' },
  { name: 'Maroon', hex: '#800020' },
  { name: 'Purple', hex: '#6A1B9A' },
  { name: 'Gold', hex: '#C9A227' },
] as const;
