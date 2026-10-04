import { describe, expect, it } from 'vitest';
import type { Category, ProductSummary } from './api';
import { applyFilter, buyerFilters, filterChips, rowDetail } from './list';

const product = (over: Partial<ProductSummary> = {}): ProductSummary => ({
  id: Math.random().toString(36).slice(2),
  name: 'Ankara wrap dress',
  price: 2500,
  compareAtPrice: null,
  status: 'available',
  categoryId: null,
  sizes: [],
  colours: [],
  unitsSold: 0,
  coverUrl: null,
  updatedAt: '2026-10-04T10:00:00Z',
  ...over,
});
const category = (id: string, name: string): Category => ({
  id,
  name,
  isVisible: true,
  position: 0,
  productCount: 0,
  thumbUrls: [],
});

describe('Shop tab list (design 19)', () => {
  const products = [
    product({ categoryId: 'c1', name: 'Kitenge top' }),
    product({ categoryId: 'c1', status: 'sold_out' }),
    product({ status: 'hidden', name: 'Maxi skirt' }),
  ];
  const categories = [category('c1', 'Dresses'), category('c2', 'Bags')];

  it('chips: All, categories with products (in order), then Sold out and Hidden', () => {
    expect(filterChips(products, categories).map((c) => [c.label, c.count])).toEqual([
      ['All', 3],
      ['Dresses', 2],
      ['Sold out', 1],
      ['Hidden', 1],
    ]);
    expect(filterChips([], categories).map((c) => c.label)).toEqual(['All']);
  });

  it('filters by chip and searches by name', () => {
    expect(applyFilter(products, { kind: 'category', id: 'c1' })).toHaveLength(2);
    expect(applyFilter(products, { kind: 'status', status: 'hidden' })[0]!.name).toBe('Maxi skirt');
    expect(applyFilter(products, { kind: 'all' }, '  KITENGE ')).toHaveLength(1);
    expect(applyFilter(products, { kind: 'category', id: 'c1' }, 'skirt')).toHaveLength(0);
  });

  it('each row says the sizes and sales, or why buyers can’t order', () => {
    expect(rowDetail(product({ sizes: ['M', 'L', 'XL'], unitsSold: 5 }))).toBe(
      'Sizes M, L, XL · 5 sold',
    );
    expect(rowDetail(product({ sizes: ['S', 'M', 'L', 'XL'] }))).toBe('Sizes S, M, L…');
    expect(rowDetail(product({ sizes: ['One size'], unitsSold: 4 }))).toBe('One size · 4 sold');
    expect(rowDetail(product({ status: 'sold_out', sizes: ['M'] }))).toBe('Shown as sold out');
    expect(rowDetail(product({ status: 'hidden' }))).toBe('Hidden from buyers');
    expect(rowDetail(product({ compareAtPrice: 3000 }))).toBe('Was KSh 3,000');
    expect(rowDetail(product())).toBe('');
  });

  it('buyers only see visible categories that have products', () => {
    const cats = [
      { ...category('a', 'Dresses'), productCount: 4 },
      { ...category('b', 'Tops'), productCount: 3, isVisible: false },
      { ...category('c', 'Accessories'), productCount: 0 },
    ];
    expect(buyerFilters(cats)).toEqual(['All', 'Dresses']);
  });
});
