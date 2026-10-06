import { putReviewReply } from '@/server/reviews';

export const dynamic = 'force-dynamic';

// The seller's reply (one per review, editable; empty removes it).
export const PUT = putReviewReply;
