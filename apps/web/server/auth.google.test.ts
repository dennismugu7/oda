import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { GET as getMe } from '@/app/api/me/route';
import { signUpThroughCode } from '@/test/signup';
import { handleAuthRequest } from './authRoute';
import { getDb } from './db';
import {
  deleteAccountLinkEmail,
  passwordChangedEmail,
  resetPasswordEmail,
  verificationCodeEmail,
} from './email/templates';
import { testOutbox } from './email/transport';
import { getHome } from './homeRoutes';
import { postAnswer, postShop } from './onboardingRoutes';
import type { Handler } from './routeHandler';

// Google sign-in by ID token (decision #107) through the HTTP handler, against oda_test.
// Google's public keys are replaced by a local test key: no call ever reaches Google.

const CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
vi.stubEnv('GOOGLE_WEB_CLIENT_ID', CLIENT_ID);

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const KID = 'oda-test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const realFetch = globalThis.fetch;
const googleCalls: string[] = [];
beforeEach(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://') && /google/.test(new URL(url).hostname)) {
      googleCalls.push(url);
      if (url === GOOGLE_CERTS) return Response.json({ keys: [jwk] });
      throw new Error(`unexpected Google call ${url}`);
    }
    return realFetch(input, init);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  googleCalls.length = 0;
});

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** A Google-shaped ID token signed with the test key. */
function idToken(claims: Record<string, unknown> = {}, opts: { key?: typeof privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: '1098765432101234567890',
      email: 'wanjiku@gmail.example',
      email_verified: true,
      name: 'Wanjiku Kamau',
      picture: 'https://lh3.googleusercontent.example/photo.jpg',
      iat: now,
      exp: now + 3600,
      ...claims,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(opts.key ?? privateKey))}`;
}

type Body = { code?: string; message?: string; token?: string | null } | null;

async function call(path: string, body?: unknown, ip = '10.0.0.7') {
  const res = await handleAuthRequest(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : {}) as Body };
}

const google = (token: string, extra: Record<string, unknown> = {}) =>
  call('/sign-in/social', { provider: 'google', idToken: { token }, ...extra });

async function me(token: string) {
  const res = await getMe(
    new Request('http://localhost:3000/api/me', { headers: { authorization: `Bearer ${token}` } }),
  );
  return { status: res.status, json: await res.json() };
}

async function rows(email: string) {
  const db = getDb();
  const users = await db.query.authUser.findMany({ where: eq(schema.authUser.email, email) });
  const accounts = users[0]
    ? await db.query.authAccount.findMany({ where: eq(schema.authAccount.userId, users[0].id) })
    : [];
  return { users, accounts };
}

const EMAIL = 'wanjiku@gmail.example';

beforeEach(async () => {
  await truncateAll(getDb());
  testOutbox.clear();
});
afterAll(async () => {
  await truncateAll(getDb());
});

describe('a new Google seller', () => {
  it('gets an account, a profile and onboarding step 1, without Google name, photo or tokens', async () => {
    const res = await google(idToken());
    expect(res.status).toBe(200);
    expect(res.json!.token).toBeTruthy();
    expect(googleCalls).toEqual([GOOGLE_CERTS]);

    const { users, accounts } = await rows(EMAIL);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ name: '', image: null, emailVerified: true });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      providerId: 'google',
      accountId: '1098765432101234567890',
      idToken: null,
      accessToken: null,
      refreshToken: null,
      password: null,
    });
    const profile = await getDb().query.profiles.findFirst({
      where: eq(schema.profiles.id, users[0]!.id),
    });
    expect(profile).toMatchObject({ firstName: null, lastName: null });

    const m = await me(res.json!.token!);
    expect(m.status).toBe(200);
    expect(m.json).toMatchObject({
      email: EMAIL,
      hasPassword: false,
      onboarding: { step: 1, done: false },
      shop: null,
    });
  });

  it('signs in again with the same Google account without new rows', async () => {
    await google(idToken());
    const again = await google(idToken({ name: 'Someone Else' }));
    expect(again.status).toBe(200);
    const { users, accounts } = await rows(EMAIL);
    expect(users).toHaveLength(1);
    expect(users[0]!.name).toBe('');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ idToken: null, accessToken: null });
  });

  it('has no name anywhere it is shown (Home greeting, seller emails; plan §1.5)', async () => {
    const { json } = await google(idToken());
    const headers = { authorization: `Bearer ${json!.token}`, 'content-type': 'application/json' };
    const run = async (handler: Handler, body?: unknown) => {
      const res = await handler(
        new Request('http://localhost:3000/api/x', {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: '' }) },
      );
      return { status: res.status, json: await res.json() };
    };
    const h = (fn: unknown) => fn as Handler;
    await run(h(postAnswer), { step: 1, businessType: 'fashion' });
    await run(h(postAnswer), { step: 2, skip: true });
    const shop = await run(h(postShop), {
      name: 'Wanjiku Wear',
      slug: `wanjiku-${randomUUID().slice(0, 6)}`,
      whatsappPhone: '0712345678',
    });
    expect(shop.status).toBe(200);
    const home = await run(h(getHome));
    expect(home.status).toBe(200);
    expect(home.json.firstName).toBeNull();

    for (const email of [
      verificationCodeEmail(EMAIL, '123456'),
      resetPasswordEmail(EMAIL, 'https://oda.example/reset-password#token=x'),
      passwordChangedEmail(EMAIL),
      deleteAccountLinkEmail(EMAIL, 'https://oda.example/delete-account/confirm#token=x'),
    ]) {
      for (const part of [email.subject, email.text, email.html]) {
        expect(part).not.toMatch(/\b(Hi|Hello|Dear)\s*[,!]/);
        expect(part).not.toContain('undefined');
        expect(part).not.toContain('null');
      }
    }
  });
});

describe('an existing email account', () => {
  it('is linked to Google: same user, both sign-in methods', async () => {
    await signUpThroughCode(EMAIL, 'kitenge2026');
    const before = await rows(EMAIL);

    const res = await google(idToken());
    expect(res.status).toBe(200);
    const after = await rows(EMAIL);
    expect(after.users).toHaveLength(1);
    expect(after.users[0]!.id).toBe(before.users[0]!.id);
    expect(after.accounts.map((a) => a.providerId).sort()).toEqual(['credential', 'google']);
    expect(after.accounts.find((a) => a.providerId === 'google')).toMatchObject({
      idToken: null,
      accessToken: null,
    });
    expect((await me(res.json!.token!)).json.hasPassword).toBe(true);

    const email = await call('/sign-in/email', { email: EMAIL, password: 'kitenge2026' });
    expect(email.status).toBe(200);
  });

  it('matches the email whatever its case', async () => {
    await signUpThroughCode(EMAIL, 'kitenge2026');
    const res = await google(idToken({ email: 'Wanjiku@Gmail.Example' }));
    expect(res.status).toBe(200);
    expect((await rows(EMAIL)).users).toHaveLength(1);
  });

  it('refuses a deleted account', async () => {
    await signUpThroughCode(EMAIL, 'kitenge2026');
    const { users } = await rows(EMAIL);
    await getDb()
      .update(schema.profiles)
      .set({ deletedAt: new Date() })
      .where(eq(schema.profiles.id, users[0]!.id));
    const res = await google(idToken());
    expect(res.status).toBe(403);
    expect(res.json!.code).toBe('ACCOUNT_DELETED');
  });
});

describe('refused', () => {
  it("a Google email that isn't verified, creating nothing", async () => {
    const res = await google(idToken({ email_verified: false }));
    expect(res.status).toBe(403);
    expect(res.json!.code).toBe('GOOGLE_EMAIL_NOT_VERIFIED');
    expect((await rows(EMAIL)).users).toHaveLength(0);
  });

  it('anything but a Google ID token (no redirect flow, no other provider)', async () => {
    for (const body of [
      { provider: 'google' },
      { provider: 'google', callbackURL: 'oda://' },
      { provider: 'google', idToken: {} },
      { provider: 'google', idToken: { token: '' } },
      { provider: 'google', idToken: { token: 'x'.repeat(5000) } },
      { provider: 'facebook', idToken: { token: idToken() } },
      {},
    ]) {
      const res = await call('/sign-in/social', body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.json!.code).toBe('GOOGLE_ID_TOKEN_ONLY');
    }
    expect(googleCalls).toEqual([]);
  });

  it('a token for another app, an expired one, or a forged signature', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const old = Math.floor(Date.now() / 1000) - 7200;
    for (const token of [
      idToken({ aud: 'someone-else.apps.googleusercontent.com' }),
      idToken({ iat: old, exp: old + 3600 }),
      idToken({ iss: 'https://evil.example' }),
      idToken({}, { key: other }),
      'not.a.jwt',
    ]) {
      const res = await google(token);
      expect(res.status).toBe(401);
    }
    expect((await rows(EMAIL)).users).toHaveLength(0);
  });

  it('client-supplied tokens and user details, which are dropped', async () => {
    // A foreign callback URL is refused outright by Better Auth's origin check.
    const foreign = await google(idToken(), { callbackURL: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    // A trusted one, and other extras, are just dropped by our hook.
    const res = await google(idToken(), { callbackURL: 'oda://', requestSignUp: true });
    expect(res.status).toBe(200);
    const withExtras = await call('/sign-in/social', {
      provider: 'google',
      idToken: {
        token: idToken({ sub: '2222', email: 'other@gmail.example' }),
        accessToken: 'client-access-token-123456789012345',
        refreshToken: 'client-refresh-token-12345678901234',
        user: { name: { firstName: 'Fake', lastName: 'Name' } },
      },
    });
    expect(withExtras.status).toBe(200);
    const { users, accounts } = await rows('other@gmail.example');
    expect(users[0]!.name).toBe('');
    expect(accounts[0]).toMatchObject({ accessToken: null, refreshToken: null, idToken: null });
  });

  it('after 100 sign-in attempts from one IP in 15 minutes (shared with email sign-in)', async () => {
    const ip = '10.9.9.9';
    await getDb().execute(sql`
      insert into rate_limits (key, window_start, count)
      values (${`signin-ip:${ip}`}, to_timestamp(floor(extract(epoch from now()) / 900) * 900), 100)`);
    const res = await call(
      '/sign-in/social',
      { provider: 'google', idToken: { token: idToken() } },
      ip,
    );
    expect(res.status).toBe(429);
    expect(res.json!.code).toBe('RATE_LIMITED');
  });
});

describe('a Google-only seller and passwords', () => {
  it('can set a password through Forgot password (the reset creates it)', async () => {
    const signedIn = await google(idToken());
    expect((await call('/request-password-reset', { email: EMAIL })).status).toBe(200);
    const text = testOutbox.last(EMAIL)?.text ?? '';
    const token = decodeURIComponent(/\/reset-password#token=([^\s]+)/.exec(text)![1]!);
    const reset = await call('/reset-password', { token, newPassword: 'mpya2026pass' });
    expect(reset.status).toBe(200);

    const { accounts } = await rows(EMAIL);
    expect(accounts.map((a) => a.providerId).sort()).toEqual(['credential', 'google']);
    expect((await call('/sign-in/email', { email: EMAIL, password: 'mpya2026pass' })).status).toBe(
      200,
    );
    // The reset signed out every session, including the Google one.
    expect((await me(signedIn.json!.token!)).status).toBe(401);
  });

  it("can't use Change password (no current password): Settings offers Set a password", async () => {
    const { json } = await google(idToken());
    const res = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${json!.token}`,
          'x-real-ip': '10.0.0.7',
        },
        body: JSON.stringify({ currentPassword: 'anything1', newPassword: 'mpya2026pass' }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { accounts } = await rows(EMAIL);
    expect(accounts.filter((a) => a.providerId === 'credential')).toHaveLength(0);
  });
});

