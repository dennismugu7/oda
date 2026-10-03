import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { SESSION_TTL_SECONDS } from '@oda/shared';
import { GET as getMe } from '@/app/api/me/route';
import { resetTokenStatus } from './auth';
import { handleAuthRequest } from './authRoute';
import { getDb } from './db';
import { testOutbox } from './email/transport';

// Seller auth end to end through the HTTP handler (allowlist, hooks, Better Auth, emails),
// against oda_test. Rate limits are per IP and email; truncateAll clears them per test.

const EMAIL = 'amani@example.test';
const PASSWORD = 'kitenge2026';

/** What Better Auth and our hooks answer (only the fields the tests read). */
type Body = {
  code?: string;
  message?: string;
  token?: string | null;
  retryAfter?: number;
  user?: { email: string };
} | null;

interface CallOptions {
  ip?: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
}

async function call(path: string, body?: unknown, opts: CallOptions = {}) {
  const method = opts.method ?? (body === undefined ? 'GET' : 'POST');
  const res = await handleAuthRequest(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': opts.ip ?? '10.0.0.1',
        ...opts.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as Body;
  return { status: res.status, json, headers: res.headers };
}

const signUp = (email = EMAIL, password = PASSWORD, opts?: CallOptions) =>
  call('/sign-up/email', { email, password, name: '' }, opts);
const signIn = (email = EMAIL, password = PASSWORD, opts?: CallOptions) =>
  call('/sign-in/email', { email, password }, opts);
const verify = (otp: string, email = EMAIL, opts?: CallOptions) =>
  call('/email-otp/verify-email', { email, otp }, opts);
const sendCode = (email = EMAIL, opts?: CallOptions) =>
  call('/email-otp/send-verification-otp', { email, type: 'email-verification' }, opts);
const requestReset = (email = EMAIL, opts?: CallOptions) =>
  call('/request-password-reset', { email }, opts);

function lastCode(email = EMAIL): string {
  const subject = testOutbox.last(email)?.subject ?? '';
  const code = /^(\d{6}) is your oda code$/.exec(subject)?.[1];
  if (!code) throw new Error(`no code email for ${email}`);
  return code;
}

function lastResetToken(email = EMAIL): string {
  const text = testOutbox.last(email)?.text ?? '';
  const token = /\/reset-password\?token=([^\s]+)/.exec(text)?.[1];
  if (!token) throw new Error(`no reset email for ${email}`);
  return decodeURIComponent(token);
}

const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

/** Moves this email's codes into the past, as if they were sent `seconds` ago. */
async function ageCodes(seconds: number, email = EMAIL) {
  await getDb().execute(sql`
    update auth_verification
    set created_at = created_at - make_interval(secs => ${seconds})
    where identifier = ${`email-verification-otp-${email}`}`);
}

async function signedUpAndVerified(email = EMAIL) {
  expect((await signUp(email)).status).toBe(200);
  const res = await verify(lastCode(email), email);
  expect(res.status).toBe(200);
  return res.json!.token!;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  await truncateAll(getDb());
  testOutbox.clear();
});
afterAll(async () => {
  await truncateAll(getDb());
});

