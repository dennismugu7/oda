import 'server-only';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import { PRODUCT_PHOTOS_MAX } from '@oda/shared';
import { z } from 'zod';
import type { SellerCtx } from './authz';
import { getDb } from './db';
import { ForbiddenError, HttpError, TooManyRequestsError, ValidationError } from './errors';
import { hasLocationData, sniffImageType, type ImageType } from './imageCheck';
import { hitLimit } from './rateLimit';
import {
  getPrivateStorage,
  getStorage,
  StoragePausedError,
  StorageUnavailableError,
} from './storage';

// Uploads (docs/data-model.md → File storage, decision #52). The phone asks for an upload,
// sends the file straight to storage, then saves the key through the API, which checks the
// stored bytes before any row points at it: a real JPEG/PNG/WebP, at most 5 MB, under the
// seller's own shop prefix, and without location data. Replaced and rejected objects are
// queued in storage_deletions and deleted right away (the M8 purge retries leftovers).
// Feedback screenshots go to the private store instead (decision #74 b).

export const SHOP_KEY_PREFIXES = ['products', 'logos', 'feedback'] as const;
export type ShopKeyPrefix = (typeof SHOP_KEY_PREFIXES)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOADS_PER_HOUR = { window: 3600, max: 120 };

/** Throws 403 unless `key` is `{prefix}/{ctx.shopId}/…` for one of `allowed`. */
export function assertOwnsKey(
  ctx: SellerCtx,
  key: string,
  allowed: readonly ShopKeyPrefix[] = SHOP_KEY_PREFIXES,
): void {
  const owns = allowed.some((prefix) => {
    const start = `${prefix}/${ctx.shopId}/`;
    return key.startsWith(start) && key.length > start.length && !key.includes('..');
  });
  if (!owns) throw new ForbiddenError('This photo upload is not valid.');
}

const EXTENSIONS: Record<string, ImageType> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const EXT_OF: Record<ImageType, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export const uploadRequest = z.strictObject({
  kind: z.enum(['product', 'logo', 'feedback'], { error: 'Unknown upload.' }),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    error: 'Use a JPEG, PNG or WebP photo.',
  }),
  size: z
    .number()
    .int()
    .min(1, { error: 'This photo is empty.' })
    .max(MAX_UPLOAD_BYTES, { error: 'This photo is too big (5 MB at most).' }),
});
export type UploadRequest = z.infer<typeof uploadRequest>;

export class UploadsOffError extends HttpError {
  constructor() {
    super(503, "Photo uploads aren't switched on yet. Try again later.", 'uploads_off');
  }
}

/** The store refused or didn't answer (e.g. Vercel Blob stopped at a Hobby limit, #93 D1). */
export class StoragePausedHttpError extends HttpError {
  constructor() {
    super(503, 'Photo uploads are paused for now. Try again later.', 'storage_unavailable');
  }
}

/** Runs a storage call, answering 503 when storage is off or not answering. */
export async function storageStep<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StorageUnavailableError) throw new UploadsOffError();
    if (error instanceof StoragePausedError) throw new StoragePausedHttpError();
    throw error;
  }
}

const isPrivateKey = (key: string) => key.startsWith('feedback/');

/** Where a key lives: feedback screenshots in the private store, everything else public. */
function storeFor(key: string) {
  if (!isPrivateKey(key)) return getStorage();
  const store = getPrivateStorage();
  if (!store) throw new UploadsOffError();
  return store;
}

/** Whether feedback screenshots can be uploaded (the private store is connected). */
export function screenshotsEnabled(): boolean {
  try {
    return getPrivateStorage() !== null;
  } catch {
    return false;
  }
}

/** POST /api/uploads: a signed upload for one file, at a key the server chooses. */
export async function createUpload(ctx: SellerCtx, input: UploadRequest, db: Db = getDb()) {
  if (!(await hitLimit(db, `uploads:${ctx.shopId}`, UPLOADS_PER_HOUR))) {
    throw new TooManyRequestsError('Too many photos for now. Try again in an hour.', 3600);
  }
  const prefix: ShopKeyPrefix =
    input.kind === 'logo' ? 'logos' : input.kind === 'feedback' ? 'feedback' : 'products';
  const key = `${prefix}/${ctx.shopId}/${randomUUID()}.${EXT_OF[EXTENSIONS[input.contentType]!]}`;
  return storageStep(async () => {
    if (input.kind === 'feedback') {
      const upload = await storeFor(key).presignPut(key, input.contentType, input.size);
      return { key, publicUrl: null, ...upload };
    }
    const upload = await getStorage().presignPut(key, input.contentType, input.size);
    return { key, publicUrl: getStorage().publicUrl(key), ...upload };
  });
}

