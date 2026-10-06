import { postRemoveReview } from '@/server/reviews';

export const dynamic = 'force-dynamic';

// Removes a review (review-remove workflow, Bearer OPS_SECRET; 404 otherwise; decision #73 c).
export const POST = postRemoveReview;
