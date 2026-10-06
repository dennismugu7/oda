// Pure helpers for the Reviews screen (20b-reviews), unit-tested.
import type { ReviewTab } from '@oda/shared';
import { colors } from '@/theme';
import type { ReviewList, SellerReview } from './api';

export const REVIEW_TABS: { key: ReviewTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_reply', label: 'Needs reply' },
  { key: 'low', label: 'Low ratings' },
];

/** Bar widths for the 5→1 histogram, as fractions of the biggest bar (0 when empty). */
export function histogramBars(
  summary: ReviewList['summary'],
): { stars: number; count: number; fill: number }[] {
  const max = Math.max(0, ...summary.histogram.map((h) => h.count));
  return summary.histogram.map((h) => ({ ...h, fill: max ? h.count / max : 0 }));
}

/** The avatar's letter and tint, steady per name (design: N on beige, W on peach). */
export function avatarFor(name: string): { letter: string; background: string; color: string } {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  const palette = [
    { background: colors.peach, color: colors.primary },
    { background: colors.beige, color: colors.warningText },
    { background: colors.greenTint, color: colors.green },
    { background: colors.infoTint, color: colors.info },
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return { letter, ...palette[hash % palette.length]! };
}

/** The empty state for a tab. */
export function emptyText(tab: ReviewTab): { title: string; line: string } {
  if (tab === 'needs_reply') {
    return { title: 'All replied', line: 'Every review has your reply.' };
  }
  if (tab === 'low') {
    return { title: 'No low ratings', line: 'Reviews with 1 to 3 stars show here.' };
  }
  return {
    title: 'No reviews yet',
    line: 'Buyers can rate their order once you mark it as delivered.',
  };
}

/** The screen reader text for a review card's header. */
export function reviewLabel(r: SellerReview, when: string): string {
  return `${r.buyerDisplayName}, ${r.rating} out of 5 stars, ${when}, order ${r.orderNumber}`;
}
