import { getDelivery, putDelivery } from '@/server/deliveryRoutes';

export const dynamic = 'force-dynamic';

// 20b-delivery: the whole screen (areas, pickup, free delivery) and its settings.
export const GET = getDelivery;
export const PUT = putDelivery;
