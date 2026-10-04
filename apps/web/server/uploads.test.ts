import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { GET as devGet, PUT as devPut } from '@/app/api/dev-uploads/[...key]/route';
import { POST as uploadRoute } from '@/app/api/uploads/route';
import { signUpVerified } from '@/test/auth';
import { jpeg, png, tiff, webp } from '@/test/imageFixtures';
import { storedPhoto } from '@/test/storage';
import { getDb } from './db';
import { getOnboarding, postAnswer, postLogo, postProduct, postShop } from './onboardingRoutes';
import {
  type BlobApi,
  getStorage,
  resetStorageForTests,
  UPLOAD_TTL_SECONDS,
  vercelBlobStorage,
  writeLocalObject,
} from './storage';

// Uploads (decision #52) with the local storage driver: signed uploads at keys the server
// chooses, byte-checked files without location data, and deletion of replaced files.

type Handler = (request: Request) => Promise<Response>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const db = () => getDb();

beforeEach(async () => {
  await truncateAll(db());
  resetStorageForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetStorageForTests();
});

async function seller(withShop = true) {
  const { token } = await signUpVerified('', `s-${randomUUID().slice(0, 8)}@example.test`);
  const auth = { authorization: `Bearer ${token}` };
  const call = async (handler: Handler, body?: unknown) => {
    const res = await handler(
      new Request('http://localhost:3000/api/x', {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
  };
  let shopId = '';
  if (withShop) {
    await call(postAnswer, { step: 1, businessType: 'fashion' });
    const shop = await call(postShop, {
      name: 'Amani Styles',
      slug: `amani-${randomUUID().slice(0, 6)}`,
      whatsappPhone: '0712345678',
    });
    shopId = shop.json.shop.id;
  }
  return { call, shopId };
}

const exists = async (key: string) => (await getStorage().read(key)) !== null;
const queued = async () =>
  (await db().select().from(schema.storageDeletions)).map((r) => r.objectKey);

describe('POST /api/uploads', () => {
  it('signs an upload at a key under the seller’s own shop, with the right extension', async () => {
    const s = await seller();
    const res = await s.call(uploadRoute, {
      kind: 'product',
      contentType: 'image/webp',
      size: 1234,
    });
    expect(res.status).toBe(200);
    expect(res.json.key).toMatch(new RegExp(`^products/${s.shopId}/[0-9a-f-]{36}\\.webp$`));
    expect(res.json).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/webp' } });
    expect(res.json.url).toContain(`/api/dev-uploads/${res.json.key}?`);
    const logo = await s.call(uploadRoute, { kind: 'logo', contentType: 'image/jpeg', size: 10 });
    expect(logo.json.key).toMatch(new RegExp(`^logos/${s.shopId}/.+\\.jpg$`));
  });

  it('refuses other types, empty and oversized files, and unknown kinds', async () => {
    const s = await seller();
    for (const bad of [
      { kind: 'product', contentType: 'image/gif', size: 10 },
      { kind: 'product', contentType: 'text/html', size: 10 },
      { kind: 'product', contentType: 'image/jpeg', size: 0 },
      { kind: 'product', contentType: 'image/jpeg', size: 5 * 1024 * 1024 + 1 },
      { kind: 'feedback', contentType: 'image/jpeg', size: 10 },
      { kind: 'product', contentType: 'image/jpeg', size: 10, key: 'products/x/y.jpg' },
    ]) {
      expect((await s.call(uploadRoute, bad)).status, JSON.stringify(bad)).toBe(422);
    }
  });

  it('is 401 signed out and 404 without a shop', async () => {
    const res = await uploadRoute(
      new Request('http://localhost:3000/api/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'product', contentType: 'image/jpeg', size: 10 }),
      }),
    );
    expect(res.status).toBe(401);
    const noShop = await seller(false);
    expect(
      (await noShop.call(uploadRoute, { kind: 'product', contentType: 'image/jpeg', size: 10 }))
        .status,
    ).toBe(404);
  });

  it('answers 503 while no storage provider is switched on (staging before CP0)', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'disabled');
    resetStorageForTests();
    const s = await seller();
    const res = await s.call(uploadRoute, { kind: 'product', contentType: 'image/jpeg', size: 10 });
    expect(res.status).toBe(503);
    expect(res.json.error).toMatchObject({
      code: 'uploads_off',
      message: "Photo uploads aren't switched on yet. Try again later.",
    });
  });
});

