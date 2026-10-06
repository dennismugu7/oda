import { postReviewReport } from '@/server/reviews';

export const dynamic = 'force-dynamic';

// The seller reports a review: its photos are hidden publicly (decision #73 a).
export const POST = postReviewReport;