describe('HTTP surface', () => {
  it('keeps the rest of the social API closed', async () => {
    for (const [method, path] of [
      ['GET', '/callback/google'],
      ['POST', '/callback/google'],
      ['POST', '/link-social'],
      ['GET', '/list-accounts'],
      ['POST', '/unlink-account'],
      ['POST', '/sign-in/oauth2'],
    ] as const) {
      const res = await call(path, method === 'POST' ? {} : undefined);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it('answers 404 for Google sign-in while GOOGLE_WEB_CLIENT_ID is unset', async () => {
    vi.stubEnv('GOOGLE_WEB_CLIENT_ID', '');
    try {
      const res = await google(idToken());
      expect(res.status).toBe(404);
    } finally {
      vi.stubEnv('GOOGLE_WEB_CLIENT_ID', CLIENT_ID);
    }
    expect((await rows(EMAIL)).users).toHaveLength(0);
  });
});

describe('logs (decision #45)', () => {
  it('never contain an ID token, accepted or refused', async () => {
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(
          args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '),
        );
      }),
    );
    const good = idToken();
    const forged = idToken({ aud: 'someone-else.apps.googleusercontent.com' });
    const unverified = idToken({ email_verified: false, sub: '3333' });
    try {
      await google(good);
      await google(forged);
      await google(unverified);
      const all = lines.join('\n');
      for (const token of [good, forged, unverified]) {
        for (const part of token.split('.')) expect(all).not.toContain(part);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
