import { createProduct, listProducts } from '@/server/catalogueRoutes';

export const dynamic = 'force-dynamic';

// The Shop tab list (with filters) and new products (M3).
export const GET = listProducts;
export const POST = createProduct;
