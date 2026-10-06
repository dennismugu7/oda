import { getFeedback, postFeedback } from '@/server/settingsRoutes';

export const dynamic = 'force-dynamic';

// 21-share-feedback: what the form needs, and sending it (5 a day per shop).
export const GET = getFeedback;
export const POST = postFeedback;
