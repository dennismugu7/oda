import { describe, expect, it } from 'vitest';
import type { ReviewList, SellerReview } from './api';
import { replaceReview, reviewsCache } from './cache';
import { avatarFor, emptyText, histogramBars, REVIEW_TABS, reviewLabel } from './view';

const review = (id: string, patch: Partial<SellerReview> = {}): SellerReview => ({
  id,
  orderId: 'o1',
  orderNumber: 1042,
  buyerDisplayName: 'Wanjiku M.',
  rating: 4,
  tags: [],
  createdAt: '2026-10-06T09:00:00Z',
  edited: false,
  sellerReply: null,
  repliedAt: null,
  reportedAt: null,
  photosHidden: false,
  items: [],
  ...patch,
});

const list = (reviews: SellerReview[]): ReviewList => ({
  summary: {
    average: 4.8,
    count: 38,
    histogram: [
      { stars: 5, count: 32 },
      { stars: 4, count: 4 },
      { stars: 3, count: 1 },
      { stars: 2, count: 0 },
      { stars: 1, count: 1 },
    ],
  },
  counts: { all: 38, needs_reply: 2, low: 2 },
  reviews,
  next: null,
});

describe('Reviews screen helpers', () => {
  it('tabs are All / Needs reply / Low ratings', () => {
    expect(REVIEW_TABS.map((t) => t.label)).toEqual(['All', 'Needs reply', 'Low ratings']);
    expect(emptyText('low').line).toContain('1 to 3 stars');
  });

  it('histogram bars are relative to the biggest', () => {
    const bars = histogramBars(list([]).summary);
    expect(bars.map((b) => b.fill)).toEqual([1, 4 / 32, 1 / 32, 0, 1 / 32]);
    const empty = histogramBars({ average: null, count: 0, histogram: [{ stars: 5, count: 0 }] });
    expect(empty[0]!.fill).toBe(0);
  });

  it('avatars are steady per name', () => {
    expect(avatarFor('Njeri K.').letter).toBe('N');
    expect(avatarFor('Njeri K.')).toEqual(avatarFor('Njeri K.'));
    expect(avatarFor('').letter).toBe('?');
  });

  it('a reply or report updates every tab’s copy', () => {
    const a = review('a');
    reviewsCache.setList('all', list([a, review('b')]));
    reviewsCache.setList('needs_reply', list([a]));
    const replied = { ...a, sellerReply: 'Asante!' };
    reviewsCache.update(replied);
    expect(reviewsCache.list('all')!.reviews[0]!.sellerReply).toBe('Asante!');
    expect(reviewsCache.list('needs_reply')!.reviews[0]!.sellerReply).toBe('Asante!');
    expect(replaceReview(list([review('b')]), replied).reviews[0]!.id).toBe('b');
    reviewsCache.clear();
    expect(reviewsCache.list('all')).toBeNull();
  });

  it('screen reader label', () => {
    expect(reviewLabel(review('a'), 'Yesterday')).toBe(
      'Wanjiku M., 4 out of 5 stars, Yesterday, order 1042',
    );
  });
});
