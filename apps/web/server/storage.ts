import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as blobSdk from '@vercel/blob';
import { AwsClient } from 'aws4fetch';
import { z } from 'zod';
import { authBaseUrl } from './auth';
import { isDeployed } from './email/transport';

// Object storage behind one interface (decision #52), so the provider can be swapped:
// - local:    files under STORAGE_DIR, uploaded through /api/dev-uploads with a signed URL.
//             Development and tests only; refused on Vercel.
// - s3:       any S3-compatible bucket (Cloudflare R2 first): presigned PUT URLs, the phone
//             uploads straight to the bucket; public reads from STORAGE_PUBLIC_BASE_URL.
// - vercel-blob: a public Vercel Blob store (staging, decision #54): presigned PUT URLs
//             locked to the key, type and size; public CDN reads from STORAGE_PUBLIC_BASE_URL.
// - disabled: no provider yet: uploads answer 503.
// Default: local off Vercel; on Vercel s3 when configured, otherwise disabled.
// Every upload URL expires after 10 minutes (owner, Step 55).

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the upload must send exactly (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: string;
}

/** A stored object as the purge job sees it (M8a CP3). */
export interface StoredObject {
  key: string;
  uploadedAt: Date;
}

/** One page of a listing; pass `cursor` back for the next page (null = done). */
export interface ListPage {
  objects: StoredObject[];
  cursor: string | null;
}

export interface ObjectStorage {
  readonly driver: 'local' | 's3' | 'vercel-blob' | 'disabled';
  presignPut(key: string, contentType: string, size: number): Promise<PresignedUpload>;
  /** The object's bytes, or null when it doesn't exist. */
  read(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** Objects whose key starts with `prefix` (e.g. "products/"), a page at a time. */
  list(prefix: string, cursor?: string | null): Promise<ListPage>;
}

/** Every object under `prefix`, page by page. */
export async function* listAll(
  store: Pick<ObjectStorage, 'list'>,
  prefix: string,
): AsyncGenerator<StoredObject> {
  let cursor: string | null = null;
  do {
    const page: ListPage = await store.list(prefix, cursor);
    yield* page.objects;
    cursor = page.cursor;
  } while (cursor);
}

export class StorageUnavailableError extends Error {
  constructor() {
    super('Photo uploads are not switched on yet');
    this.name = 'StorageUnavailableError';
  }
}

/**
 * The provider refused or didn't answer: a Vercel Blob store stopped at a Hobby limit (or
 * suspended), a quota, a timeout, a 5xx (decision #93 D1). Uploads answer 503
 * `storage_unavailable`; everything that doesn't need a stored file keeps working.
 */
export class StoragePausedError extends Error {
  constructor(readonly reason: string) {
    super('Storage is not answering right now');
    this.name = 'StoragePausedError';
  }
}

const GUARDED = ['presignPut', 'read', 'delete', 'list', 'signedReadUrl'] as const;

/**
 * Turns every provider failure of a remote store into StoragePausedError (logged with its
 * reason, which never holds a token or a signed URL: the SDK's own error text).
 */
export function guardStore<T extends object>(store: T): T {
  const guarded = { ...store } as Record<string, unknown>;
  for (const name of GUARDED) {
    const fn = (store as Record<string, unknown>)[name];
    if (typeof fn !== 'function') continue;
    guarded[name] = async (...args: unknown[]) => {
      try {
        return await (fn as (...a: unknown[]) => Promise<unknown>).apply(store, args);
      } catch (error) {
        if (error instanceof StoragePausedError || error instanceof StorageUnavailableError) {
          throw error;
        }
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
        console.warn(`[storage] ${name} failed: ${reason.slice(0, 200)}`);
        throw new StoragePausedError(reason);
      }
    };
  }
  return guarded as T;
}

export const UPLOAD_TTL_SECONDS = 10 * 60;

const envSchema = z.object({
  STORAGE_DRIVER: z.enum(['local', 's3', 'vercel-blob', 'disabled']).optional(),
  STORAGE_DIR: z.string().default('.uploads'),
  STORAGE_S3_ENDPOINT: z.url().optional(),
  STORAGE_S3_BUCKET: z.string().min(1).optional(),
  STORAGE_S3_REGION: z.string().default('auto'),
  STORAGE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_PUBLIC_BASE_URL: z.url().optional(),
  // Vercel Blob: set by Vercel when the store is connected to the project (OIDC on Vercel,
  // or the static read-write token).
  BLOB_STORE_ID: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  // The private store for feedback screenshots (decision #74 b), connected with the env
  // prefix FEEDBACK_BLOB. Unset on Vercel = screenshots off.
  FEEDBACK_BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
});

type StorageEnv = z.infer<typeof envSchema>;

function s3Configured(env: StorageEnv): boolean {
  return !!(
    env.STORAGE_S3_ENDPOINT &&
    env.STORAGE_S3_BUCKET &&
    env.STORAGE_S3_ACCESS_KEY_ID &&
    env.STORAGE_S3_SECRET_ACCESS_KEY &&
    env.STORAGE_PUBLIC_BASE_URL
  );
}

function blobConfigured(env: StorageEnv): boolean {
  return !!(env.STORAGE_PUBLIC_BASE_URL && (env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN));
}

export function storageDriver(env: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.parse(env);
  const deployed = isDeployed(env as NodeJS.ProcessEnv);
  const driver =
    parsed.STORAGE_DRIVER ?? (deployed ? (s3Configured(parsed) ? 's3' : 'disabled') : 'local');
  if (deployed && driver === 'local')
    throw new Error('STORAGE_DRIVER=local is not allowed on Vercel');
  if (driver === 's3' && !s3Configured(parsed))
    throw new Error('S3 storage is not fully configured');
  if (driver === 'vercel-blob' && !blobConfigured(parsed))
    throw new Error('Vercel Blob storage needs STORAGE_PUBLIC_BASE_URL and a connected store');
  return { driver, env: parsed };
}

// Local ---------------------------------------------------------------------------------

const SAFE_KEY = /^[a-z]+\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

function devSignature(key: string, contentType: string, size: number, expires: number): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  return createHmac('sha256', secret)
    .update(`oda:dev-upload:${key}:${contentType}:${size}:${expires}`)
    .digest('hex');
}

