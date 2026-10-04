import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { SESSION_TTL_SECONDS } from '@oda/shared';
import { GET as getMe } from '@/app/api/me/route';
import { POST as checkToken } from '@/app/api/reset-password/check/route';
import { resetTokenStatus } from './auth';
import { handleAuthRequest } from './authRoute';
import { getDb } from './db';
import { testOutbox } from './email/transport';
import { lastCode, signUpThroughCode, signupApi } from '@/test/signup';

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
        'x-real-ip': opts.ip ?? '10.0.0.1',
        ...opts.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as Body;
  return { status: res.status, json, headers: res.headers };
}

const signIn = (email = EMAIL, password = PASSWORD, opts?: CallOptions) =>
  call('/sign-in/email', { email, password }, opts);
const requestReset = (email = EMAIL, opts?: CallOptions) =>
  call('/request-password-reset', { email }, opts);

function lastResetToken(email = EMAIL): string {
  const text = testOutbox.last(email)?.text ?? '';
  const token = /\/reset-password#token=([^\s]+)/.exec(text)?.[1];
  if (!token) throw new Error(`no reset email for ${email}`);
  return decodeURIComponent(token);
}

const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

/** A verified seller (sign-up through the emailed code), signed in: returns the session token. */
async function signedUpAndVerified(email = EMAIL) {
  await signUpThroughCode(email, PASSWORD);
  const res = await signIn(email, PASSWORD);
  expect(res.status).toBe(200);
  return res.json!.token!;
}

