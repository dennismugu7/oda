import { reorderCategories } from '@/server/catalogueRoutes';

export const dynamic = 'force-dynamic';

// Drag to reorder: the full list of category ids in the new order.
export const PUT = reorderCategories;
