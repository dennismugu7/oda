import { describe, expect, it, vi } from 'vitest';
import type { PhotoCheck } from './api';
import { keepStoredPhotos, type DraftPhoto } from './draftPhotos';

const photo = (n: number): DraftPhoto => ({
  preview: `file:///cache/${n}-thumb.jpg`,
  photo: {
    objectKey: `products/s1/${n}.jpg`,
    thumbKey: `products/s1/${n}-t.jpg`,
    width: 1,
    height: 1,
  },
});
const answer = (data: PhotoCheck | null) => vi.fn(async () => ({ data, error: null }));
const URL = (key: string) => `https://cdn.example/${key}`;

describe('keepStoredPhotos (decision #111 c)', () => {
  it('drops a photo whose file or thumbnail is gone, and shows the rest from the server', async () => {
    const check = answer({
      missing: ['products/s1/2.jpg', 'products/s1/3-t.jpg'],
      urls: Object.fromEntries(
        [
          'products/s1/1.jpg',
          'products/s1/1-t.jpg',
          'products/s1/2-t.jpg',
          'products/s1/3.jpg',
        ].map((k) => [k, URL(k)]),
      ),
    });
    const kept = await keepStoredPhotos([photo(1), photo(2), photo(3)], check);
    expect(check).toHaveBeenCalledWith([
      'products/s1/1.jpg',
      'products/s1/1-t.jpg',
      'products/s1/2.jpg',
      'products/s1/2-t.jpg',
      'products/s1/3.jpg',
      'products/s1/3-t.jpg',
    ]);
    expect(kept).toEqual([{ ...photo(1), preview: URL('products/s1/1-t.jpg') }]);
  });

  it('keeps the draft as it was when the check fails (offline, storage paused)', async () => {
    const failed = vi.fn(async () => ({ data: null, error: { status: 503 } }));
    expect(await keepStoredPhotos([photo(1)], failed)).toEqual([photo(1)]);
    const thrown = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await keepStoredPhotos([photo(1)], thrown)).toEqual([photo(1)]);
  });

  it('asks nothing for a draft without photos', async () => {
    const check = answer({ missing: [], urls: {} });
    expect(await keepStoredPhotos([], check)).toEqual([]);
    expect(check).not.toHaveBeenCalled();
  });
});
