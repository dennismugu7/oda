import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAll } from '@oda/db/testing';
import { POST as uploadRoute } from '@/app/api/uploads/route';
import { newSeller, type Json } from '@/test/sellerApi';
import { refuseAllStorage, storedPhoto } from '@/test/storage';
import type { Handler } from './routeHandler';
import { createProduct } from './catalogueRoutes';
import { getDb } from './db';
import { getOnboarding, postProduct } from './onboardingRoutes';
import { postFeedback } from './settingsRoutes';
import { resetStorageForTests } from './storage';

// Storage stops answering (Vercel Blob at a Hobby limit, decision #93 D1): uploads answer
// 503 storage_unavailable with a clear message, never a 500; products, feedback and the
// onboarding product still save without a photo, and "Add a product photo" stays open.

const h = (fn: unknown) => fn as Handler;
const PAUSED = {
  code: 'storage_unavailable',
  message: 'Photo uploads are paused for now. Try again later.',
};

beforeEach(async () => {
  await truncateAll(getDb());
  resetStorageForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  resetStorageForTests();
  vi.restoreAllMocks();
});

const product = { name: 'Ankara wrap dress', price: 2500, sizes: ['M'] };

describe('while storage refuses every call', () => {
  it('every upload kind answers 503 storage_unavailable', async () => {
    const s = await newSeller();
    const { calls } = refuseAllStorage();
    for (const kind of ['product', 'logo', 'feedback']) {
      const res = await s.call(h(uploadRoute), {
        body: { kind, contentType: 'image/jpeg', size: 1000 },
      });
      expect(res.status, kind).toBe(503);
      expect((res.json as Json).error).toMatchObject(PAUSED);
    }
    expect(calls).toEqual(['presignPut', 'presignPut', 'presignPut']);
  });

  it('saving a product with an uploaded photo answers 503, not 500', async () => {
    const s = await newSeller();
    const photo = await storedPhoto(s.shopId, 1);
    refuseAllStorage();
    const res = await s.call(h(postProduct), { body: { ...product, photos: [photo] } });
    expect(res.status).toBe(503);
    expect((res.json as Json).error).toMatchObject(PAUSED);
  });

  it('onboarding saves the first product without a photo; the checklist item stays open', async () => {
    const s = await newSeller();
    refuseAllStorage();
    const refused = await s.call(h(postProduct), { body: { ...product, photos: [] } });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.json)).toContain('Add a photo of the product.');

    const saved = await s.call(h(postProduct), {
      body: { ...product, photos: [], photoLater: true },
    });
    expect(saved.status).toBe(200);
    expect(saved.json.step).toBe(5);
    expect(saved.json.product).toMatchObject({ name: product.name, photos: [] });
    const item = (saved.json.checklist.items as Json[]).find((i) => i.id === 'product_photo');
    expect(item).toEqual({ id: 'product_photo', label: 'Add a product photo', done: false });
    expect(saved.json.checklist).toMatchObject({ total: 8, complete: false });
  });

  it('the catalogue creates a product without a photo only with photoLater', async () => {
    const s = await newSeller();
    refuseAllStorage();
    const fields = { ...product, status: 'available' };
    expect((await s.call(h(createProduct), { body: { ...fields, photos: [] } })).status).toBe(422);
    const created = await s.call(h(createProduct), {
      body: { ...fields, photos: [], photoLater: true },
    });
    expect(created.status).toBe(201);
    expect(created.json.photos).toEqual([]);
    // photoLater never stretches to more than "no photos at all".
    const bad = await s.call(h(createProduct), {
      body: { ...fields, photos: [{ objectKey: 'x' }], photoLater: true },
    });
    expect(bad.status).toBe(422);
  });

  it('feedback is still sent, without a screenshot', async () => {
    const s = await newSeller();
    refuseAllStorage();
    const sent = await s.call(h(postFeedback), {
      body: { kind: 'idea', message: 'Uploads were paused but feedback still works' },
    });
    expect(sent.status).toBe(201);
  });
});

describe('the "Add a product photo" item', () => {
  it('is listed only while a live product has no photo', async () => {
    const s = await newSeller();
    const before = await s.call(h(getOnboarding));
    expect((before.json.checklist.items as Json[]).map((i) => i.id)).not.toContain('product_photo');
    expect(before.json.checklist.total).toBe(7);
    const photo = await storedPhoto(s.shopId, 1);
    await s.call(h(postProduct), { body: { ...product, photos: [photo] } });
    const after = await s.call(h(getOnboarding));
    expect(after.json.checklist.total).toBe(7);
  });
});
