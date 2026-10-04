import { describe, expect, it } from 'vitest';
import {
  addLine,
  cartCount,
  cartTotal,
  inCart,
  parseIds,
  parseLines,
  setQty,
  type CartLine,
} from './cart';

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

describe('cart on this device (spec §6.3)', () => {
  it('adds lines, merging the same product, size and colour', () => {
    let lines = addLine([], line());
    lines = addLine(lines, line({ qty: 2 }));
    lines = addLine(lines, line({ size: 'M' }));
    expect(lines.map((l) => [l.size, l.qty])).toEqual([
      [null, 3],
      ['M', 1],
    ]);
    expect(cartCount(lines)).toBe(4);
    expect(cartTotal(lines)).toBe(10000);
    expect(inCart(lines, 'p1')).toBe(true);
    expect(inCart(lines, 'p2')).toBe(false);
  });

  it('caps quantities at 99 and removes a line at 0', () => {
    expect(addLine([line({ qty: 98 })], line({ qty: 5 }))[0]!.qty).toBe(99);
    expect(setQty([line(), line({ size: 'M' })], 0, 0)).toHaveLength(1);
    expect(setQty([line()], 0, 500)[0]!.qty).toBe(99);
  });

  it('reads storage defensively', () => {
    expect(parseLines(null)).toEqual([]);
    expect(parseLines('not json')).toEqual([]);
    expect(parseLines('{"a":1}')).toEqual([]);
    expect(
      parseLines(
        JSON.stringify([line(), { productId: 'x', qty: -1, price: 1, name: 'bad' }, null, 5]),
      ),
    ).toEqual([line()]);
    expect(parseIds('["a", 3, "b"]')).toEqual(['a', 'b']);
    expect(parseIds('oops')).toEqual([]);
  });
});
