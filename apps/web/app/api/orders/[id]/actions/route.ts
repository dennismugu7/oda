import { after } from 'next/server';
import { postOrderAction } from '@/server/orderRoutes';

export const dynamic = 'force-dynamic';

// Every seller action on an order, only through transitionOrder().
export const POST = postOrderAction(after);
