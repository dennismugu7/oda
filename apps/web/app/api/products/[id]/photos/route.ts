import { setProductPhotos } from '@/server/catalogueRoutes';

export const dynamic = 'force-dynamic';

// The product's photo list in order: add, remove, reorder, new cover.
export const PUT = setProductPhotos;