describe('sign up and email code', () => {
  it('creates an unverified account, emails a 6-digit code and gives no session yet', async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    expect(res.json!.token).toBeNull();
    const user = await getDb().query.authUser.findFirst({
      where: eq(schema.authUser.email, EMAIL),
    });
    expect(user?.emailVerified).toBe(false);
    expect(testOutbox.all()).toHaveLength(1);
    expect(lastCode()).toMatch(/^\d{6}$/);
    expect(testOutbox.last()?.html).toContain(lastCode());
  });

  it('stores the code hashed, never in plain text', async () => {
    await signUp();
    const rows = await getDb().select().from(schema.authVerification);
    expect(rows.map((r) => r.value).join()).not.toContain(lastCode());
  });

  it('enforces the password rules', async () => {
    const noNumber = await signUp(EMAIL, 'kitengedress');
    expect(noNumber.status).toBe(400);
    expect(noNumber.json).toMatchObject({
      code: 'WEAK_PASSWORD',
      message: 'Include at least one number.',
    });
    const short = await signUp(EMAIL, 'abc1');
    expect(short.json!.message).toBe('Use at least 8 characters.');
    expect(testOutbox.all()).toHaveLength(0);
  });

  it('says plainly when the email already has a shop (decision #43)', async () => {
    await signUp();
    const again = await signUp(' Amani@Example.test ', 'another2026');
    expect(again.status).toBe(422);
    expect(again.json).toMatchObject({
      code: 'EMAIL_HAS_ACCOUNT',
      message: 'This email already has a shop. Sign in?',
    });
  });

  it('refuses sign-in until the email is verified', async () => {
    await signUp();
    const res = await signIn();
    expect(res.status).toBe(403);
    expect(res.json!.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('verifies with the right code and signs in straight away', async () => {
    const token = await signedUpAndVerified();
    expect(token).toBeTruthy();
    const user = await getDb().query.authUser.findFirst({
      where: eq(schema.authUser.email, EMAIL),
    });
    expect(user?.emailVerified).toBe(true);
    const profile = await getDb().query.profiles.findFirst({
      where: eq(schema.profiles.id, user!.id),
    });
    expect(profile).toBeTruthy();
    const session = await call('/get-session', undefined, { headers: bearer(token) });
    expect(session.json!.user!.email).toBe(EMAIL);
  });

  it('rejects a wrong code, and kills the code after 3 wrong tries', async () => {
    await signUp();
    const code = lastCode();
    for (let i = 0; i < 3; i++) {
      const res = await verify(wrongCode(code));
      expect(res.status).toBe(400);
      expect(res.json!.code).toBe('INVALID_OTP');
    }
    const right = await verify(code);
    expect(right.status).toBe(403);
    expect(right.json!.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('rejects an expired code', async () => {
    await signUp();
    await getDb().execute(
      sql`update auth_verification set expires_at = now() - interval '1 second'`,
    );
    const res = await verify(lastCode());
    expect(res.status).toBe(400);
    expect(res.json!.code).toBe('OTP_EXPIRED');
  });

  it('makes the code expire after 10 minutes', async () => {
    await signUp();
    const [row] = await getDb().select().from(schema.authVerification);
    const minutes = (row!.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  it('waits 60 seconds between codes, then sends a new one that replaces the old', async () => {
    await signUp();
    const first = lastCode();

    const tooSoon = await sendCode();
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.json!.code).toBe('RATE_LIMITED');
    expect(tooSoon.json!.retryAfter).toBeGreaterThan(55);
    expect(tooSoon.json!.retryAfter).toBeLessThanOrEqual(60);
    expect(testOutbox.all()).toHaveLength(1);

    await ageCodes(45);
    const stillTooSoon = await sendCode();
    expect(stillTooSoon.status).toBe(429);
    expect(stillTooSoon.json!.message).toMatch(/^Wait 1[0-9] seconds/);

    await ageCodes(16);
    expect((await sendCode()).status).toBe(200);
    const second = lastCode();
    expect(testOutbox.all()).toHaveLength(2);

    if (second !== first) {
      expect((await verify(first)).status).toBe(400);
    }
    expect((await verify(second)).status).toBe(200);
  });

  it('sends at most 5 codes per email per hour', async () => {
    await signUp(); // the sign-up code doesn't count towards the hourly limit
    for (let i = 0; i < 5; i++) {
      await ageCodes(61);
      expect((await sendCode()).status, `code ${i + 1}`).toBe(200);
    }
    await ageCodes(61);
    const sixth = await sendCode();
    expect(sixth.status).toBe(429);
    expect(sixth.json!.message).toMatch(/^Too many codes\. Try again in \d+ minutes?\.$/);
  });

  it('allows 10 code checks per email per hour', async () => {
    await signUp();
    const code = lastCode();
    for (let i = 0; i < 10; i++) {
      expect((await verify(wrongCode(code))).status).not.toBe(429);
    }
    expect((await verify(code)).status).toBe(429);
  });

  it('sends codes only for email verification', async () => {
    await signedUpAndVerified();
    const res = await call('/email-otp/send-verification-otp', {
      email: EMAIL,
      type: 'sign-in',
    });
    expect(res.status).toBe(400);
  });

  it('sends nothing for an unknown email but answers the same', async () => {
    const res = await sendCode('nobody@example.test');
    expect(res.status).toBe(200);
    expect(testOutbox.all()).toHaveLength(0);
  });
});

describe('sign in', () => {
  it('signs in with the right password and keeps the session for 60 days', async () => {
    await signedUpAndVerified();
    const res = await signIn(' AMANI@example.test ');
    expect(res.status).toBe(200);
    const session = await getDb().query.authSession.findFirst({
      where: eq(schema.authSession.token, res.json!.token!),
    });
    const days = (session!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(59.9);
    expect(days).toBeLessThanOrEqual(SESSION_TTL_SECONDS / 86_400);
  });

  it('uses one message for a wrong password and an unknown email', async () => {
    await signedUpAndVerified();
    const wrong = await signIn(EMAIL, 'wrong-pass1');
    const unknown = await signIn('nobody@example.test', PASSWORD);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json!.message).toBe(unknown.json!.message);
  });

  it('locks an email for the window after 5 wrong passwords, even with the right one', async () => {
    await signedUpAndVerified();
    for (let i = 0; i < 5; i++) {
      expect((await signIn(EMAIL, 'wrong-pass1', { ip: `10.0.1.${i}` })).status).toBe(401);
    }
    const locked = await signIn(EMAIL, PASSWORD, { ip: '10.0.2.1' });
    expect(locked.status).toBe(429);
    expect(locked.json!.message).toMatch(
      /^Too many wrong passwords\. Try again in \d+ minutes?, or reset your password\.$/,
    );
    // Other emails are unaffected.
    await signedUpAndVerified('wanjiku@example.test');
    expect((await signIn('wanjiku@example.test', PASSWORD, { ip: '10.0.2.1' })).status).toBe(200);
  });

  it('limits sign-in attempts per IP', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await signIn(`buyer${i}@example.test`, PASSWORD)).status).toBe(401);
    }
    expect((await signIn('one-more@example.test', PASSWORD)).status).toBe(429);
    expect((await signIn('one-more@example.test', PASSWORD, { ip: '10.9.9.9' })).status).toBe(401);
  });

  it('limits sign-ups per IP', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await signUp(`new${i}@example.test`)).status).toBe(200);
    }
    const res = await signUp('new10@example.test');
    expect(res.status).toBe(429);
    expect(res.json!.message).toMatch(/^Too many new accounts\./);
  });
});

