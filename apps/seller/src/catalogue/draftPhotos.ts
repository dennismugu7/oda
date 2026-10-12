// A product draft kept on the phone (decision #100) can come back up to 7 days later (#111). By
// then a photo it uploaded may be gone from the server (an unsaved upload is purged after 8
// days; one replaced or removed from the product goes at once). Before the draft is put back,
// its photos are checked: a gone photo is dropped quietly, and the rest show the server's own
// thumbnail, since the phone's cached preview may have been cleared. Pure (the check is passed
// in), so it is unit-tested.
import type { ApiError } from '@/api';
import type { PhotoCheck, PhotoInput } from './api';

export interface DraftPhoto {
  preview: string;
  photo: PhotoInput;
}

type Check = (keys: string[]) => Promise<{ data: PhotoCheck | null; error: ApiError | null }>;

export async function keepStoredPhotos(photos: DraftPhoto[], check: Check): Promise<DraftPhoto[]> {
  if (photos.length === 0) return photos;
  const keys = [...new Set(photos.flatMap((p) => [p.photo.objectKey, p.photo.thumbKey]))];
  const { data } = await check(keys).catch(() => ({ data: null }));
  // Offline or storage paused: nothing is known, so the draft comes back as it was (saving
  // checks every photo again and asks for a missing one to be uploaded again).
  if (!data) return photos;
  const missing = new Set(data.missing);
  return photos.flatMap((p) =>
    missing.has(p.photo.objectKey) || missing.has(p.photo.thumbKey)
      ? []
      : [{ ...p, preview: data.urls[p.photo.thumbKey] ?? p.preview }],
  );
}
