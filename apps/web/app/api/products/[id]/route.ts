import { deleteProduct, getProduct, updateProduct } from '@/server/catalogueRoutes';

export const dynamic = 'force-dynamic';

// One product: read, edit (any fields, e.g. just the status), soft delete.
export const GET = getProduct;
export const PATCH = updateProduct;
export const DELETE = deleteProduct;
