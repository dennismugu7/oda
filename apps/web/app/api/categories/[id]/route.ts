import { deleteCategory, updateCategory } from '@/server/catalogueRoutes';

export const dynamic = 'force-dynamic';

// Rename, show/hide or delete a category (its products stay, without one).
export const PATCH = updateCategory;
export const DELETE = deleteCategory;