describe('forgot and reset password', () => {
  it('answers the same for known and unknown emails, emailing only the real account', async () => {
    await signedUpAndVerified();
    testOutbox.clear();
    const known = await requestReset();
    const unknown = await requestReset('nobody@example.test');
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.json).toEqual(unknown.json);
    expect(testOutbox.all()).toHaveLength(1);
    expect(testOutbox.last()?.subject).toBe('Reset your oda password');
    expect(testOutbox.last()?.text).toContain('http://localhost:3000/reset-password?token=');
  });

  it('sends one reset email per minute per account, silently', async () => {
    await signedUpAndVerified();
    testOutbox.clear();
    await requestReset();
    const again = await requestReset();
    expect(again.status).toBe(200);
    expect(testOutbox.all()).toHaveLength(1);
    await getDb().execute(sql`
      update auth_verification set created_at = created_at - interval '61 seconds'
      where identifier like 'reset-password:%'`);
    await requestReset();
    expect(testOutbox.all()).toHaveLength(2);
  });

  it('resets the password, revokes every session and burns the link', async () => {
    const oldSession = await signedUpAndVerified();
    await requestReset();
    const token = lastResetToken();
    expect(await resetTokenStatus(token)).toBe('valid');

    const weak = await call('/reset-password', { token, newPassword: 'nonumbers' });
    expect(weak.status).toBe(400);
    expect(weak.json!.message).toBe('Include at least one number.');

    const ok = await call('/reset-password', { token, newPassword: 'newpass2026' });
    expect(ok.status).toBe(200);

    expect((await signIn(EMAIL, PASSWORD)).status).toBe(401);
    expect((await signIn(EMAIL, 'newpass2026')).status).toBe(200);
    const old = await call('/get-session', undefined, { headers: bearer(oldSession) });
    expect(old.json).toBeNull();

    expect(await resetTokenStatus(token)).toBe('invalid');
    const reuse = await call('/reset-password', { token, newPassword: 'again2026x' });
    expect(reuse.status).toBe(400);
    expect(reuse.json!.code).toBe('INVALID_TOKEN');
  });

  it('refuses an expired link', async () => {
    await signedUpAndVerified();
    await requestReset();
    const token = lastResetToken();
    await getDb().execute(sql`
      update auth_verification set expires_at = now() - interval '1 second'
      where identifier = ${`reset-password:${token}`}`);
    expect(await resetTokenStatus(token)).toBe('invalid');
    const res = await call('/reset-password', { token, newPassword: 'newpass2026' });
    expect(res.status).toBe(400);
  });

  it('treats malformed tokens as invalid without a database lookup', async () => {
    expect(await resetTokenStatus('')).toBe('invalid');
    expect(await resetTokenStatus("x' or 1=1 --")).toBe('invalid');
  });
});