/** Pre-fills a fixed-window counter, as if `count` hits already happened in this window. */
async function fillLimit(key: string, window: number, count: number) {
  await getDb().execute(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${window}) * ${window}), ${count})`);
}

/**
 * Limits use clock-aligned windows (e.g. :00, :15, :30, :45 for 15 minutes), so a test that
 * makes several real hits must not straddle an edge: if fewer than `needSeconds` are left,
 * wait for the next window (a few seconds at most).
 */
async function awayFromWindowEdge(window: number, needSeconds = 10) {
  const left = window - ((Date.now() / 1000) % window);
  if (left < needSeconds) await new Promise((r) => setTimeout(r, (left + 1) * 1000));
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  await truncateAll(getDb());
  testOutbox.clear();
});
afterAll(async () => {
  await truncateAll(getDb());
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
    await awayFromWindowEdge(900);
    await signedUpAndVerified();
    for (let i = 0; i < 5; i++) {
      expect((await signIn(EMAIL, 'wrong-pass1', { ip: `10.0.1.${i}` })).status).toBe(401);
    }
    const locked = await signIn(EMAIL, PASSWORD, { ip: '10.0.2.1' });
    expect(locked.status).toBe(429);
    expect(locked.json!.message).toBe('Too many tries. Wait 15 minutes or reset your password.');
    // Other emails are unaffected.
    await signedUpAndVerified('wanjiku@example.test');
    expect((await signIn('wanjiku@example.test', PASSWORD, { ip: '10.0.2.1' })).status).toBe(200);
  }, 30_000);

  it('lets a locked seller reset their password, which clears the lock', async () => {
    await awayFromWindowEdge(900);
    await signedUpAndVerified();
    for (let i = 0; i < 5; i++) await signIn(EMAIL, 'wrong-pass1');
    expect((await signIn()).status).toBe(429);

    testOutbox.clear();
    expect((await requestReset()).status).toBe(200);
    const token = lastResetToken();
    expect((await call('/reset-password', { token, newPassword: 'newpass2026' })).status).toBe(200);
    expect((await signIn(EMAIL, 'newpass2026')).status).toBe(200);
  }, 30_000);

  it('allows 100 sign-in attempts per IP per 15 minutes', async () => {
    await fillLimit('signin-ip:10.0.0.1', 900, 99);
    expect((await signIn('one@example.test', PASSWORD)).status).toBe(401); // the 100th
    const blocked = await signIn('two@example.test', PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.json!.message).toMatch(/^Too many sign-in attempts\./);
    expect((await signIn('two@example.test', PASSWORD, { ip: '10.9.9.9' })).status).toBe(401);
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
    // The token rides in the fragment, which never reaches a server log (decision #45).
    expect(testOutbox.last()?.text).toContain('http://localhost:3000/reset-password#token=');
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
      // Sign-up and its code are oda's own routes now (decision #49).
      ['POST', '/sign-up/email'],
      ['POST', '/email-otp/send-verification-otp'],
      ['POST', '/email-otp/verify-email'],
      ['POST', '/email-otp/check-verification-otp'],
      ['POST', '/forget-password/email-otp'],
    ] as const) {
      const res = await call(path, method === 'POST' ? { email: EMAIL } : undefined, {
        method,
      });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  describe('origin (the oda:// plugin)', () => {
    async function sessionCookie() {
      await signedUpAndVerified();
      const signedIn = await signIn();
      return signedIn.headers.get('set-cookie')!.split(';')[0]!;
    }

    it("accepts the app's scheme, oda://", async () => {
      const cookie = await sessionCookie();
      const res = await call('/sign-out', {}, { headers: { cookie, 'expo-origin': 'oda://' } });
      expect(res.status).toBe(200);
    });

    it('rejects a made-up Origin', async () => {
      const cookie = await sessionCookie();
      const res = await call(
        '/sign-out',
        {},
        { headers: { cookie, origin: 'https://evil.example' } },
      );
      expect(res.status).toBe(403);
      expect(res.json!.code).toBe('INVALID_ORIGIN');
    });

    it('rejects a made-up expo-origin, and never lets it override a real Origin', async () => {
      const cookie = await sessionCookie();
      const fake = await call('/sign-out', {}, { headers: { cookie, 'expo-origin': 'evil://' } });
      expect(fake.status).toBe(403);
      const both = await call(
        '/sign-out',
        {},
        { headers: { cookie, origin: 'https://evil.example', 'expo-origin': 'oda://' } },
      );
      expect(both.status).toBe(403);
    });

    it('rejects a browser request with cookies but no Origin', async () => {
      const cookie = await sessionCookie();
      const res = await call(
        '/sign-out',
        {},
        { headers: { cookie, 'sec-fetch-site': 'cross-site' } },
      );
      expect(res.status).toBe(403);
      expect(res.json!.code).toBe('MISSING_OR_NULL_ORIGIN');
    });
  });
});

describe('logs (decision #45)', () => {
  it('never contain a code, a reset token or a password', async () => {
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(
          args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '),
        );
      }),
    );
    try {
      const started = await signupApi.start({ email: EMAIL, password: PASSWORD });
      const attemptId = started.json.attemptId!;
      const code = lastCode(EMAIL);
      await signupApi.verify(attemptId, wrongCode(code));
      await signupApi.verify(attemptId, code);
      await signIn(EMAIL, 'wrong-pass1');
      await requestReset();
      const token = lastResetToken();
      await call('/reset-password', { token, newPassword: 'short' });
      await call('/reset-password', { token, newPassword: 'newpass2026' });
      await call('/reset-password', { token, newPassword: 'again2026x' });

      expect(lines.length).toBeGreaterThan(0); // Better Auth did log (warnings)
      const all = lines.join(String.fromCharCode(10));
      for (const secret of [
        code,
        wrongCode(code),
        attemptId,
        token,
        PASSWORD,
        'wrong-pass1',
        'newpass2026',
      ]) {
        expect(all).not.toContain(secret);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe('POST /api/reset-password/check', () => {
  const check = (body: unknown, ip = '10.0.0.1') =>
    checkToken(
      new Request('http://localhost:3000/api/reset-password/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': ip },
        body: JSON.stringify(body),
      }),
    );

  it('says whether a reset link still works', async () => {
    await signedUpAndVerified();
    await requestReset();
    const token = lastResetToken();
    expect(await (await check({ token })).json()).toEqual({ status: 'valid' });
    await call('/reset-password', { token, newPassword: 'newpass2026' });
    expect(await (await check({ token })).json()).toEqual({ status: 'invalid' });
  });

  it('treats a missing or odd token as invalid', async () => {
    for (const body of [{}, { token: '' }, { token: 42 }, { token: 'x'.repeat(500) }]) {
      const res = await check(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'invalid' });
    }
  });

  it('limits guesses per IP', async () => {
    await fillLimit('reset-check-ip:10.0.0.7', 3600, 60);
    expect((await check({ token: 'abc' }, '10.0.0.7')).status).toBe(429);
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