/** Product photo keys a restored draft still points at (decision #111): at most 5 photos × 2. */
export const uploadsCheck = z.strictObject({
  keys: z
    .array(z.string().min(1).max(300), { error: 'Send the photo keys to check.' })
    .min(1, { error: 'Send the photo keys to check.' })
    .max(PRODUCT_PHOTOS_MAX * 2, { error: 'Too many photos to check.' }),
});

/**
 * POST /api/uploads/check: which of the seller's own product photo files are gone (decision
 * #111 c). A draft kept on the phone for up to 7 days may point at a photo the purge removed
 * (or that was replaced); the app drops those quietly and shows the rest from `urls`.
 */
export async function checkUploads(ctx: SellerCtx, keys: string[]) {
  for (const key of keys) assertOwnsKey(ctx, key, ['products']);
  const unique = [...new Set(keys)];
  return storageStep(async () => {
    const store = getStorage();
    const found = await Promise.all(unique.map(async (key) => (await store.read(key)) !== null));
    return {
      missing: unique.filter((_, i) => !found[i]),
      urls: Object.fromEntries(
        unique.filter((_, i) => found[i]).map((key) => [key, store.publicUrl(key)]),
      ),
    };
  });
}

const MISSING = "We couldn't find that photo. Upload it again.";

/**
 * Checks a stored upload before a row points at it. Throws (and queues the object for
 * deletion) when it's missing, too big, not really a JPEG/PNG/WebP (or not the type its
 * key says), or still carries location data.
 */
export async function verifyStoredImage(
  ctx: SellerCtx,
  key: string,
  allowed: readonly ShopKeyPrefix[],
  db: Db = getDb(),
): Promise<void> {
  assertOwnsKey(ctx, key, allowed);
  await checkStoredBytes(key, db);
}

/**
 * The byte checks of verifyStoredImage() for a key whose ownership the caller already
 * checked (review photos are owned through the order token, decision #73 k).
 */
export async function checkStoredBytes(key: string, db: Db = getDb()): Promise<void> {
  const bytes = await storageStep(() => storeFor(key).read(key));
  if (!bytes || bytes.length === 0) throw new ValidationError(MISSING, undefined, 'UPLOAD_MISSING');

  const reject = async (message: string, code: string) => {
    await queueDeletions(db, [key]);
    await flushDeletions(db, [key]);
    throw new ValidationError(message, undefined, code);
  };
  if (bytes.length > MAX_UPLOAD_BYTES)
    await reject('This photo is too big (5 MB at most).', 'UPLOAD_TOO_BIG');
  const type = sniffImageType(bytes);
  const expected = key.endsWith('.jpg')
    ? 'jpeg'
    : key.endsWith('.png')
      ? 'png'
      : key.endsWith('.webp')
        ? 'webp'
        : null;
  if (!type || type !== expected) {
    await reject("This file isn't a photo. Use a JPEG, PNG or WebP image.", 'NOT_AN_IMAGE');
  }
  if (hasLocationData(bytes, type!)) {
    await reject(
      key.startsWith('reviews/')
        ? 'This photo still contains its location. Choose it again.'
        : 'This photo still contains its location. Take or choose it again in the oda app.',
      'PHOTO_HAS_LOCATION',
    );
  }
}

/** Records objects to delete (in the caller's transaction when given one). */
export async function queueDeletions(db: Db, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  await db
    .insert(schema.storageDeletions)
    .values(keys.map((objectKey) => ({ objectKey })))
    .onConflictDoNothing();
}

/** Deletes queued objects now; anything that fails stays queued for the purge job (M8). */
export async function flushDeletions(db: Db, keys: readonly string[]): Promise<void> {
  const done: string[] = [];
  for (const key of keys) {
    try {
      await storeFor(key).delete(key);
      done.push(key);
    } catch (error) {
      console.warn(`[storage] delete failed, left for the purge job: ${(error as Error).message}`);
    }
  }
  if (done.length > 0) {
    await db
      .delete(schema.storageDeletions)
      .where(inArray(schema.storageDeletions.objectKey, done));
  }
}

/** The public URL for a stored key (null-safe). */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  try {
    return getStorage().publicUrl(key) || null;
  } catch {
    return null;
  }
}
