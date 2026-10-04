import 'server-only';
import { isPublicBaseUrl } from '@oda/shared';
import { z } from 'zod';

const LOCAL_SHOP_BASE_URL = 'http://localhost:3000';

const schema = z
  .object({
    DATABASE_URL: z.url({ message: 'DATABASE_URL must be a postgres:// URL' }),
    PUBLIC_SHOP_BASE_URL: z.url().optional(),
    VERCEL: z.string().optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  })
  // Shared shop links must be full public https:// URLs wherever the app is deployed: a
  // missing value once made staging share "localhost:3000/…" links (owner Step 58).
  .superRefine((env, ctx) => {
    if (env.VERCEL && !(env.PUBLIC_SHOP_BASE_URL && isPublicBaseUrl(env.PUBLIC_SHOP_BASE_URL))) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_SHOP_BASE_URL'],
        message: 'On Vercel, PUBLIC_SHOP_BASE_URL must be a public https:// URL (not localhost).',
      });
    }
  })
  .transform((env) => ({
    ...env,
    PUBLIC_SHOP_BASE_URL: (env.PUBLIC_SHOP_BASE_URL ?? LOCAL_SHOP_BASE_URL).replace(/\/+$/, ''),
  }));

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Parsed lazily so `next build` doesn't need runtime secrets. */
export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}

export const envSchema = schema;