/** Checks a local upload URL's signature (the /api/dev-uploads PUT handler). */
export function verifyDevUpload(
  key: string,
  contentType: string,
  size: number,
  expires: number,
  signature: string,
): boolean {
  if (!SAFE_KEY.test(key) || !Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
  const expected = Buffer.from(devSignature(key, contentType, size, expires), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function localStorage(env: StorageEnv): ObjectStorage {
  const root = path.resolve(env.STORAGE_DIR);
  const file = (key: string) => {
    if (!SAFE_KEY.test(key)) throw new Error('Unsafe storage key');
    return path.join(root, ...key.split('/'));
  };
  const base = () => `${authBaseUrl()}/api/dev-uploads`;
  return {
    driver: 'local',
    async presignPut(key, contentType, size) {
      const expires = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
      const query = new URLSearchParams({
        type: contentType,
        size: String(size),
        expires: String(expires),
        sig: devSignature(key, contentType, size, expires),
      });
      return {
        url: `${base()}/${key}?${query}`,
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresAt: new Date(expires * 1000).toISOString(),
      };
    },
    async read(key) {
      try {
        return new Uint8Array(await readFile(file(key)));
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(file(key), { force: true });
    },
    publicUrl: (key) => `${base()}/${key}`,
    async list(prefix) {
      // Development and tests only: the whole listing in one page.
      const objects: StoredObject[] = [];
      const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const full = path.join(entry.parentPath, entry.name);
        const key = path.relative(root, full).split(path.sep).join('/');
        if (!key.startsWith(prefix) || !SAFE_KEY.test(key)) continue;
        objects.push({ key, uploadedAt: (await stat(full)).mtime });
      }
      return { objects, cursor: null };
    },
  };
}

/** Writes a verified local upload (the /api/dev-uploads PUT handler). */
export async function writeLocalObject(key: string, data: Uint8Array): Promise<void> {
  const { env } = storageDriver();
  if (!SAFE_KEY.test(key)) throw new Error('Unsafe storage key');
  const target = path.join(path.resolve(env.STORAGE_DIR), ...key.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

export async function localObjectExists(key: string): Promise<boolean> {
  const { env } = storageDriver();
  if (!SAFE_KEY.test(key)) return false;
  return stat(path.join(path.resolve(env.STORAGE_DIR), ...key.split('/')))
    .then((s) => s.isFile())
    .catch(() => false);
}

// S3-compatible ----------------------------------------------------------------------------

function s3Storage(env: StorageEnv): ObjectStorage {
  const client = new AwsClient({
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
    service: 's3',
    region: env.STORAGE_S3_REGION,
  });
  const objectUrl = (key: string) =>
    `${env.STORAGE_S3_ENDPOINT!.replace(/\/+$/, '')}/${env.STORAGE_S3_BUCKET}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  return {
    driver: 's3',
    async presignPut(key, contentType, size) {
      const url = new URL(objectUrl(key));
      url.searchParams.set('X-Amz-Expires', String(UPLOAD_TTL_SECONDS));
      // Type and length are signed: the bucket refuses any other file.
      const signed = await client.sign(
        new Request(url, {
          method: 'PUT',
          headers: { 'content-type': contentType, 'content-length': String(size) },
        }),
        { aws: { signQuery: true, allHeaders: true } },
      );
      return {
        url: signed.url,
        method: 'PUT',
        headers: { 'content-type': contentType, 'content-length': String(size) },
        expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
      };
    },
    async read(key) {
      const res = await client.fetch(objectUrl(key), { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage read failed (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await client.fetch(objectUrl(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed (${res.status})`);
    },
    publicUrl: (key) => `${env.STORAGE_PUBLIC_BASE_URL!.replace(/\/+$/, '')}/${key}`,
    async list(prefix, cursor) {
      const url = new URL(
        `${env.STORAGE_S3_ENDPOINT!.replace(/\/+$/, '')}/${env.STORAGE_S3_BUCKET}`,
      );
      url.searchParams.set('list-type', '2');
      url.searchParams.set('prefix', prefix);
      url.searchParams.set('max-keys', '1000');
      if (cursor) url.searchParams.set('continuation-token', cursor);
      const res = await client.fetch(url.toString(), { method: 'GET' });
      if (!res.ok) throw new Error(`Storage list failed (${res.status})`);
      return parseListObjectsV2(await res.text());
    },
  };
}

const xmlText = (s: string) =>
  s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

/** The keys, dates and next token of an S3 ListObjectsV2 answer. */
export function parseListObjectsV2(xml: string): ListPage {
  const objects: StoredObject[] = [];
  for (const [, body] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(body!)?.[1];
    const modified = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(body!)?.[1];
    if (key && modified) objects.push({ key: xmlText(key), uploadedAt: new Date(modified) });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { objects, cursor: truncated && next ? xmlText(next) : null };
}

// Vercel Blob ------------------------------------------------------------------------------

/** The @vercel/blob calls the driver uses (injected in tests). */
export interface BlobApi {
  issueSignedToken: typeof blobSdk.issueSignedToken;
  presignUrl: typeof blobSdk.presignUrl;
  get: typeof blobSdk.get;
  del: typeof blobSdk.del;
  list: typeof blobSdk.list;
}

async function blobListPage(
  api: BlobApi,
  prefix: string,
  cursor: string | null | undefined,
  token?: string,
): Promise<ListPage> {
  const page = await api.list({ prefix, limit: 1000, cursor: cursor ?? undefined, token });
  return {
    objects: page.blobs.map((b) => ({ key: b.pathname, uploadedAt: new Date(b.uploadedAt) })),
    cursor: page.hasMore && page.cursor ? page.cursor : null,
  };
}

export function vercelBlobStorage(
  env: Pick<StorageEnv, 'STORAGE_PUBLIC_BASE_URL'>,
  api: BlobApi = blobSdk,
  now: () => number = Date.now,
): ObjectStorage {
  const base = env.STORAGE_PUBLIC_BASE_URL!.replace(/\/+$/, '');
  return {
    driver: 'vercel-blob',
    async presignPut(key, contentType, size) {
      const validUntil = now() + UPLOAD_TTL_SECONDS * 1000;
      // The delegation itself is scoped to this one key, type, size and 10 minutes; the URL
      // repeats the limits, and never overwrites or renames (the server chose the key).
      const limits = { allowedContentTypes: [contentType], maximumSizeInBytes: size, validUntil };
      const token = await api.issueSignedToken({ pathname: key, operations: ['put'], ...limits });
      const { presignedUrl } = await api.presignUrl(token, {
        operation: 'put',
        pathname: key,
        access: 'public',
        ...limits,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      return {
        url: presignedUrl,
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresAt: new Date(validUntil).toISOString(),
      };
    },
    async read(key) {
      const result = await api.get(key, { access: 'public' });
      if (!result || result.statusCode !== 200) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
    async delete(key) {
      await api.del(key);
    },
    publicUrl: (key) => `${base}/${key}`,
    list: (prefix, cursor) => blobListPage(api, prefix, cursor),
  };
}

// Private (feedback screenshots) -----------------------------------------------------------

/**
 * Objects nobody may read by URL (decision #74 b): seller feedback screenshots. Read only by
 * the server, or through a signed link that expires (the support digest).
 */
export interface PrivateStorage {
  readonly driver: 'local' | 'vercel-blob';
  presignPut(key: string, contentType: string, size: number): Promise<PresignedUpload>;
  read(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** A link that opens the object for `seconds`. */
  signedReadUrl(key: string, seconds: number): Promise<string>;
  list(prefix: string, cursor?: string | null): Promise<ListPage>;
}

export function privateVercelBlobStorage(
  token: string,
  api: BlobApi = blobSdk,
  now: () => number = Date.now,
): PrivateStorage {
  return {
    driver: 'vercel-blob',
    async presignPut(key, contentType, size) {
      const validUntil = now() + UPLOAD_TTL_SECONDS * 1000;
      const limits = { allowedContentTypes: [contentType], maximumSizeInBytes: size, validUntil };
      const signed = await api.issueSignedToken({
        token,
        pathname: key,
        operations: ['put'],
        ...limits,
      });
      const { presignedUrl } = await api.presignUrl(signed, {
        operation: 'put',
        pathname: key,
        access: 'private',
        ...limits,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      return {
        url: presignedUrl,
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresAt: new Date(validUntil).toISOString(),
      };
    },
    async read(key) {
      const result = await api.get(key, { access: 'private', token, useCache: false });
      if (!result || result.statusCode !== 200) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
    async delete(key) {
      await api.del(key, { token });
    },
    list: (prefix, cursor) => blobListPage(api, prefix, cursor, token),
    async signedReadUrl(key, seconds) {
      const validUntil = now() + seconds * 1000;
      const signed = await api.issueSignedToken({
        token,
        pathname: key,
        operations: ['get'],
        validUntil,
      });
      const { presignedUrl } = await api.presignUrl(signed, {
        operation: 'get',
        pathname: key,
        access: 'private',
        validUntil,
      });
      return presignedUrl;
    },
  };
}

let cachedPrivate: PrivateStorage | null | undefined;

/**
 * The private store, or null when it isn't connected (the app then hides "Add screenshot").
 * Locally and in tests: the local folder, like photos (a development tool only).
 */
export function getPrivateStorage(): PrivateStorage | null {
  if (cachedPrivate !== undefined) return cachedPrivate;
  const { driver, env } = storageDriver();
  if (driver === 'local') {
    const local = localStorage(env);
    cachedPrivate = {
      driver: 'local',
      presignPut: local.presignPut,
      read: local.read,
      delete: local.delete,
      list: local.list,
      signedReadUrl: async (key) => local.publicUrl(key),
    };
  } else {
    const token = env.FEEDBACK_BLOB_READ_WRITE_TOKEN;
    cachedPrivate = token ? guardStore(privateVercelBlobStorage(token)) : null;
  }
  return cachedPrivate;
}

// Disabled --------------------------------------------------------------------------------

const disabledStorage: ObjectStorage = {
  driver: 'disabled',
  presignPut: () => Promise.reject(new StorageUnavailableError()),
  read: () => Promise.reject(new StorageUnavailableError()),
  delete: () => Promise.reject(new StorageUnavailableError()),
  publicUrl: () => '',
  list: () => Promise.reject(new StorageUnavailableError()),
};

let cached: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  if (cached) return cached;
  const { driver, env } = storageDriver();
  cached =
    driver === 'local'
      ? localStorage(env)
      : driver === 's3'
        ? guardStore(s3Storage(env))
        : driver === 'vercel-blob'
          ? guardStore(vercelBlobStorage(env))
          : disabledStorage;
  return cached;
}

/** Tests only: re-read the environment on next use. */
export function resetStorageForTests(): void {
  cached = undefined;
  cachedPrivate = undefined;
}

/** Tests only: use these stores until the next reset (e.g. one that refuses every call). */
export function setStorageForTests(
  store: ObjectStorage,
  privateStore: PrivateStorage | null,
): void {
  cached = store;
  cachedPrivate = privateStore;
}
