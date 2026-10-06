// The seller app's calls for the Reviews screen (M7 CP3, 20b-reviews, decision #73).
import type { ReviewTab } from '@oda/shared';
import { apiJson } from '@/api';

export interface SellerReview {
  id: string;
  orderId: string;
  orderNumber: number;
  buyerDisplayName: string;
  rating: number;
  tags: string[];
  createdAt: string;
  edited: boolean;
  sellerReply: string | null;
  repliedAt: string | null;
  reportedAt: string | null;
  /** Hidden from buyers once reported; the seller still sees them. */
  photosHidden: boolean;
  items: {
    orderItemId: string;
    productId: string | null;
    productName: string;
    coverUrl: string | null;
    rating: number | null;
    text: string | null;
    photoUrl: string | null;
  }[];
}

export interface ReviewList {
  summary: {
    average: number | null;
    count: number;
    histogram: { stars: number; count: number }[];
  };
  counts: Record<ReviewTab, number>;
  reviews: SellerReview[];
  next: string | null;
}

export const reviewsApi = {
  list: (tab: ReviewTab, cursor?: string | null) => {
    const params = new URLSearchParams({ tab });
    if (cursor) params.set('cursor', cursor);
    return apiJson<ReviewList>(`/api/reviews?${params}`);
  },
  get: (id: string) => apiJson<SellerReview>(`/api/reviews/${id}`),
  reply: (id: string, reply: string) =>
    apiJson<SellerReview>(`/api/reviews/${id}/reply`, { method: 'PUT', body: { reply } }),
  report: (id: string, reason: string) =>
    apiJson<SellerReview>(`/api/reviews/${id}/report`, { body: { reason } }),
};
