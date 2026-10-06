// The Reviews screen's saved lists (no network imports, so it is unit-tested).
import type { ReviewTab } from '@oda/shared';
import type { ReviewList, SellerReview } from './api';

/** Swaps an updated review into a list (after a reply or a report). */
export function replaceReview(list: ReviewList, review: SellerReview): ReviewList {
  return { ...list, reviews: list.reviews.map((r) => (r.id === review.id ? review : r)) };
}

// What was last loaded, so the screen opens at once and shows saved data offline (spec §8:
// read-only, nothing queued).
const lists = new Map<ReviewTab, ReviewList>();
export const reviewsCache = {
  list: (tab: ReviewTab) => lists.get(tab) ?? null,
  setList: (tab: ReviewTab, value: ReviewList) => lists.set(tab, value),
  /** A reply or report changes every tab's copy of that review. */
  update: (review: SellerReview) => {
    for (const [tab, list] of lists) lists.set(tab, replaceReview(list, review));
  },
  clear: () => lists.clear(),
};
