import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { schema, type Db } from '@oda/db';
import {
  emailSchema,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  passwordProblem,
  resendWaitSeconds,
} from '@oda/shared';
import { z } from 'zod';
import { AUTH_LIMITS, getAuth } from './auth';
import { getDb } from './db';
import { verificationCodeEmail } from './email/templates';
import { sendEmail } from './email/transport';
import {
  ConflictError,
  HttpError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from './errors';
import { ensureProfile } from './profiles';
import { hitLimit, secondsLeftInWindow, type Limit } from './rateLimit';

// Seller sign-up (decision #49). An attempt holds the email, the pending password hash and
// its own code; nothing exists in auth_user until a code is entered. Only the attempt whose
// code is entered creates the account, with that attempt's password, so nobody can park
// their own password on someone else's email (pre-account takeover). The attempt id is
// returned only to the phone that started it, never emailed, and verify needs both.

/** Attempts (and their pending passwords) are kept 7 days, then deleted lazily. */
export const ATTEMPT_TTL_DAYS = 7;
const CLEANUP_BATCH = 100;

export const SIGNUP_LIMITS = {
  startsPerIp: AUTH_LIMITS.signUpPerIp,
  codeSendsPerEmail: AUTH_LIMITS.codeSendsPerEmail,
  codeSendsPerIp: AUTH_LIMITS.codeSendsPerIp,
  codeChecksPerEmail: AUTH_LIMITS.codeChecksPerEmail,
  codeChecksPerIp: AUTH_LIMITS.codeChecksPerIp,
} satisfies Record<string, Limit>;

const HAS_SHOP = 'This email already has a shop. Sign in?';
const EXPIRED_ATTEMPT = 'This sign-up has expired. Start again.';

export const startSchema = z.object({
  email: emailSchema,
  password: z.string().max(1000),
  /** The attempt this phone already has for this email (from SecureStore), if any. */
  attemptId: z.uuid().optional(),
});
export const attemptSchema = z.object({ attemptId: z.uuid({ error: EXPIRED_ATTEMPT }) });
export const verifySchema = attemptSchema.extend({ code: z.string().max(20) });

export interface StartResult {
  attemptId: string;
  email: string;
  /** True when this phone already had an attempt for the email ("Finish signing up"). */
  resumed: boolean;
  /** Seconds before another code can be sent (0 = a code was just sent). */
  retryAfter: number;
  codeSent: boolean;
}

function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

async function limitOrThrow(key: string, limit: Limit, message: string): Promise<void> {
  if (!(await hitLimit(getDb(), key, limit))) {
    const wait = secondsLeftInWindow(limit);
    throw new TooManyRequestsError(`${message} Try again in ${minutesText(wait)}.`, wait);
  }
}

/** HMAC-SHA256 key for codes, derived from the server secret (never the secret itself). */
function codeKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET is not set');
  return createHmac('sha256', secret).update('oda:signup-code:v1').digest();
}

export function hashCode(attemptId: string, code: string): string {
  return createHmac('sha256', codeKey()).update(`${attemptId}:${code}`).digest('hex');
}

function codeMatches(attemptId: string, code: string, stored: string): boolean {
  const given = Buffer.from(hashCode(attemptId, code), 'hex');
  const expected = Buffer.from(stored, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function newCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

async function hasVerifiedAccount(db: Db, email: string): Promise<boolean> {
  const user = await db.query.authUser.findFirst({
    columns: { id: true },
    where: eq(schema.authUser.email, email),
  });
  return !!user;
}

/** When a code last went to this email, from any attempt (the 60 s cooldown is per email). */
async function lastCodeSentTo(db: Db, email: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: schema.signupAttempts.lastSentAt })
    .from(schema.signupAttempts)
    .where(and(eq(schema.signupAttempts.email, email), sql`last_sent_at is not null`))
    .orderBy(desc(schema.signupAttempts.lastSentAt))
    .limit(1);
  return row?.at ?? null;
}

/** Deletes a small batch of attempts older than 7 days (lazy cleanup, decision #49). */
export async function cleanupOldAttempts(db: Db = getDb()): Promise<number> {
  const cutoff = sql`now() - make_interval(days => ${ATTEMPT_TTL_DAYS})`;
  const old = db
    .select({ id: schema.signupAttempts.id })
    .from(schema.signupAttempts)
    .where(lt(schema.signupAttempts.createdAt, cutoff))
    .orderBy(asc(schema.signupAttempts.createdAt))
    .limit(CLEANUP_BATCH);
  const deleted = await db
    .delete(schema.signupAttempts)
    .where(inArray(schema.signupAttempts.id, old))
    .returning({ id: schema.signupAttempts.id });
  return deleted.length;
}

