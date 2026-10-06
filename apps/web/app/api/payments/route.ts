import { getPayments, patchPayments } from '@/server/settingsRoutes';

export const dynamic = 'force-dynamic';

// 20b-payments: accounts and "When buyers pay".
export const GET = getPayments;
export const PATCH = patchPayments;
