import { createCategory, listCategories } from '@/server/catalogueRoutes';

export const dynamic = 'force-dynamic';

// 20b-categories: the list (with counts and thumbnails) and new categories.
export const GET = listCategories;
export const POST = createCategory;
