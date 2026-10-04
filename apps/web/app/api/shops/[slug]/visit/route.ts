import { postVisit } from '@/server/storefrontRoutes';

export const dynamic = 'force-dynamic';

// Counts one shop visit a day per browser (oda_v cookie, decision #59).
export const POST = postVisit;
