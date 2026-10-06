import { getCustomers } from '@/server/insightsRoutes';

export const dynamic = 'force-dynamic';

// 20b-customers: buyers grouped by phone (sales only), with Repeat / New this month.
export const GET = getCustomers;
