// Add/Edit product (design 18-edit-product): the form's pure logic, unit-tested. The screen
// keeps a ProductDraft; saving sends only what changed (edit) or everything (new).
import { COLOUR_PRESETS, PRODUCT_PHOTOS_MAX, type ProductStatus } from '@oda/shared';
import type { Colour, PhotoInput, Product, ProductFields } from './api';

export interface ProductDraft {
  name: string;
  /** As typed, digits with thousands separators ("2,800"). */
  price: string;
  compareAtPrice: string;
  description: string;
  categoryId: string | null;
  status: ProductStatus;
  sizes: string[];
  colours: Colour[];
}

export const STATUS_HELP: Record<ProductStatus, string> = {
  available: 'Buyers can see and order this product.',
  sold_out: 'Buyers see it marked sold out and can’t order it.',
  hidden: 'Buyers don’t see it. Only you can.',
};

/** "2,800" ← "2800" (digits only, no leading zeros). */
export function moneyText(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
  return digits ? Number(digits).toLocaleString('en-US') : '';
}

const amount = (text: string): number | null => {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

export function emptyDraft(): ProductDraft {
  return {
    name: '',
    price: '',
    compareAtPrice: '',
    description: '',
    categoryId: null,
    status: 'available',
    sizes: [],
    colours: [],
  };
}

export function draftFrom(p: Product): ProductDraft {
  return {
    name: p.name,
    price: moneyText(String(p.price)),
    compareAtPrice: p.compareAtPrice ? moneyText(String(p.compareAtPrice)) : '',
    description: p.description ?? '',
    categoryId: p.categoryId,
    status: p.status,
    sizes: [...p.sizes],
    colours: p.colours.map((c) => ({ ...c })),
  };
}

export function fieldsFrom(d: ProductDraft): ProductFields {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    price: amount(d.price) ?? 0,
    compareAtPrice: amount(d.compareAtPrice),
    categoryId: d.categoryId,
    status: d.status,
    sizes: d.sizes,
    colours: d.colours,
  };
}

/** The first problem to show, or null when the product can be saved. */
export function draftProblem(d: ProductDraft, photoCount: number): string | null {
  if (photoCount < 1) return 'Add a photo of your product. Buyers want to see it.';
  if (photoCount > PRODUCT_PHOTOS_MAX) return `Add at most ${PRODUCT_PHOTOS_MAX} photos.`;
  if (!d.name.trim()) return 'Enter the product name.';
  const price = amount(d.price);
  if (!price) return 'Enter the price in shillings.';
  const was = amount(d.compareAtPrice);
  if (was !== null && was <= price) return 'The was-price must be higher than the price.';
  return null;
}

/** Only the fields that changed (an edit sends a PATCH with these). */
export function changedFields(before: Product, d: ProductDraft): Partial<ProductFields> {
  const next = fieldsFrom(d);
  const prev: ProductFields = {
    name: before.name,
    description: before.description,
    price: before.price,
    compareAtPrice: before.compareAtPrice,
    categoryId: before.categoryId,
    status: before.status,
    sizes: before.sizes,
    colours: before.colours,
  };
  const changed: Partial<ProductFields> = {};
  for (const key of Object.keys(next) as (keyof ProductFields)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(prev[key])) {
      (changed as Record<string, unknown>)[key] = next[key];
    }
  }
  return changed;
}

export function photosChanged(before: PhotoInput[], after: PhotoInput[]): boolean {
  return (
    before.length !== after.length ||
    before.some((p, i) => p.objectKey !== after[i]!.objectKey || p.thumbKey !== after[i]!.thumbKey)
  );
}

/** Moves item `from` to `to` (photo order; index 0 is the cover). */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function toggleColour(colours: readonly Colour[], colour: Colour): Colour[] {
  const has = colours.some((c) => c.name.toLowerCase() === colour.name.toLowerCase());
  return has
    ? colours.filter((c) => c.name.toLowerCase() !== colour.name.toLowerCase())
    : [...colours, colour];
}

/** A typed colour: a preset's swatch when the name matches one, otherwise name only. */
export function customColour(
  colours: readonly Colour[],
  raw: string,
): { colours: Colour[]; error: string | null } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { colours: [...colours], error: 'Type a colour, e.g. Sunset print.' };
  if (name.length > 30)
    return { colours: [...colours], error: 'A colour can be at most 30 characters.' };
  if (colours.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    return { colours: [...colours], error: null };
  }
  if (colours.length >= 20) return { colours: [...colours], error: 'Add at most 20 colours.' };
  const preset = COLOUR_PRESETS.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return {
    colours: [...colours, preset ? { name: preset.name, hex: preset.hex } : { name }],
    error: null,
  };
}
