import 'server-only';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { schema } from '@oda/db';
import { z } from 'zod';
import { getDb } from './db';
import { ensureProfile } from './profiles';

// Better Auth server core (decision #34). M1: email + password and bearer sessions, used by
// requireUser/requireSeller. M2 adds the email OTP, Resend, the Expo plugin and /api/auth.

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
});

/**
 * Everything except the database adapter, so tests can compare Better Auth's expected
 * tables (better-auth/db getSchema) with packages/db/src/schema/auth.ts.
 */
export const authOptions = {
  user: { modelName: 'auth_user' },
  session: { modelName: 'auth_session' },
  account: { modelName: 'auth_account' },
  verification: { modelName: 'auth_verification' },
  advanced: { database: { generateId: 'uuid' } },
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [bearer()],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureProfile(getDb(), user.id);
        },
      },
    },
  },
} satisfies BetterAuthOptions;

function createAuth() {
  const env = authEnvSchema.parse(process.env);
  return betterAuth({
    ...authOptions,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        auth_user: schema.authUser,
        auth_session: schema.authSession,
        auth_account: schema.authAccount,
        auth_verification: schema.authVerification,
      },
    }),
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cached: Auth | undefined;

/** The Better Auth instance, created on first use (env is read lazily, like serverEnv). */
export function getAuth(): Auth {
  cached ??= createAuth();
  return cached;
}
