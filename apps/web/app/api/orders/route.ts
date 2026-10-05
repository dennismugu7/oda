import { listOrders } from '@/server/orderRoutes';

export const dynamic = 'force-dynamic';

// The Orders tab (17-orders): To do / All / Done, search, pages.
export const GET = listOrders;