describe('local signed uploads (/api/dev-uploads)', () => {
  async function signed(
    s: Awaited<ReturnType<typeof seller>>,
    size: number,
    contentType = 'image/jpeg',
  ) {
    return (await s.call(uploadRoute, { kind: 'product', contentType, size })).json;
  }
  const put = (url: string, body: Uint8Array, type = 'image/jpeg') => {
    const { pathname, search } = new URL(url);
    const key = pathname.replace('/api/dev-uploads/', '').split('/');
    return devPut(
      new Request(`http://localhost:3000${pathname}${search}`, {
        method: 'PUT',
        headers: { 'content-type': type },
        body: Buffer.from(body),
      }),
      { params: Promise.resolve({ key }) },
    );
  };

  it('stores exactly the signed file and serves it back', async () => {
    const s = await seller();
    const file = jpeg();
    const up = await signed(s, file.length);
    expect((await put(up.url, file)).status).toBe(200);
    const got = await devGet(new Request('http://localhost:3000/x'), {
      params: Promise.resolve({ key: up.key.split('/') }),
    });
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await got.arrayBuffer()).equals(file)).toBe(true);
  });

  it('refuses a changed signature, type or size, and an expired URL', async () => {
    const s = await seller();
    const file = jpeg();
    const up = await signed(s, file.length);
    expect((await put(up.url.replace(/sig=[0-9a-f]+/, `sig=${'0'.repeat(64)}`), file)).status).toBe(
      403,
    );
    expect((await put(up.url, file, 'image/png')).status).toBe(400);
    expect((await put(up.url, Buffer.concat([file, Buffer.from([0])]))).status).toBe(400);
    expect((await put(up.url.replace(/size=\d+/, 'size=1'), file)).status).toBe(403);
    vi.useFakeTimers({ now: Date.now() + 16 * 60 * 1000 });
    try {
      expect((await put(up.url, file)).status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a 404 on Vercel (Preview and Production) and whenever the local driver is off', async () => {
    for (const env of [
      { VERCEL: '1', VERCEL_ENV: 'preview', STORAGE_DRIVER: '' },
      { VERCEL: '1', VERCEL_ENV: 'production', STORAGE_DRIVER: '' },
      { STORAGE_DRIVER: 'disabled' },
    ]) {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v || undefined);
      resetStorageForTests();
      const got = await devGet(new Request('http://localhost:3000/x'), {
        params: Promise.resolve({ key: ['products', randomUUID(), 'a.jpg'] }),
      });
      expect(got.status, JSON.stringify(env)).toBe(404);
      vi.unstubAllEnvs();
    }
  });
});

