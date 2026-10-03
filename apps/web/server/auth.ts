import 'server-only';
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { bearer, emailOTP } from 'better-auth/plugins';
import { and, desc, eq, like } from 'drizzle-orm';
import { schema } from '@oda/db';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  passwordProblem,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_LINK_TTL_SECONDS,
  resendWaitSeconds,
  SESSION_RENEW_AFTER_SECONDS,
  SESSION_TTL_SECONDS,
} from '@oda/shared';
import { z } from 'zod';
import { getDb } from './db';
import { resetPasswordEmail, verificationCodeEmail } from './email/templates';
import { sendEmail } from './email/transport';
import { ensureProfile } from './profiles';
import { clientIp, hitLimit, isLimited, secondsLeftInWindow, type Limit } from './rateLimit';

// Better Auth (docs/spec.md §5.1, decisions #34, #43): email + password, a 6-digit email code
// to verify new accounts, password reset by emailed link to the web /reset-password page.
// Sessions: the seller app (cookie in SecureStore via Better Auth's Expo client); bearer
// tokens stay for server tests. Only the endpoints in AUTH_ROUTES are reachable over HTTP
// (app/api/auth/[...all]/route.ts).

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
});

/** Rate limits per action (Postgres-backed; Better Auth's in-memory limiter is off). */
export const AUTH_LIMITS = {
  signUpPerIp: { window: 3600, max: 10 },
  signInFailuresPerEmail: { window: 900, max: 5 },
  signInPerIp: { window: 900, max: 30 },
  codeSendsPerEmail: { window: 3600, max: 5 },
  codeSendsPerIp: { window: 3600, max: 30 },
  codeChecksPerEmail: { window: 3600, max: 10 },
  codeChecksPerIp: { window: 3600, max: 60 },
  resetMailsPerEmail: { window: 3600, max: 5 },
  resetRequestsPerIp: { window: 3600, max: 30 },
  resetsPerIp: { window: 3600, max: 30 },
} satisfies Record<string, Limit>;

/** The HTTP endpoints the app and the web use; everything else Better Auth offers is 404. */
export const AUTH_ROUTES = {
  GET: ['/get-session'],
  POST: [
    '/sign-up/email',
    '/sign-in/email',
    '/sign-out',
    '/email-otp/send-verification-otp',
    '/email-otp/verify-email',
    '/request-password-reset',
    '/reset-password',
  ],
} as const;

function tooMany(message: string, retryAfter: number): never {
  throw new APIError('TOO_MANY_REQUESTS', { code: 'RATE_LIMITED', message, retryAfter });
}

function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

async function limitOrThrow(key: string, limit: Limit, message: string): Promise<void> {
  if (!(await hitLimit(getDb(), key, limit))) {
    const wait = secondsLeftInWindow(limit);
    tooMany(`${message} Try again in ${minutesText(wait)}.`, wait);
  }
}

function weakPassword(password: unknown): void {
  const problem = typeof password === 'string' ? passwordProblem(password) : 'Enter a password.';
  if (problem) throw new APIError('BAD_REQUEST', { code: 'WEAK_PASSWORD', message: problem });
}

/** When the newest verification code for this email was created. */
async function lastCodeSentAt(email: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: schema.authVerification.createdAt })
    .from(schema.authVerification)
    .where(eq(schema.authVerification.identifier, `email-verification-otp-${email}`))
    .orderBy(desc(schema.authVerification.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

/** When the user's two newest reset links were created, newest first. */
async function lastResetLinksAt(userId: string): Promise<Date[]> {
  const rows = await getDb()
    .select({ createdAt: schema.authVerification.createdAt })
    .from(schema.authVerification)
    .where(
      and(
        like(schema.authVerification.identifier, 'reset-password:%'),
        eq(schema.authVerification.value, userId),
      ),
    )
    .orderBy(desc(schema.authVerification.createdAt))
    .limit(2);
  return rows.map((r) => r.createdAt);
}

const beforeHook = createAuthMiddleware(async (ctx) => {
  await checkLimitsAndRules(ctx);
  // Emails typed on a phone often carry spaces or capitals; Better Auth only lowercases.
  const body = ctx.body as Record<string, unknown> | undefined;
  if (typeof body?.email === 'string') {
    return { context: { body: { ...body, email: body.email.trim().toLowerCase() } } };
  }
});

async function checkLimitsAndRules(ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]) {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const ip = clientIp(ctx.headers ?? ctx.request?.headers);
  const db = getDb();

  switch (ctx.path) {
    case '/sign-up/email': {
      weakPassword(body.password);
      await limitOrThrow(`signup-ip:${ip}`, AUTH_LIMITS.signUpPerIp, 'Too many new accounts.');
      // Owner's choice (decision #43): say so plainly instead of Better Auth's generic reply.
      const existing = await db.query.authUser.findFirst({
        columns: { id: true },
        where: eq(schema.authUser.email, email),
      });
      if (existing) {
        throw new APIError('UNPROCESSABLE_ENTITY', {
          code: 'EMAIL_HAS_ACCOUNT',
          message: 'This email already has a shop. Sign in?',
        });
      }
      return;
    }
    case '/sign-in/email': {
      const failures = AUTH_LIMITS.signInFailuresPerEmail;
      if (email && (await isLimited(db, `signin-fail:${email}`, failures))) {
        const wait = secondsLeftInWindow(failures);
        tooMany(
          `Too many wrong passwords. Try again in ${minutesText(wait)}, or reset your password.`,
          wait,
        );
      }
      await limitOrThrow(`signin-ip:${ip}`, AUTH_LIMITS.signInPerIp, 'Too many sign-in attempts.');
      return;
    }
    case '/email-otp/send-verification-otp': {
      if (body.type !== 'email-verification') {
        throw new APIError('BAD_REQUEST', { code: 'INVALID_TYPE', message: 'Not available.' });
      }
      const wait = resendWaitSeconds(await lastCodeSentAt(email));
      if (wait > 0) {
        tooMany(`Wait ${wait} seconds before asking for a new code.`, wait);
      }
      await limitOrThrow(`code-send:${email}`, AUTH_LIMITS.codeSendsPerEmail, 'Too many codes.');
      await limitOrThrow(`code-send-ip:${ip}`, AUTH_LIMITS.codeSendsPerIp, 'Too many codes.');
      return;
    }
    case '/email-otp/verify-email': {
      const message = 'Too many tries.';
      await limitOrThrow(`code-check:${email}`, AUTH_LIMITS.codeChecksPerEmail, message);
      await limitOrThrow(`code-check-ip:${ip}`, AUTH_LIMITS.codeChecksPerIp, message);
      return;
    }
    case '/request-password-reset': {
      // Per-IP only: a per-email limit here would reveal which emails have accounts. The
      // per-email cooldown is silent (sendResetPassword below).
      const message = 'Too many reset requests.';
      await limitOrThrow(`reset-req-ip:${ip}`, AUTH_LIMITS.resetRequestsPerIp, message);
      return;
    }
    case '/reset-password': {
      weakPassword(body.newPassword);
      await limitOrThrow(`reset-ip:${ip}`, AUTH_LIMITS.resetsPerIp, 'Too many tries.');
      return;
    }
  }
}

const afterHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/sign-in/email') return;
  const returned = ctx.context.returned;
  if (!isAPIError(returned) || returned.statusCode !== 401) return;
  const email = (ctx.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== 'string') return;
  // Counts every failure; the before hook blocks once the window holds `max`.
  await hitLimit(getDb(), `signin-fail:${email.trim().toLowerCase()}`, {
    ...AUTH_LIMITS.signInFailuresPerEmail,
    max: 2_147_483_647, // count only; never blocks here
  });
});

