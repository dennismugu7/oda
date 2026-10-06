import { getProductReviews } from '@/server/storefrontRoutes';

export const dynamic = 'force-dynamic';

// More of a product's reviews for its page (M7): newest first, 20 a page, no buyer contact.
export const GET = getProductReviews;
