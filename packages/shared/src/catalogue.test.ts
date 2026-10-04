import { describe, expect, it } from 'vitest';
import {
  categoryOrderInput,
  categoryProductsInput,
  COLOUR_PRESETS,
  productPhotoList,
} from './catalogue';
import { productInput } from './schemas/write';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const photo = (n: number) => ({
  objectKey: `products/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/p${n}.jpg`,
  thumbKey: `products/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/p${n}_t.jpg`,
});

describe('catalogue inputs (M3)', () => {
  it('colour presets: the 15 agreed colours, valid for products', () => {
    expect(COLOUR_PRESETS.map((c) => c.name)).toEqual([
      'Black',
      'White',
      'Grey',
      'Navy',
      'Blue',
      'Red',
      'Pink',
      'Green',
      'Yellow',
      'Orange',
      'Brown',
      'Beige',
      'Maroon',
      'Purple',
      'Gold',
    ]);
    const parsed = productInput.parse({
      name: 'Dress',
      price: 100,
      colours: [...COLOUR_PRESETS.map((c) => ({ ...c })), { name: 'Sunset print' }],
    });
    expect(parsed.colours).toHaveLength(16);
  });

  it('photos: 1–5, each file once', () => {
    expect(productPhotoList.safeParse([photo(1)]).success).toBe(true);
    expect(productPhotoList.safeParse([]).success).toBe(false);
    expect(productPhotoList.safeParse([1, 2, 3, 4, 5, 6].map(photo)).success).toBe(false);
    expect(productPhotoList.safeParse([photo(1), photo(1)]).success).toBe(false);
  });

  it('category order and assignment lists: ids only, no repeats', () => {
    const a = id();
    expect(categoryOrderInput.safeParse({ ids: [a, id()] }).success).toBe(true);
    expect(categoryOrderInput.safeParse({ ids: [] }).success).toBe(false);
    expect(categoryOrderInput.safeParse({ ids: [a, a] }).success).toBe(false);
    expect(categoryOrderInput.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(categoryProductsInput.safeParse({ productIds: [] }).success).toBe(true);
    expect(categoryProductsInput.safeParse({ productIds: [a], extra: 1 }).success).toBe(false);
  });
});