/** Sends a fresh code for the attempt (replacing its old one) if the cooldown allows. */
async function sendCodeIfAllowed(
  db: Db,
  attempt: { id: string; email: string },
  ip: string,
  { force }: { force: boolean },
): Promise<{ codeSent: boolean; retryAfter: number }> {
  const wait = resendWaitSeconds(await lastCodeSentTo(db, attempt.email));
  if (wait > 0) {
    if (force)
      throw new TooManyRequestsError(`Wait ${wait} seconds before asking for a new code.`, wait);
    return { codeSent: false, retryAfter: wait };
  }
  await limitOrThrow(
    `code-send:${attempt.email}`,
    SIGNUP_LIMITS.codeSendsPerEmail,
    'Too many codes.',
  );
  await limitOrThrow(`code-send-ip:${ip}`, SIGNUP_LIMITS.codeSendsPerIp, 'Too many codes.');
  const code = newCode();
  await db
    .update(schema.signupAttempts)
    .set({
      codeHash: hashCode(attempt.id, code),
      codeExpiresAt: sql`now() + make_interval(secs => ${OTP_TTL_SECONDS})`,
      codeAttempts: 0,
      lastSentAt: sql`now()`,
    })
    .where(eq(schema.signupAttempts.id, attempt.id));
  await sendEmail(verificationCodeEmail(attempt.email, code));
  return { codeSent: true, retryAfter: 0 };
}

/** POST /api/signup/start: begin (or, from the same phone, resume) a sign-up. */
export async function startSignup(
  input: unknown,
  ip: string,
  db: Db = getDb(),
): Promise<StartResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check your email and password.');
  }
  const { email, password, attemptId } = parsed.data;
  const problem = passwordProblem(password);
  if (problem) throw new ValidationError(problem, { password: problem }, 'WEAK_PASSWORD');

  await limitOrThrow(`signup-ip:${ip}`, SIGNUP_LIMITS.startsPerIp, 'Too many new accounts.');
  await cleanupOldAttempts(db);

  // Owner's choice (decision #43): say so plainly.
  if (await hasVerifiedAccount(db, email)) throw new ConflictError(HAS_SHOP, 'EMAIL_HAS_ACCOUNT');

  const auth = await getAuth().$context;
  const passwordHash = await auth.password.hash(password);

  // The same phone again (it sent its attempt id): keep that attempt, with the password
  // just typed. Anyone else gets a new attempt of their own.
  let attempt: { id: string; email: string } | undefined;
  if (attemptId) {
    [attempt] = await db
      .update(schema.signupAttempts)
      .set({ passwordHash })
      .where(and(eq(schema.signupAttempts.id, attemptId), eq(schema.signupAttempts.email, email)))
      .returning({ id: schema.signupAttempts.id, email: schema.signupAttempts.email });
  }
  const resumed = !!attempt;
  if (!attempt) {
    [attempt] = await db
      .insert(schema.signupAttempts)
      .values({ email, passwordHash })
      .returning({ id: schema.signupAttempts.id, email: schema.signupAttempts.email });
  }
  const sent = await sendCodeIfAllowed(db, attempt!, ip, { force: false });
  return { attemptId: attempt!.id, email, resumed, ...sent };
}

async function findAttempt(db: Db, attemptId: string) {
  const attempt = await db.query.signupAttempts.findFirst({
    where: and(
      eq(schema.signupAttempts.id, attemptId),
      sql`created_at > now() - make_interval(days => ${ATTEMPT_TTL_DAYS})`,
    ),
  });
  if (!attempt) throw new NotFoundError(EXPIRED_ATTEMPT);
  return attempt;
}

