import { getReview } from '@/server/reviews';

export const dynamic = 'force-dynamic';

// One review of the seller's shop (a tapped new_review notification).
export const GET = getReview;
