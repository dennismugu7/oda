// Product photos and the shop logo (spec §5.5, decisions #14, #52). Every picked photo is
// re-encoded on the phone (never uploaded as picked), which drops its metadata, GPS
// included: a full JPEG of at most 1600 px and a ~400 px thumbnail. Then each file goes
// straight to storage through a signed upload. The native parts are injected (PhotoDeps), so
// the logic is unit-tested; the server checks the stored bytes again (decision #52).
import type { ApiError } from '@/api';
import type { SignedUpload } from './api';

export const FULL_MAX = 1600;
export const THUMB_MAX = 400;
export const FULL_QUALITY = 0.8;
export const THUMB_QUALITY = 0.7;

export interface Picked {
  uri: string;
  width: number;
  height: number;
}

export interface Encoded {
  uri: string;
  width: number;
  height: number;
}

export interface PhotoDeps {
  /** Re-encodes as JPEG at `width` (aspect kept). Never returns the source file. */
  encode(uri: string, width: number, quality: number): Promise<Encoded>;
  readFile(uri: string): Promise<Blob>;
  requestUpload(body: {
    kind: 'product' | 'logo' | 'feedback';
    contentType: 'image/jpeg';
    size: number;
  }): Promise<{ data: SignedUpload | null; error: ApiError | null }>;
  put(upload: SignedUpload, file: Blob): Promise<boolean>;
}

/** The size that fits inside `max` × `max` without upscaling. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface Prepared {
  full: Encoded;
  thumb: Encoded;
}

/** Re-encodes a picked photo into the full image and the thumbnail. */
export async function preparePhoto(picked: Picked, deps: PhotoDeps): Promise<Prepared> {
  const full = fitWithin(picked.width, picked.height, FULL_MAX);
  const thumb = fitWithin(picked.width, picked.height, THUMB_MAX);
  return {
    full: await deps.encode(picked.uri, full.width, FULL_QUALITY),
    thumb: await deps.encode(picked.uri, thumb.width, THUMB_QUALITY),
  };
}

const UPLOAD_FAILED = "Couldn't upload your photo. Try again.";

/** Uploads one encoded file; returns its storage key. */
async function uploadOne(
  file: Encoded,
  kind: 'product' | 'logo' | 'feedback',
  deps: PhotoDeps,
): Promise<{ key: string | null; error: string | null }> {
  const blob = await deps.readFile(file.uri);
  const { data, error } = await deps.requestUpload({
    kind,
    contentType: 'image/jpeg',
    size: blob.size,
  });
  if (error || !data) return { key: null, error: error?.message ?? UPLOAD_FAILED };
  const ok = await deps.put(data, blob).catch(() => false);
  return ok ? { key: data.key, error: null } : { key: null, error: UPLOAD_FAILED };
}

export interface UploadedPhoto {
  objectKey: string;
  thumbKey: string;
  width: number;
  height: number;
  /** For showing it right away (the phone's own re-encoded file). */
  previewUri: string;
}

/** A product photo: full + thumbnail, both uploaded. */
export async function uploadProductPhoto(
  prepared: Prepared,
  deps: PhotoDeps,
): Promise<{ photo: UploadedPhoto | null; error: string | null }> {
  try {
    const full = await uploadOne(prepared.full, 'product', deps);
    if (!full.key) return { photo: null, error: full.error };
    const thumb = await uploadOne(prepared.thumb, 'product', deps);
    if (!thumb.key) return { photo: null, error: thumb.error };
    return {
      photo: {
        objectKey: full.key,
        thumbKey: thumb.key,
        width: prepared.full.width,
        height: prepared.full.height,
        previewUri: prepared.thumb.uri,
      },
      error: null,
    };
  } catch {
    return { photo: null, error: UPLOAD_FAILED };
  }
}

/** A feedback screenshot: one full-size re-encoded JPEG (private store, decision #74 b). */
export async function uploadScreenshot(
  picked: Picked,
  deps: PhotoDeps,
): Promise<{ key: string | null; previewUri: string | null; error: string | null }> {
  try {
    const size = fitWithin(picked.width, picked.height, FULL_MAX);
    const encoded = await deps.encode(picked.uri, size.width, FULL_QUALITY);
    const { key, error } = await uploadOne(encoded, 'feedback', deps);
    return { key, previewUri: key ? encoded.uri : null, error };
  } catch {
    return { key: null, previewUri: null, error: UPLOAD_FAILED };
  }
}

/** The shop logo: one square-ish image at thumbnail size is plenty. */
export async function uploadLogo(
  picked: Picked,
  deps: PhotoDeps,
): Promise<{ key: string | null; previewUri: string | null; error: string | null }> {
  try {
    const size = fitWithin(picked.width, picked.height, THUMB_MAX);
    const encoded = await deps.encode(picked.uri, size.width, FULL_QUALITY);
    const { key, error } = await uploadOne(encoded, 'logo', deps);
    return { key, previewUri: key ? encoded.uri : null, error };
  } catch {
    return { key: null, previewUri: null, error: UPLOAD_FAILED };
  }
}
