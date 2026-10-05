import { quoteManualOrder } from '@/server/orderRoutes';

export const dynamic = 'force-dynamic';

// New order (17-new-order): what a manual order of these lines costs with each option.
export const POST = quoteManualOrder;
