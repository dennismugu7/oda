import { describe, expect, it, vi } from 'vitest';
import type { SignedUpload } from './api';
import {
  FULL_MAX,
  fitWithin,
  preparePhoto,
  THUMB_MAX,
  uploadLogo,
  uploadProductPhoto,
  uploadScreenshot,
  type PhotoDeps,
} from './photos';
import { errorMessage } from './labels';
import { addCustomSize, sizeChips, toggleSize } from './sizes';
import { previousStep, routeForStep } from './steps';

describe('steps ↔ screens', () => {
  it('maps each step to its screen, clamping odd values', () => {
    expect(routeForStep(1)).toBe('/onboarding/what-you-sell');
    expect(routeForStep(3)).toBe('/onboarding/name-shop');
    expect(routeForStep(6)).toBe('/onboarding/live');
    expect(routeForStep(null)).toBe('/onboarding/what-you-sell');
    expect(routeForStep(9)).toBe('/onboarding/live');
  });

  it('knows where back goes when the app was resumed mid-way', () => {
    expect(previousStep(4)).toBe('/onboarding/name-shop');
    expect(previousStep(1)).toBeNull();
  });
});

describe('size chips (owner, Step 52)', () => {
  it('toggle presets and keep custom sizes after them', () => {
    expect(toggleSize(['M'], 'L')).toEqual(['M', 'L']);
    expect(toggleSize(['M', 'L'], 'M')).toEqual(['L']);
    expect(sizeChips(['S', 'M'], ['M', 'One size'])).toEqual(['S', 'M', 'One size']);
  });

  it('add custom sizes within the limits', () => {
    expect(addCustomSize(['M'], '  42   wide ')).toEqual({ sizes: ['M', '42 wide'], error: null });
    expect(addCustomSize(['One size'], 'one size')).toEqual({ sizes: ['One size'], error: null });
    expect(addCustomSize([], '').error).toBe('Type a size, e.g. One size.');
    expect(addCustomSize([], 'x'.repeat(21)).error).toBe('A size can be at most 20 characters.');
    const twenty = Array.from({ length: 20 }, (_, i) => `S${i}`);
    expect(addCustomSize(twenty, 'Extra').error).toBe('Add at most 20 sizes.');
  });
});

function fakeDeps(overrides: Partial<PhotoDeps> = {}) {
  const uploads: { kind: string; size: number; key: string }[] = [];
  const put: { key: string; from: string }[] = [];
  let n = 0;
  const deps: PhotoDeps = {
    encode: vi.fn(async (uri: string, width: number) => ({
      uri: `file:///cache/encoded-${++n}.jpg`,
      width,
      height: Math.round((width * 3) / 4),
    })),
    readFile: vi.fn(async (uri: string) => {
      const blob = new Blob([uri]);
      (blob as Blob & { from?: string }).from = uri;
      return blob;
    }),
    requestUpload: vi.fn(async (body) => {
      const key = `${body.kind === 'logo' ? 'logos' : 'products'}/shop/${uploads.length + 1}.jpg`;
      uploads.push({ kind: body.kind, size: body.size, key });
      const upload: SignedUpload = {
        key,
        url: `https://storage.test/${key}`,
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        publicUrl: '',
      };
      return { data: upload, error: null };
    }),
    put: vi.fn(async (upload: SignedUpload, file: Blob) => {
      put.push({ key: upload.key, from: (file as Blob & { from?: string }).from ?? '' });
      return true;
    }),
    ...overrides,
  };
  return { deps, uploads, put };
}

