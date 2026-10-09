// The seller app's calls to /api/products and /api/categories (M3, decision #57).
import type { ProductStatus } from '@oda/shared';
import { apiJson } from '@/api';

export interface Colour {
  name: string;
  hex?: string;
}

export interface ProductSummary {
  id: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  status: ProductStatus;
  categoryId: string | null;
  sizes: string[];
  colours: Colour[];
  unitsSold: number;
  coverUrl: string | null;
  updatedAt: string;
}

export interface ProductList {
  products: ProductSummary[];
  counts: Record<'all' | ProductStatus, number>;
}

export interface PhotoInput {
  objectKey: string;
  thumbKey: string;
  width: number | null;
  height: number | null;
}

export interface ProductPhoto extends PhotoInput {
  id: string;
  position: number;
  url: string | null;
  thumbUrl: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  categoryId: string | null;
  status: ProductStatus;
  sizes: string[];
  colours: Colour[];
  unitsSold: number;
  photos: ProductPhoto[];
}

export interface ProductFields {
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  categoryId: string | null;
  status: ProductStatus;
  sizes: string[];
  colours: Colour[];
}

export interface Category {
  id: string;
  name: string;
  isVisible: boolean;
  position: number;
  productCount: number;
  /** Up to three product covers. */
  thumbUrls: string[];
}

const photoBody = (photos: PhotoInput[]) =>
  photos.map(({ objectKey, thumbKey, width, height }) => ({ objectKey, thumbKey, width, height }));

export const catalogueApi = {
  products: () => apiJson<ProductList>('/api/products'),
  product: (id: string) => apiJson<Product>(`/api/products/${id}`),
  /** `photoLater`: no photos while photo uploads are paused (decision #93 D1). */
  create: (fields: ProductFields, photos: PhotoInput[], photoLater = false) =>
    apiJson<Product>('/api/products', {
      body: {
        ...fields,
        photos: photoBody(photos),
        ...(photoLater && photos.length === 0 ? { photoLater: true } : {}),
      },
    }),
  update: (id: string, fields: Partial<ProductFields>) =>
    apiJson<Product>(`/api/products/${id}`, { method: 'PATCH', body: fields }),
  setPhotos: (id: string, photos: PhotoInput[]) =>
    apiJson<Product>(`/api/products/${id}/photos`, {
      method: 'PUT',
      body: { photos: photoBody(photos) },
    }),
  remove: (id: string) => apiJson<object>(`/api/products/${id}`, { method: 'DELETE' }),
  restore: (id: string) => apiJson<Product>(`/api/products/${id}/restore`, { body: {} }),

  categories: () => apiJson<Category[]>('/api/categories'),
  createCategory: (name: string) => apiJson<Category>('/api/categories', { body: { name } }),
  updateCategory: (id: string, fields: { name?: string; isVisible?: boolean }) =>
    apiJson<Category>(`/api/categories/${id}`, { method: 'PATCH', body: fields }),
  deleteCategory: (id: string) => apiJson<object>(`/api/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (ids: string[]) =>
    apiJson<Category[]>('/api/categories/order', { method: 'PUT', body: { ids } }),
  setCategoryProducts: (id: string, productIds: string[]) =>
    apiJson<ProductList>(`/api/categories/${id}/products`, {
      method: 'PUT',
      body: { productIds },
    }),
};
