import { postReport } from '@/server/checkout';

export const dynamic = 'force-dynamic';

// "Report a problem to oda" from the order page (M5). Works for a closed shop too.
export const POST = postReport;