describe('saving photos checks the stored bytes', () => {
  async function saveWith(s: Awaited<ReturnType<typeof seller>>, file: Uint8Array, ext = 'jpg') {
    const objectKey = `products/${s.shopId}/${randomUUID()}.${ext}`;
    const thumbKey = `products/${s.shopId}/${randomUUID()}.${ext}`;
    await writeLocalObject(objectKey, file);
    await writeLocalObject(thumbKey, file);
    const res = await s.call(postProduct, {
      name: 'Dress',
      price: 100,
      photos: [{ objectKey, thumbKey }],
    });
    return { ...res, objectKey, thumbKey };
  }

  it('a photo that was never uploaded', async () => {
    const s = await seller();
    const res = await s.call(postProduct, {
      name: 'Dress',
      price: 100,
      photos: [
        { objectKey: `products/${s.shopId}/nope.jpg`, thumbKey: `products/${s.shopId}/nope_t.jpg` },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatchObject({
      code: 'UPLOAD_MISSING',
      message: "We couldn't find that photo. Upload it again.",
    });
  });

  it('a file that only claims to be a photo is rejected and deleted', async () => {
    const s = await seller();
    const res = await saveWith(s, Buffer.from('<html><script>alert(1)</script></html>'));
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe('NOT_AN_IMAGE');
    expect(await exists(res.objectKey)).toBe(false);
    expect(await queued()).toEqual([]);
  });

  it('a PNG stored under a .jpg key is rejected (the type must match)', async () => {
    const s = await seller();
    expect((await saveWith(s, png())).json.error.code).toBe('NOT_AN_IMAGE');
  });

  for (const [name, make, ext] of [
    ['JPEG', jpeg, 'jpg'],
    ['PNG', png, 'png'],
    ['WebP', webp, 'webp'],
  ] as const) {
    it(`${name}: with GPS → rejected and deleted; orientation-only → accepted`, async () => {
      const s = await seller();
      const gps = await saveWith(s, make({ exif: tiff({ gps: true }) }), ext);
      expect(gps.status).toBe(422);
      expect(gps.json.error).toMatchObject({
        code: 'PHOTO_HAS_LOCATION',
        message: 'This photo still contains its location. Take or choose it again in the oda app.',
      });
      expect(await exists(gps.objectKey)).toBe(false);

      const ok = await saveWith(s, make({ exif: tiff({ orientation: true }) }), ext);
      expect(ok.status).toBe(200);
      expect(ok.json.product.photos[0]).toMatchObject({ objectKey: ok.objectKey });
      expect(ok.json.product.photos[0].url).toContain(`/api/dev-uploads/${ok.objectKey}`);
    });
  }
});

describe('replaced files are deleted (decision #52)', () => {
  it('going back to step 4 deletes the old photos from storage', async () => {
    const s = await seller();
    const first = [await storedPhoto(s.shopId, 1), await storedPhoto(s.shopId, 2)];
    await s.call(postProduct, { name: 'Dress', price: 100, photos: first });
    const keep = first[0]!;
    const fresh = await storedPhoto(s.shopId, 3);
    const res = await s.call(postProduct, { name: 'Dress', price: 100, photos: [keep, fresh] });
    expect(res.status).toBe(200);
    expect(await exists(keep.objectKey)).toBe(true);
    expect(await exists(first[1]!.objectKey)).toBe(false);
    expect(await exists(first[1]!.thumbKey)).toBe(false);
    expect(await queued()).toEqual([]);
  });

  it('a delete that fails stays queued for the purge job', async () => {
    const s = await seller();
    const old = await storedPhoto(s.shopId, 1);
    await s.call(postProduct, { name: 'Dress', price: 100, photos: [old] });
    vi.spyOn(getStorage(), 'delete').mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await s.call(postProduct, {
      name: 'Dress',
      price: 100,
      photos: [await storedPhoto(s.shopId, 2)],
    });
    expect((await queued()).sort()).toEqual([old.objectKey, old.thumbKey].sort());
  });

  it('a new logo replaces the old one in storage; null removes it', async () => {
    const s = await seller();
    const logo1 = `logos/${s.shopId}/l1.jpg`;
    const logo2 = `logos/${s.shopId}/l2.jpg`;
    await writeLocalObject(logo1, jpeg());
    await writeLocalObject(logo2, jpeg());
    const one = await s.call(postLogo, { logoPath: logo1 });
    expect(one.json.shop.logoUrl).toContain(`/api/dev-uploads/${logo1}`);
    await s.call(postLogo, { logoPath: logo2 });
    expect(await exists(logo1)).toBe(false);
    const none = await s.call(postLogo, { logoPath: null });
    expect(none.json.shop.logoPath).toBeNull();
    expect(await exists(logo2)).toBe(false);
  });

  it("a logo must be the seller's own, in the logos folder", async () => {
    const s = await seller();
    const other = await seller();
    const foreign = `logos/${other.shopId}/x.jpg`;
    await writeLocalObject(foreign, jpeg());
    expect((await s.call(postLogo, { logoPath: foreign })).status).toBe(403);
    const product = `products/${s.shopId}/x.jpg`;
    await writeLocalObject(product, jpeg());
    expect((await s.call(postLogo, { logoPath: product })).status).toBe(403);
    expect((await s.call(getOnboarding)).json.shop.logoPath).toBeNull();
  });
});

describe('S3-compatible driver (R2 or other), no network', () => {
  it('presigns a PUT with the type and length signed, and builds public URLs', async () => {
    vi.stubEnv('STORAGE_DRIVER', 's3');
    vi.stubEnv('STORAGE_S3_ENDPOINT', 'https://acc123.r2.cloudflarestorage.com');
    vi.stubEnv('STORAGE_S3_BUCKET', 'oda-staging');
    vi.stubEnv('STORAGE_S3_ACCESS_KEY_ID', 'AKIDEXAMPLE');
    vi.stubEnv('STORAGE_S3_SECRET_ACCESS_KEY', 'secretexample');
    vi.stubEnv('STORAGE_PUBLIC_BASE_URL', 'https://pub-abc.r2.dev');
    resetStorageForTests();
    const storage = getStorage();
    expect(storage.driver).toBe('s3');
    const shopId = randomUUID();
    const up = await storage.presignPut(`products/${shopId}/a.jpg`, 'image/jpeg', 1234);
    const url = new URL(up.url);
    expect(url.origin + url.pathname).toBe(
      `https://acc123.r2.cloudflarestorage.com/oda-staging/products/${shopId}/a.jpg`,
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'host']),
    );
    expect(up.url).not.toContain('secretexample');
    expect(up.headers).toEqual({ 'content-type': 'image/jpeg', 'content-length': '1234' });
    expect(storage.publicUrl(`products/${shopId}/a.jpg`)).toBe(
      `https://pub-abc.r2.dev/products/${shopId}/a.jpg`,
    );
  });

  it('refuses a half-configured S3 setup and local storage on Vercel', async () => {
    const { storageDriver } = await import('./storage');
    expect(() => storageDriver({ STORAGE_DRIVER: 's3', STORAGE_S3_BUCKET: 'x' })).toThrow(
      /not fully configured/,
    );
    expect(() => storageDriver({ VERCEL: '1', STORAGE_DRIVER: 'local' })).toThrow(
      /not allowed on Vercel/,
    );
    expect(storageDriver({ VERCEL: '1' }).driver).toBe('disabled');
    expect(storageDriver({}).driver).toBe('local');
  });
});

describe('Vercel Blob driver (staging, decision #54), no network', () => {
  const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
  const BASE = 'https://abc123.public.blob.vercel-storage.com';

  function fakeBlob(overrides: Partial<BlobApi> = {}) {
    const calls: { fn: string; args: unknown[] }[] = [];
    const api: BlobApi = {
      issueSignedToken: (async (...args: unknown[]) => {
        calls.push({ fn: 'issueSignedToken', args });
        return { delegationToken: 'dt', clientSigningToken: 'cst', validUntil: NOW + 600_000 };
      }) as BlobApi['issueSignedToken'],
      presignUrl: (async (...args: unknown[]) => {
        calls.push({ fn: 'presignUrl', args });
        return { presignedUrl: 'https://blob.vercel-storage.com/?signed=1' };
      }) as BlobApi['presignUrl'],
      get: (async () => null) as BlobApi['get'],
      del: (async (...args: unknown[]) => {
        calls.push({ fn: 'del', args });
      }) as BlobApi['del'],
      ...overrides,
    };
    return { api, calls };
  }

  it('upload URLs last 10 minutes and are locked to the key, type and size', async () => {
    expect(UPLOAD_TTL_SECONDS).toBe(600);
    const { api, calls } = fakeBlob();
    const storage = vercelBlobStorage({ STORAGE_PUBLIC_BASE_URL: `${BASE}/` }, api, () => NOW);
    const key = `products/${randomUUID()}/a.jpg`;
    const up = await storage.presignPut(key, 'image/jpeg', 1234);
    const limits = {
      allowedContentTypes: ['image/jpeg'],
      maximumSizeInBytes: 1234,
      validUntil: NOW + 600_000,
    };
    expect(calls[0]).toEqual({
      fn: 'issueSignedToken',
      args: [{ pathname: key, operations: ['put'], ...limits }],
    });
    expect(calls[1]).toEqual({
      fn: 'presignUrl',
      args: [
        { delegationToken: 'dt', clientSigningToken: 'cst', validUntil: NOW + 600_000 },
        {
          operation: 'put',
          pathname: key,
          access: 'public',
          ...limits,
          addRandomSuffix: false,
          allowOverwrite: false,
        },
      ],
    });
    expect(up).toEqual({
      url: 'https://blob.vercel-storage.com/?signed=1',
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      expiresAt: new Date(NOW + 600_000).toISOString(),
    });
    expect(JSON.stringify(up)).not.toContain('cst'); // the signing key never leaves the server
    expect(storage.publicUrl(key)).toBe(`${BASE}/${key}`);
  });

  it('reads the stored bytes (null when missing) and deletes by key', async () => {
    const bytes = jpeg();
    const { api, calls } = fakeBlob({
      get: (async (key: string) =>
        key.endsWith('there.jpg')
          ? {
              statusCode: 200,
              stream: new Response(Buffer.from(bytes)).body!,
              headers: new Headers(),
              blob: {},
            }
          : null) as unknown as BlobApi['get'],
    });
    const storage = vercelBlobStorage({ STORAGE_PUBLIC_BASE_URL: BASE }, api);
    expect(await storage.read('products/x/there.jpg')).toEqual(new Uint8Array(bytes));
    expect(await storage.read('products/x/gone.jpg')).toBeNull();
    await storage.delete('products/x/there.jpg');
    expect(calls).toContainEqual({ fn: 'del', args: ['products/x/there.jpg'] });
  });

  it('is chosen only when fully configured, and the local driver also expires in 10 minutes', async () => {
    const { storageDriver } = await import('./storage');
    expect(() => storageDriver({ VERCEL: '1', STORAGE_DRIVER: 'vercel-blob' })).toThrow(
      /needs STORAGE_PUBLIC_BASE_URL/,
    );
    expect(
      storageDriver({
        VERCEL: '1',
        STORAGE_DRIVER: 'vercel-blob',
        STORAGE_PUBLIC_BASE_URL: BASE,
        BLOB_STORE_ID: 'store_abc',
      }).driver,
    ).toBe('vercel-blob');
    const before = Date.now();
    const up = await getStorage().presignPut(`products/${randomUUID()}/a.jpg`, 'image/jpeg', 10);
    const ttl = (Date.parse(up.expiresAt) - before) / 1000;
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(601);
  });
});
