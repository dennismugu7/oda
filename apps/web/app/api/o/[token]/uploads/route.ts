import { postReviewUpload } from '@/server/reviews';

export const dynamic = 'force-dynamic';

// A signed upload for one review photo, authorised by the order token (decision #73 k).
export const POST = postReviewUpload;