describe('photos: re-encoded on the phone, never uploaded as picked (decision #52)', () => {
  const picked = { uri: 'file:///DCIM/IMG_0001.jpg', width: 4000, height: 3000 };

  it('fits 1600 px (full) and 400 px (thumbnail) without upscaling', () => {
    expect(fitWithin(4000, 3000, FULL_MAX)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, THUMB_MAX)).toEqual({ width: 300, height: 400 });
    expect(fitWithin(800, 600, FULL_MAX)).toEqual({ width: 800, height: 600 });
  });

  it('re-encodes every photo, even one small enough already, and uploads only the new files', async () => {
    const { deps, put } = fakeDeps();
    const small = { uri: 'file:///DCIM/small.jpg', width: 300, height: 200 };
    const prepared = await preparePhoto(small, deps);
    expect(deps.encode).toHaveBeenCalledTimes(2);
    expect(prepared.full.uri).not.toBe(small.uri);
    expect(prepared.thumb.uri).not.toBe(small.uri);

    await uploadProductPhoto(await preparePhoto(picked, deps), deps);
    expect(put.length).toBe(2);
    for (const p of put) {
      expect(p.from).toMatch(/^file:\/\/\/cache\/encoded-/);
      expect(p.from).not.toContain('DCIM');
    }
  });

  it('uploads the full image and the thumbnail and returns both keys', async () => {
    const { deps, uploads } = fakeDeps();
    const result = await uploadProductPhoto(await preparePhoto(picked, deps), deps);
    expect(result.error).toBeNull();
    expect(result.photo).toMatchObject({
      objectKey: 'products/shop/1.jpg',
      thumbKey: 'products/shop/2.jpg',
      width: 1600,
      height: 1200,
    });
    expect(uploads.map((u) => u.kind)).toEqual(['product', 'product']);
    expect(uploads.every((u) => u.size > 0)).toBe(true);
  });

  it("shows the server's message when uploads are off, and stops", async () => {
    const { deps } = fakeDeps({
      requestUpload: vi.fn(async () => ({
        data: null,
        error: {
          status: 503,
          code: 'uploads_off',
          message: "Photo uploads aren't switched on yet. Try again later.",
        },
      })),
    });
    const result = await uploadProductPhoto(await preparePhoto(picked, deps), deps);
    expect(result).toEqual({
      photo: null,
      error: "Photo uploads aren't switched on yet. Try again later.",
    });
    expect(deps.put).not.toHaveBeenCalled();
  });

  it('a failed upload says so instead of throwing', async () => {
    const { deps } = fakeDeps({ put: vi.fn(async () => false) });
    expect((await uploadProductPhoto(await preparePhoto(picked, deps), deps)).error).toBe(
      "Couldn't upload your photo. Try again.",
    );
    const broken = fakeDeps({ readFile: vi.fn(async () => Promise.reject(new Error('gone'))) });
    expect(
      (await uploadProductPhoto(await preparePhoto(picked, broken.deps), broken.deps)).error,
    ).toBe("Couldn't upload your photo. Try again.");
  });

  it('the logo is re-encoded at thumbnail size and uploaded as a logo', async () => {
    const { deps, uploads, put } = fakeDeps();
    const result = await uploadLogo(picked, deps);
    expect(result).toMatchObject({ key: 'logos/shop/1.jpg', error: null });
    expect(deps.encode).toHaveBeenCalledWith(picked.uri, 400, 0.8);
    expect(uploads[0]!.kind).toBe('logo');
    expect(put[0]!.from).not.toContain('DCIM');
  });

  it('a feedback screenshot is re-encoded at full size and uploaded as feedback', async () => {
    const { deps, uploads, put } = fakeDeps();
    const result = await uploadScreenshot(picked, deps);
    expect(result.error).toBeNull();
    expect(deps.encode).toHaveBeenCalledWith(picked.uri, 1600, 0.8);
    expect(uploads[0]!.kind).toBe('feedback');
    expect(put[0]!.from).not.toContain('DCIM');
  });
});

describe('error wording on the onboarding screens', () => {
  it('turns failed calls into one clear sentence', () => {
    expect(errorMessage({ status: 0, code: 'OFFLINE' })).toBe(
      "You're offline. Check your connection and try again.",
    );
    expect(errorMessage({ status: 0, code: 'TIMEOUT' })).toBe("Couldn't reach oda. Try again.");
    expect(errorMessage({ status: 409, code: 'conflict', message: 'That link is taken.' })).toBe(
      'That link is taken.',
    );
    expect(errorMessage({ status: 401 })).toBe('You were signed out. Sign in again to carry on.');
    expect(errorMessage({ status: 500 })).toBe('Something went wrong. Try again.');
  });
});