/**
 * Better Auth's Expo server plugin, without its OAuth parts: the app sends its scheme in
 * `expo-origin` (React Native can't set Origin), which becomes the Origin that Better
 * Auth checks against trustedOrigins. Saves a dependency that pulls Expo into the web app.
 */
const expoOrigin = {
  id: 'oda-expo-origin',
  async onRequest(request) {
    if (request.headers.get('origin')) return;
    const origin = request.headers.get('expo-origin');
    if (!origin) return;
    const headers = new Headers(request.headers);
    headers.set('origin', origin);
    return { request: new Request(request, { headers }) };
  },
} satisfies BetterAuthPlugin;

/** The link in email 06: straight to the web page, which checks the token on load. */
export function resetPageUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Everything except the database adapter and env, so tests can compare Better Auth's
 * expected tables (better-auth/db getSchema) with packages/db/src/schema/auth.ts.
 */
export const authOptions = {
  user: { modelName: 'auth_user' },
  session: {
    modelName: 'auth_session',
    expiresIn: SESSION_TTL_SECONDS,
    updateAge: SESSION_RENEW_AFTER_SECONDS,
  },
  account: { modelName: 'auth_account' },
  verification: { modelName: 'auth_verification' },
  // Origin checks on in tests too (Better Auth turns them off under NODE_ENV=test by default).
  advanced: { database: { generateId: 'uuid' }, disableOriginCheck: false },
  // Postgres-backed limits in the hooks instead (shared by every Vercel instance).
  rateLimit: { enabled: false },
  trustedOrigins: process.env.NODE_ENV === 'development' ? ['oda://', 'exp://'] : ['oda://'],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: RESET_LINK_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, token }) {
      // Silent per-email cooldown: the reply is the same either way (decision #43).
      // Better Auth stores this link's token before calling us, so look past the newest one.
      const sent = await lastResetLinksAt(user.id);
      if (sent[1] && resendWaitSeconds(sent[1]) > 0) return;
      const email = user.email.toLowerCase();
      if (!(await hitLimit(getDb(), `reset-mails:${email}`, AUTH_LIMITS.resetMailsPerEmail))) {
        return;
      }
      const base = authEnvSchema.shape.BETTER_AUTH_URL.parse(process.env.BETTER_AUTH_URL);
      await sendEmail(resetPasswordEmail(user.email, resetPageUrl(base, token)));
    },
  },
  emailVerification: {
    // After the code is checked the app is signed in straight away.
    autoSignInAfterVerification: true,
    sendOnSignIn: false,
  },
  plugins: [
    bearer(),
    expoOrigin,
    emailOTP({
      otpLength: OTP_LENGTH,
      expiresIn: OTP_TTL_SECONDS,
      allowedAttempts: OTP_MAX_ATTEMPTS,
      storeOTP: 'hashed',
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== 'email-verification') return;
        await sendEmail(verificationCodeEmail(email, otp));
      },
    }),
  ],
  hooks: { before: beforeHook, after: afterHook },
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

/** Web page 07: whether a reset link still works, so the page can say so before typing. */
export async function resetTokenStatus(token: string): Promise<'valid' | 'invalid'> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return 'invalid';
  const row = await getDb().query.authVerification.findFirst({
    columns: { expiresAt: true },
    where: eq(schema.authVerification.identifier, `reset-password:${token}`),
  });
  return row && row.expiresAt > new Date() ? 'valid' : 'invalid';
}