describe('HTTP surface', () => {
  it('serves only the allowlisted endpoints', async () => {
    await signedUpAndVerified();
    for (const [method, path] of [
      ['POST', '/sign-in/email-otp'],
      ['POST', '/update-user'],
      ['POST', '/change-email'],
      ['POST', '/delete-user'],
      ['GET', '/list-sessions'],
      ['GET', '/sign-up/email'],
      ['POST', '/email-otp/check-verification-otp'],
      ['POST', '/forget-password/email-otp'],
    ] as const) {
      const res = await call(path, method === 'POST' ? { email: EMAIL } : undefined, {
        method,
      });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("accepts the app's scheme as origin and refuses others when cookies are sent", async () => {
    await signedUpAndVerified();
    const signedIn = await signIn();
    const cookie = signedIn.headers.get('set-cookie')!.split(';')[0]!;

    const foreign = await call(
      '/sign-out',
      {},
      { headers: { cookie, origin: 'https://evil.example' } },
    );
    expect(foreign.status).toBe(403);

    const app = await call('/sign-out', {}, { headers: { cookie, 'expo-origin': 'oda://' } });
    expect(app.status).toBe(200);
  });
});

describe('GET /api/me', () => {
  const me = (headers: Record<string, string> = {}) =>
    getMe(new Request('http://localhost:3000/api/me', { headers }));

  it('is 401 without a session', async () => {
    expect((await me()).status).toBe(401);
  });

  it('starts a new seller at onboarding step 1', async () => {
    const token = await signedUpAndVerified();
    const res = await me(bearer(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: EMAIL,
      emailVerified: true,
      onboarding: { step: 1, done: false },
      shop: null,
    });
  });

  it('resumes from the draft before the shop exists', async () => {
    const token = await signedUpAndVerified();
    const user = await getDb().query.authUser.findFirst({
      where: eq(schema.authUser.email, EMAIL),
    });
    await getDb()
      .update(schema.profiles)
      .set({ onboardingDraft: { step: 2, businessType: 'fashion' } })
      .where(eq(schema.profiles.id, user!.id));
    expect((await (await me(bearer(token))).json()).onboarding).toEqual({
      step: 2,
      done: false,
    });
  });

  it('shows the shop and its step, then done', async () => {
    const token = await signedUpAndVerified();
    const user = await getDb().query.authUser.findFirst({
      where: eq(schema.authUser.email, EMAIL),
    });
    const [shop] = await getDb()
      .insert(schema.shops)
      .values({
        ownerId: user!.id,
        name: 'Amani Styles',
        slug: 'amani-styles',
        whatsappPhone: '+254712345678',
        onboardingStep: 5,
      })
      .returning();
    const body = await (await me(bearer(token))).json();
    expect(body.onboarding).toEqual({ step: 5, done: false });
    expect(body.shop).toEqual({ id: shop!.id, name: 'Amani Styles', slug: 'amani-styles' });

    await getDb()
      .update(schema.shops)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(schema.shops.id, shop!.id));
    expect((await (await me(bearer(token))).json()).onboarding).toEqual({
      step: null,
      done: true,
    });
  });
});
