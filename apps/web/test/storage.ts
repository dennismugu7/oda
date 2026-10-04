import { writeLocalObject } from '@/server/storage';
import { jpeg, png, tiff, webp } from './imageFixtures';

// Stores fixture photos in the test's local storage, as the phone would after an upload.

export async function storeJpeg(key: string, opts: { gps?: boolean } = {}) {
  await writeLocalObject(key, jpeg(opts.gps ? { exif: tiff({ gps: true }) } : {}));
  return key;
}

/** A product photo pair (full + thumbnail) stored under the shop's prefix. */
export async function storedPhoto(shopId: string, n: number) {
  const objectKey = await storeJpeg(`products/${shopId}/p${n}.jpg`);
  const thumbKey = await storeJpeg(`products/${shopId}/p${n}_thumb.jpg`);
  return { objectKey, thumbKey, width: 1600, height: 1200 };
}

export { jpeg, png, tiff, webp };
