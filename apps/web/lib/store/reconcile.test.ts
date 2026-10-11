import { describe, expect, it } from 'vitest';
import type { CartLine } from './cart';
import { reconcile, type CurrentProduct } from './reconcile';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: 'p1',
  size: null,
  colour: null,
  qty: 1,
  price: 2500,
  name: 'Dress',
  coverUrl: null,
  ...over,
});
const product = (over: Partial<CurrentProduct> = {}): CurrentProduct => ({
  id: 'p1',
  name: 'Dress',
  price: 2500,
  status: 'available',
  sizes: ['M', 'L'],
  colours: [{ name: 'Maroon' }],
  categoryId: null,
  coverUrl: null,
  ...over,
});
const map = (...ps: CurrentProduct[]) => new Map(ps.map((p) => [p.id, p]));

describe('cart check against current products (spec §6.3)', () => {
  it('leaves an unchanged line alone', () => {
    expect(reconcile([line({ size: 'M' })], map(product()))).toEqual([
      { line: line({ size: 'M' }), problem: null, remove: false },
    ]);
  });

  it('flags a new price and uses it', () => {
    const [c] = reconcile([line()], map(product({ price: 2800 })));
    expect(c).toMatchObject({
      problem: 'Price changed from KSh 2,500 to KSh 2,800.',
      remove: false,
      line: { price: 2800 },
    });
  });

  it('flags sold out, gone and removed options, for removal', () => {
    expect(reconcile([line()], map(product({ status: 'sold_out' })))[0]).toMatchObject({
      problem: 'Sold out. Remove it to continue.',
      remove: true,
    });
    expect(reconcile([line()], map())[0]!.problem).toBe(
      'No longer available. Remove it to continue.',
    );
    expect(reconcile([line({ size: 'XL' })], map(product()))[0]!.problem).toBe(
      'Size XL is no longer available.',
    );
    expect(reconcile([line({ colour: 'Gold' })], map(product()))[0]!.problem).toBe(
      'Gold is no longer available.',
    );
  });

  it('picks up a renamed product', () => {
    expect(reconcile([line()], map(product({ name: 'Wrap dress' })))[0]!.line.name).toBe(
      'Wrap dress',
    );
  });
});
