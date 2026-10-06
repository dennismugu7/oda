import 'server-only';
import { isPublicBaseUrl, normalizeKePhone } from '@oda/shared';
import { z } from 'zod';

const LOCAL_SHOP_BASE_URL = 'http://localhost:3000';

const schema = z
  .object({
    DATABASE_URL: z.url({ message: 'DATABASE_URL must be a postgres:// URL' }),
    PUBLIC_SHOP_BASE_URL: z.url().optional(),
    VERCEL: z.string().optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
    /** Expo access token for sending pushes (enhanced push security on; decision #65 a). */
    EXPO_ACCESS_TOKEN: z.string().min(10).optional(),
    /** Bearer secret for /api/cron/* (decision #69); unset = those routes are 404. */
    CRON_SECRET: z
      .string()
      .min(32, { message: 'CRON_SECRET must be at least 32 characters' })
      .optional(),
    /** Bearer secret for /api/ops/* (manual ops workflows, decision #73 c); unset = 404. */
    OPS_SECRET: z
      .string()
      .min(32, { message: 'OPS_SECRET must be at least 32 characters' })
      .optional(),
    /** Help's support contact (decision #77): email always, WhatsApp only when set. */
    ODA_SUPPORT_EMAIL: z.email().default('support@mugu-labs.com'),
    ODA_SUPPORT_WHATSAPP: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v?.trim()) return null;
        const e164 = normalizeKePhone(v);
        if (!e164) {
          ctx.addIssue({
            code: 'custom',
            message: 'ODA_SUPPORT_WHATSAPP must be a Kenyan mobile number',
          });
          return z.NEVER;
        }
        return e164;
      }),
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
