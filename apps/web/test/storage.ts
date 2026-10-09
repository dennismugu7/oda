import {
  guardStore,
  setStorageForTests,
  writeLocalObject,
  type ObjectStorage,
  type PrivateStorage,
} from '@/server/storage';
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

/**
 * Both stores refuse every call, as Vercel Blob does once a Hobby limit stops it (decision
 * #93 D1), behind the same guard the real drivers use. Undo with resetStorageForTests().
 */
export function refuseAllStorage(): { calls: string[] } {
  const calls: string[] = [];
  const refuse = (name: string) => async (): Promise<never> => {
    calls.push(name);
    throw Object.assign(new Error('Vercel Blob: This store has been suspended.'), {
      name: 'BlobStoreSuspendedError',
    });
  };
  const store: ObjectStorage = {
    driver: 'vercel-blob',
    presignPut: refuse('presignPut'),
    read: refuse('read'),
    delete: refuse('delete'),
    list: refuse('list'),
    publicUrl: (key) => `https://blob.example.test/${key}`,
  };
  const privateStore: PrivateStorage = {
    driver: 'vercel-blob',
    presignPut: refuse('presignPut'),
    read: refuse('read'),
    delete: refuse('delete'),
    list: refuse('list'),
    signedReadUrl: refuse('signedReadUrl'),
  };
  setStorageForTests(guardStore(store), guardStore(privateStore));
  return { calls };
}

export { jpeg, png, tiff, webp };