/** POST /api/signup/resend: a new code for this attempt (cooldown and limits apply). */
export async function resendSignupCode(input: unknown, ip: string, db: Db = getDb()) {
  const parsed = attemptSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError(EXPIRED_ATTEMPT);
  const attempt = await findAttempt(db, parsed.data.attemptId);
  if (await hasVerifiedAccount(db, attempt.email)) {
    await db.delete(schema.signupAttempts).where(eq(schema.signupAttempts.id, attempt.id));
    throw new ConflictError(HAS_SHOP, 'EMAIL_HAS_ACCOUNT');
  }
  const sent = await sendCodeIfAllowed(db, attempt, ip, { force: true });
  return { attemptId: attempt.id, email: attempt.email, ...sent };
}

type VerifyOutcome = { ok: true; email: string; userId: string } | { ok: false; error: HttpError };

/**
 * POST /api/signup/verify: checks the code against this attempt only and, if right, creates
 * the account with this attempt's password. One transaction, serialized per email (advisory
 * lock) and per attempt (row lock), so two verifies can't both create an account.
 */
export async function verifySignup(input: unknown, ip: string, db: Db = getDb()) {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError(EXPIRED_ATTEMPT);
  const { attemptId, code } = parsed.data;

  const peek = await findAttempt(db, attemptId);
  await limitOrThrow(
    `code-check:${peek.email}`,
    SIGNUP_LIMITS.codeChecksPerEmail,
    'Too many tries.',
  );
  await limitOrThrow(`code-check-ip:${ip}`, SIGNUP_LIMITS.codeChecksPerIp, 'Too many tries.');

  const outcome = await db.transaction(async (tx): Promise<VerifyOutcome> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'signup:' + peek.email}))`);
    const [attempt] = await tx
      .select()
      .from(schema.signupAttempts)
      .where(eq(schema.signupAttempts.id, attemptId))
      .for('update');
    if (!attempt) {
      // Another attempt for this email won the race and removed this one with it.
      return (await hasVerifiedAccount(tx as unknown as Db, peek.email))
        ? { ok: false, error: new ConflictError(HAS_SHOP, 'EMAIL_HAS_ACCOUNT') }
        : { ok: false, error: new NotFoundError(EXPIRED_ATTEMPT) };
    }

    if (await hasVerifiedAccount(tx as unknown as Db, attempt.email)) {
      await tx.delete(schema.signupAttempts).where(eq(schema.signupAttempts.id, attempt.id));
      return { ok: false, error: new ConflictError(HAS_SHOP, 'EMAIL_HAS_ACCOUNT') };
    }
    if (!attempt.codeHash || !attempt.codeExpiresAt) {
      return {
        ok: false,
        error: new ValidationError('Tap Resend to get your code.', undefined, 'NO_CODE'),
      };
    }
    if (attempt.codeAttempts >= OTP_MAX_ATTEMPTS) {
      return {
        ok: false,
        error: new HttpError(
          403,
          'Too many wrong codes. Tap Resend for a new one.',
          'TOO_MANY_ATTEMPTS',
        ),
      };
    }
    if (attempt.codeExpiresAt <= new Date()) {
      return {
        ok: false,
        error: new ValidationError(
          'That code has expired. Tap Resend for a new one.',
          undefined,
          'OTP_EXPIRED',
        ),
      };
    }
    if (!codeMatches(attempt.id, code.trim(), attempt.codeHash)) {
      await tx
        .update(schema.signupAttempts)
        .set({ codeAttempts: attempt.codeAttempts + 1 })
        .where(eq(schema.signupAttempts.id, attempt.id));
      return {
        ok: false,
        error: new ValidationError(
          "That code isn't right. Check the email and try again.",
          undefined,
          'INVALID_OTP',
        ),
      };
    }

    // The account, as Better Auth's own sign-up creates it (auth_user + credential account,
    // auth_account.account_id = user id), plus the profile its create hook adds.
    const [user] = await tx
      .insert(schema.authUser)
      .values({ name: '', email: attempt.email, emailVerified: true })
      .returning({ id: schema.authUser.id });
    await tx.insert(schema.authAccount).values({
      userId: user!.id,
      accountId: user!.id,
      providerId: 'credential',
      password: attempt.passwordHash,
    });
    await ensureProfile(tx as unknown as Db, user!.id);
    // Only this attempt: any other attempt for the email is refused ("already has a shop")
    // and deleted when it is used, or by the 7-day cleanup.
    await tx.delete(schema.signupAttempts).where(eq(schema.signupAttempts.id, attempt.id));
    return { ok: true, email: attempt.email, userId: user!.id };
  });

  if (!outcome.ok) throw outcome.error;
  return { email: outcome.email };
}
