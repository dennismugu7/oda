import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';
import { z } from 'zod';
import { authBaseUrl } from './auth';
import { isDeployed } from './email/transport';

// Object storage behind one interface (decision #52), so the provider can be swapped:
// - local:    files under STORAGE_DIR, uploaded through /api/dev-uploads with a signed URL.
//             Development and tests only; refused on Vercel.
// - s3:       any S3-compatible bucket (Cloudflare R2 first): presigned PUT URLs, the phone
//             uploads straight to the bucket; public reads from STORAGE_PUBLIC_BASE_URL.
// - disabled: no provider yet (staging before CP0): uploads answer 503.
// Default: local off Vercel; on Vercel s3 when configured, otherwise disabled.

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the upload must send exactly (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: string;
}

export interface ObjectStorage {
  readonly driver: 'local' | 's3' | 'disabled';
  presignPut(key: string, contentType: string, size: number): Promise<PresignedUpload>;
  /** The object's bytes, or null when it doesn't exist. */
  read(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export class StorageUnavailableError extends Error {
  constructor() {
    super('Photo uploads are not switched on yet');
    this.name = 'StorageUnavailableError';
  }
}

const UPLOAD_TTL_SECONDS = 15 * 60;

const envSchema = z.object({
  STORAGE_DRIVER: z.enum(['local', 's3', 'disabled']).optional(),
  STORAGE_DIR: z.string().default('.uploads'),
  STORAGE_S3_ENDPOINT: z.url().optional(),
  STORAGE_S3_BUCKET: z.string().min(1).optional(),
  STORAGE_S3_REGION: z.string().default('auto'),
  STORAGE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_PUBLIC_BASE_URL: z.url().optional(),
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

export function storageDriver(env: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.parse(env);
  const deployed = isDeployed(env as NodeJS.ProcessEnv);
  const driver =
    parsed.STORAGE_DRIVER ?? (deployed ? (s3Configured(parsed) ? 's3' : 'disabled') : 'local');
  if (deployed && driver === 'local')
    throw new Error('STORAGE_DRIVER=local is not allowed on Vercel');
  if (driver === 's3' && !s3Configured(parsed))
    throw new Error('S3 storage is not fully configured');
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
  };
}

// Disabled --------------------------------------------------------------------------------

const disabledStorage: ObjectStorage = {
  driver: 'disabled',
  presignPut: () => Promise.reject(new StorageUnavailableError()),
  read: () => Promise.reject(new StorageUnavailableError()),
  delete: () => Promise.reject(new StorageUnavailableError()),
  publicUrl: () => '',
};

let cached: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  if (cached) return cached;
  const { driver, env } = storageDriver();
  cached =
    driver === 'local' ? localStorage(env) : driver === 's3' ? s3Storage(env) : disabledStorage;
  return cached;
}

/** Tests only: re-read the environment on next use. */
export function resetStorageForTests(): void {
  cached = undefined;
}
