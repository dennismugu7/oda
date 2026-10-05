import { createManualOrder, listOrders } from '@/server/orderRoutes';

export const dynamic = 'force-dynamic';

// The Orders tab (17-orders): To do / All / Done, search, pages.
export const GET = listOrders;

// New order (17-new-order): a manual order from a DM, a call or in person.
export const POST = createManualOrder;
