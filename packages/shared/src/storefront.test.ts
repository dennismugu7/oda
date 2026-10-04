import { describe, expect, it } from 'vitest';
import {
  cartLookupInput,
  nairobiDay,
  productBadges,
  storeQuery,
  visitCookie,
  visitSource,
} from './storefront';

const A = '0b1c2d3e-0000-4000-8000-000000000001';
const B = 'ffeeddcc-0000-4000-8000-000000000002';

describe('storefront rules (M4)', () => {
  it('visit sources: the share tags, anything else is direct', () => {
    expect(visitSource('tt')).toBe('tt');
    expect(visitSource(' WA ')).toBe('wa');
    expect(visitSource('qr')).toBe('qr');
    expect(visitSource('manual')).toBe('direct');
    expect(visitSource('evil<script>')).toBe('direct');
    expect(visitSource(null)).toBe('direct');
  });

  it('query string: keeps good values, drops bad ones without failing', () => {
    expect(storeQuery.parse({ q: ' dress ', sort: 'price_asc', max: '2500', size: 'M' })).toEqual({
      q: 'dress',
      sort: 'price_asc',
      max: 2500,
      size: 'M',
    });
    expect(storeQuery.parse({ c: 'not-a-uuid', sort: 'cheapest', max: '-3' })).toEqual({});
  });

  it('cart lookup: ids only, at most 50, repeats merged', () => {
    expect(cartLookupInput.parse({ productIds: [A, A, B] }).productIds).toEqual([A, B]);
    expect(cartLookupInput.safeParse({ productIds: ['x'] }).success).toBe(false);
    expect(cartLookupInput.safeParse({ productIds: [A], extra: 1 }).success).toBe(false);
  });

  it('badges: sold out, then top-3 bestsellers (3+ sold), then new (14 days)', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const old = new Date('2026-08-01T00:00:00Z');
    const recent = new Date('2026-09-25T00:00:00Z');
    const products = [
      { id: 'a', status: 'available', unitsSold: 10, createdAt: old },
      { id: 'b', status: 'available', unitsSold: 8, createdAt: recent },
      { id: 'c', status: 'available', unitsSold: 5, createdAt: old },
      { id: 'd', status: 'available', unitsSold: 4, createdAt: old },
      { id: 'e', status: 'available', unitsSold: 2, createdAt: recent },
      { id: 'f', status: 'sold_out', unitsSold: 50, createdAt: recent },
      { id: 'g', status: 'available', unitsSold: 0, createdAt: old },
    ];
    const badges = productBadges(products, now);
    expect(Object.fromEntries(badges)).toEqual({
      a: 'bestseller',
      b: 'bestseller',
      c: null,
      d: null,
      e: 'new',
      f: 'sold_out',
      g: null,
    });
  });

  it('Nairobi days (UTC+3)', () => {
    expect(nairobiDay(new Date('2026-10-04T20:59:00Z'))).toBe('2026-10-04');
    expect(nairobiDay(new Date('2026-10-04T21:00:00Z'))).toBe('2026-10-05');
  });

  it('the oda_v cookie counts a shop once a day', () => {
    const first = visitCookie(undefined, A, '2026-10-04');
    expect(first).toEqual({ count: true, value: '2026-10-04.0b1c2d3e' });
    expect(visitCookie(first.value, A, '2026-10-04').count).toBe(false);
    const other = visitCookie(first.value, B, '2026-10-04');
    expect(other).toEqual({ count: true, value: '2026-10-04.0b1c2d3e-ffeeddcc' });
    expect(visitCookie(other.value, A, '2026-10-05')).toEqual({
      count: true,
      value: '2026-10-05.0b1c2d3e',
    });
    expect(visitCookie('garbage;;', A, '2026-10-04').count).toBe(true);
  });
});
