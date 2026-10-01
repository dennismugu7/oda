import 'server-only';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url({ message: 'DATABASE_URL must be a postgres:// URL' }),
  PUBLIC_SHOP_BASE_URL: z.url().default('http://localhost:3000'),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Parsed lazily so `next build` doesn't need runtime secrets. */
export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}

export const envSchema = schema;
