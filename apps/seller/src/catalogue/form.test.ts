import { describe, expect, it } from 'vitest';
import type { Product } from './api';
import {
  changedFields,
  customColour,
  draftFrom,
  draftProblem,
  emptyDraft,
  fieldsFrom,
  moneyText,
  move,
  photosChanged,
  toggleColour,
} from './form';

const product: Product = {
  id: 'p1',
  name: 'Ankara wrap dress',
  description: null,
  price: 2800,
  compareAtPrice: null,
  categoryId: null,
  status: 'available',
  sizes: ['M', 'L'],
  colours: [{ name: 'Black', hex: '#111111' }],
  unitsSold: 5,
  photos: [],
};

describe('product form (design 18-edit-product)', () => {
  it('formats money as typed and reads it back', () => {
    expect(moneyText('2800')).toBe('2,800');
    expect(moneyText('KSh 0012,500x')).toBe('12,500');
    expect(fieldsFrom({ ...emptyDraft(), name: ' Dress ', price: '2,800' })).toMatchObject({
      name: 'Dress',
      price: 2800,
      compareAtPrice: null,
      description: null,
    });
  });

  it('says what is missing before saving', () => {
    const ok = { ...emptyDraft(), name: 'Dress', price: '2,800' };
    expect(draftProblem(ok, 0)).toMatch(/Add a photo/);
    expect(draftProblem({ ...ok, name: ' ' }, 1)).toBe('Enter the product name.');
    expect(draftProblem({ ...ok, price: '' }, 1)).toBe('Enter the price in shillings.');
    expect(draftProblem({ ...ok, compareAtPrice: '2,800' }, 1)).toBe(
      'The was-price must be higher than the price.',
    );
    expect(draftProblem({ ...ok, compareAtPrice: '3,500' }, 1)).toBeNull();
    expect(draftProblem(ok, 6)).toBe('Add at most 5 photos.');
  });

  it('an edit sends only what changed', () => {
    const draft = draftFrom(product);
    expect(changedFields(product, draft)).toEqual({});
    expect(changedFields(product, { ...draft, status: 'sold_out', price: '3,000' })).toEqual({
      status: 'sold_out',
      price: 3000,
    });
    expect(changedFields(product, { ...draft, sizes: ['M'] })).toEqual({ sizes: ['M'] });
  });

  it('photo order: move, and notice a change', () => {
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    const a = { objectKey: 'a', thumbKey: 'at', width: null, height: null };
    const b = { objectKey: 'b', thumbKey: 'bt', width: null, height: null };
    expect(photosChanged([a, b], [a, b])).toBe(false);
    expect(photosChanged([a, b], [b, a])).toBe(true);
    expect(photosChanged([a, b], [a])).toBe(true);
  });

  it('colours: presets toggle; typed names use a preset swatch when they match', () => {
    const black = { name: 'Black', hex: '#111111' };
    expect(toggleColour([], black)).toEqual([black]);
    expect(toggleColour([black], { name: 'black' })).toEqual([]);
    expect(customColour([], 'maroon').colours).toEqual([{ name: 'Maroon', hex: '#800020' }]);
    expect(customColour([], ' Sunset   print ').colours).toEqual([{ name: 'Sunset print' }]);
    expect(customColour([black], 'BLACK')).toEqual({ colours: [black], error: null });
    expect(customColour([], '').error).toMatch(/Type a colour/);
    expect(customColour([], 'x'.repeat(31)).error).toMatch(/30 characters/);
  });
});
