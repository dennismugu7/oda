import { restoreProduct } from '@/server/catalogueRoutes';

export const dynamic = 'force-dynamic';

// "Undo" a product delete, for a few minutes.
export const POST = restoreProduct;
