import { postShopSuspension } from '@/server/suspension';

export const dynamic = 'force-dynamic';

// Suspends or unsuspends a shop (shop-suspend workflow, Bearer OPS_SECRET; 404 otherwise;
// decisions #72 d, #81 d).
export const POST = postShopSuspension;
