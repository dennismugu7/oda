import 'server-only';
import { z } from 'zod';
import {
  categoryInput,
  categoryOrderInput,
  categoryProductsInput,
  categoryUpdate,
  PRODUCT_STATUSES,
  productInput,
  productPhotoList,
  productPhotosInput,
  productUpdate,
} from '@oda/shared';
import { requireSeller } from './authz';
import { getDb } from './db';
import { parseInput, toResponse, ValidationError } from './errors';
import { catalogueRepo } from './repos/catalogue';

// HTTP handlers for the seller's catalogue (M3): /api/products and /api/categories. Every
// handler needs a seller with a shop (requireSeller) and only touches that shop's rows.

type Params = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: Params) => Promise<Response>;

function handle(
  run: (request: Request, id: string | null) => Promise<unknown>,
  status = 200,
): Handler {
  return async (request, context) => {
    try {
      const id = context?.params ? (await context.params).id : null;
      const result = await run(request, id);
      if (result === undefined) return new Response(null, { status: 204 });
      return Response.json(result, { status, headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return toResponse(error);
    }
  };
}

const body = (request: Request) => request.json().catch(() => null);

async function repo(request: Request) {
  const db = getDb();
  return catalogueRepo(db, await requireSeller(request, db));
}

const listQuery = z.strictObject({
  status: z.enum(PRODUCT_STATUSES, { error: 'Unknown status.' }).optional(),
  category: z.string().max(40).optional(),
});

/** GET /api/products?status=…&category=<id>|none */
export const listProducts = handle(async (request) => {
  const query = parseInput(
    listQuery,
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  return (await repo(request)).listProducts({
    status: query.status,
    categoryId: query.category,
  });
});

/** POST /api/products: the product's fields plus `photos` (1–5, the first is the cover). */
export const createProduct = handle(async (request) => {
  const raw = await body(request);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Send the product as JSON.');
  }
  const { photos, ...fields } = raw as Record<string, unknown>;
  const input = parseInput(productInput, fields);
  const list = parseInput(productPhotoList, photos);
  return (await repo(request)).createProduct(input, list);
}, 201);

/** GET /api/products/:id */
export const getProduct = handle(async (request, id) => (await repo(request)).product(id!));

/** PATCH /api/products/:id: any product fields (e.g. just `status`). */
export const updateProduct = handle(async (request, id) =>
  (await repo(request)).updateProduct(id!, parseInput(productUpdate, await body(request))),
);

/** DELETE /api/products/:id: soft delete (undo with POST …/restore for a few minutes). */
export const deleteProduct = handle(async (request, id) => {
  await (await repo(request)).deleteProduct(id!);
  return undefined;
});

/** POST /api/products/:id/restore: "Undo" a delete. */
export const restoreProduct = handle(async (request, id) =>
  (await repo(request)).restoreProduct(id!),
);

/** PUT /api/products/:id/photos: the full photo list in order (add, remove, reorder, cover). */
export const setProductPhotos = handle(async (request, id) => {
  const { photos } = parseInput(productPhotosInput, await body(request));
  return (await repo(request)).setPhotos(id!, photos);
});

/** GET /api/categories */
export const listCategories = handle(async (request) => (await repo(request)).listCategories());

/** POST /api/categories: name (+ isVisible); it goes to the end of the list. */
export const createCategory = handle(async (request) => {
  const input = parseInput(categoryInput.omit({ position: true }), await body(request));
  return (await repo(request)).createCategory({ ...input, position: 0 });
}, 201);

/** PATCH /api/categories/:id: rename or show/hide (order: PUT /api/categories/order). */
export const updateCategory = handle(async (request, id) =>
  (await repo(request)).updateCategory(
    id!,
    parseInput(categoryUpdate.omit({ position: true }), await body(request)),
  ),
);

/** DELETE /api/categories/:id: its products stay, without a category. */
export const deleteCategory = handle(async (request, id) => {
  await (await repo(request)).deleteCategory(id!);
  return undefined;
});

/** PUT /api/categories/order: `ids` = every category of the shop, in the new order. */
export const reorderCategories = handle(async (request) => {
  const { ids } = parseInput(categoryOrderInput, await body(request));
  return (await repo(request)).reorderCategories(ids);
});

/** PUT /api/categories/:id/products: exactly these products are in the category. */
export const setCategoryProducts = handle(async (request, id) => {
  const { productIds } = parseInput(categoryProductsInput, await body(request));
  return (await repo(request)).setCategoryProducts(id!, productIds);
});
