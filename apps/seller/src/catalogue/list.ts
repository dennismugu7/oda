// The Shop tab's list logic (design 19), pure so it is unit-tested: the filter chips (All,
// each category, Sold out, Hidden), the search box, and each row's second line.
import { formatKsh } from '@oda/shared';
import type { Category, ProductSummary } from './api';

export type ShopFilter =
  | { kind: 'all' }
  | { kind: 'category'; id: string }
  | { kind: 'status'; status: 'sold_out' | 'hidden' };

export interface FilterChip {
  key: string;
  label: string;
  count: number;
  filter: ShopFilter;
}

/** All, then categories in their order (with products), then Sold out and Hidden if any. */
export function filterChips(products: ProductSummary[], categories: Category[]): FilterChip[] {
  const chips: FilterChip[] = [
    { key: 'all', label: 'All', count: products.length, filter: { kind: 'all' } },
  ];
  for (const c of categories) {
    const count = products.filter((p) => p.categoryId === c.id).length;
    if (count > 0) {
      chips.push({ key: c.id, label: c.name, count, filter: { kind: 'category', id: c.id } });
    }
  }
  for (const [status, label] of [
    ['sold_out', 'Sold out'],
    ['hidden', 'Hidden'],
  ] as const) {
    const count = products.filter((p) => p.status === status).length;
    if (count > 0) chips.push({ key: status, label, count, filter: { kind: 'status', status } });
  }
  return chips;
}

export function applyFilter(
  products: ProductSummary[],
  filter: ShopFilter,
  search = '',
): ProductSummary[] {
  const q = search.trim().toLowerCase();
  return products.filter((p) => {
    if (filter.kind === 'category' && p.categoryId !== filter.id) return false;
    if (filter.kind === 'status' && p.status !== filter.status) return false;
    return !q || p.name.toLowerCase().includes(q);
  });
}

/** "Sizes M, L, XL · 5 sold", "One size", "Shown as sold out", "Hidden from buyers". */
export function rowDetail(p: ProductSummary): string {
  if (p.status === 'sold_out') return 'Shown as sold out';
  if (p.status === 'hidden') return 'Hidden from buyers';
  const parts: string[] = [];
  if (p.sizes.length === 1) parts.push(p.sizes[0]!);
  else if (p.sizes.length > 1) {
    const shown = p.sizes.slice(0, 3).join(', ');
    parts.push(`Sizes ${shown}${p.sizes.length > 3 ? '…' : ''}`);
  }
  if (p.unitsSold > 0) parts.push(`${p.unitsSold} sold`);
  if (parts.length === 0 && p.compareAtPrice) parts.push(`Was ${formatKsh(p.compareAtPrice)}`);
  return parts.join(' · ');
}

/** The filter chips buyers see (20b1 preview): visible categories with products, in order. */
export function buyerFilters(categories: Category[]): string[] {
  return ['All', ...categories.filter((c) => c.isVisible && c.productCount > 0).map((c) => c.name)];
}
