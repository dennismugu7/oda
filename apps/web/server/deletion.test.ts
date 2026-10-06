import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { GET as getMe } from '@/app/api/me/route';
import { anonCall, newSeller, type Seller } from '@/test/sellerApi';
import {
  confirmDeletion,
  linkStatus,
  postDeleteMe,
  postDeletionCheck,
  postDeletionConfirm,
  postDeletionRequest,
} from './accountDeletion';
import { handleAuthRequest } from './authRoute';
import type { Defer } from './checkout';
import { getDb } from './db';
import { testOutbox } from './email/transport';
import { publicRepo } from './repos/public';
import type { Handler } from './routeHandler';
import { getDetails } from './settingsRoutes';

// M8a CP3: account deletion in the app (type "DELETE") and on the web (/delete-account →
// emailed link → confirm). Both close the shop at once, sign every phone out and leave an
// audit row; the purge (purge.test.ts) removes the rest after 30 days.

const db = () => getDb();
const t = schema;
const ORIGIN = 'http://localhost:3000';

let deferred: Promise<void>[] = [];
const defer: Defer = (work) => {
  deferred.push(work());
};
const settle = async () => {
  await Promise.all(deferred);
  deferred = [];
};

beforeEach(async () => {
  await truncateAll(db());
  testOutbox.clear();
});
afterAll(async () => {
  await truncateAll(db());
});

const asHandler = (h: (r: Request) => Promise<Response>) => h as unknown as Handler;

async function emailOf(s: Seller) {
  return (await s.call(getDetails)).json.email as string;
}

async function signIn(email: string, password = 'kitenge2026') {
  const res = await handleAuthRequest(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'oda://', 'x-real-ip': '10.1.0.1' },
      body: JSON.stringify({ email, password }),
    }),
  );
  return { status: res.status, json: (await res.json()) as { code?: string } };
}

async function web(
  handler: (r: Request, d: Defer) => Promise<Response>,
  path: string,
  body: unknown,
  headers: Record<string, string> = { origin: ORIGIN },
) {
  const res = await handler(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '10.2.0.1', ...headers },
      body: JSON.stringify(body),
    }),
    defer,
  );
  await settle();
  return { status: res.status, json: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const requestLink = (email: string, headers?: Record<string, string>) =>
  web(postDeletionRequest, '/api/delete-account', { email }, headers);
const check = (token: string) =>
  web((r) => postDeletionCheck(r), '/api/delete-account/check', { token });
const confirm = (token: string) =>
  web((r) => postDeletionConfirm(r), '/api/delete-account/confirm', { token });

function tokenFrom(email: string): string {
  const text = testOutbox.last(email)?.text ?? '';
  const token = /\/delete-account\/confirm#token=([^\s]+)/.exec(text)?.[1];
  if (!token) throw new Error(`no deletion email for ${email}`);
  return decodeURIComponent(token);
}

async function expectDeleted(s: Seller, email: string, via: 'app' | 'web') {
  // The shop page 404s at once.
  expect(await publicRepo(db()).findShop(s.slug)).toEqual({ kind: 'not_found' });
  // Signed out everywhere, and the session that was used no longer works.
  expect(await db().select().from(t.authSession).where(eq(t.authSession.userId, s.userId))).toEqual(
    [],
  );
  expect((await s.call(asHandler(getMe))).status).toBe(401);
  // Signing in again is refused with a clear message (only after the right password).
  const again = await signIn(email);
  expect(again.status).toBe(403);
  expect(again.json.code).toBe('ACCOUNT_DELETED');
  expect((await signIn(email, 'wrong-password-1')).status).toBe(401);
  const [event] = await db()
    .select()
    .from(t.opsEvents)
    .where(eq(t.opsEvents.action, 'account_deleted'));
  expect(event).toMatchObject({ shopId: s.shopId, targetId: s.userId, actor: 'seller' });
  expect(event!.details).toMatchObject({ via, slug: s.slug });
}

describe('in the app', () => {
  it('needs DELETE typed exactly, then closes the shop and signs out everywhere', async () => {
    const s = await newSeller();
    const email = await emailOf(s);
    await db()
      .update(t.profiles)
      .set({ expoPushTokens: ['ExponentPushToken[abc]'] })
      .where(eq(t.profiles.id, s.userId));
    for (const body of [{}, { confirm: 'delete' }, { confirm: 'DELETE', extra: 1 }]) {
      expect((await s.call(asHandler(postDeleteMe), { body })).status, JSON.stringify(body)).toBe(
        422,
      );
    }
    expect((await s.call(asHandler(postDeleteMe), { body: { confirm: 'DELETE' } })).status).toBe(
      204,
    );
    const profile = await db().query.profiles.findFirst({ where: eq(t.profiles.id, s.userId) });
    expect(profile).toMatchObject({ expoPushTokens: [] });
    expect(profile!.deletedAt).toBeInstanceOf(Date);
    await expectDeleted(s, email, 'app');
    expect(await anonCall(asHandler(postDeleteMe), { method: 'POST' })).toBe(401);
  });
});

describe('on the web', () => {
  it('answers the same for any email; only a real account gets the link', async () => {
    const s = await newSeller();
    const email = await emailOf(s);
    const unknown = await requestLink('nobody@example.test');
    const known = await requestLink(` ${email.toUpperCase()} `);
    expect(unknown).toEqual(known);
    expect(known).toEqual({ status: 200, json: { ok: true } });
    expect(testOutbox.last('nobody@example.test')).toBeUndefined();
    expect(testOutbox.last(email)).toMatchObject({ kind: 'delete-account-link' });
    // The link carries the token in the fragment; only its hash is stored.
    const token = tokenFrom(email);
    const [row] = await db().select().from(t.deletionRequests);
    expect(row).toMatchObject({ email, shopSlug: s.slug, confirmedAt: null });
    expect(row!.tokenHash).not.toContain(token);
    // Nothing changes until the link is confirmed.
    expect((await publicRepo(db()).findShop(s.slug)).kind).toBe('shop');
  });

  it('the link shows the account, deletes once, and then says it was used', async () => {
    const s = await newSeller();
    const email = await emailOf(s);
    await requestLink(email);
    const token = tokenFrom(email);
    expect((await check(token)).json).toEqual({
      status: 'valid',
      shopName: 'Amani Styles',
      email,
    });
    expect((await confirm(token)).status).toBe(200);
    await expectDeleted(s, email, 'web');
    expect((await check(token)).json).toEqual({ status: 'used' });
    const again = await confirm(token);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('link_used');
    const [row] = await db().select().from(t.deletionRequests);
    expect(row).toMatchObject({ status: 'closed' });
    expect(row!.confirmedAt).toBeInstanceOf(Date);
    // A deleted account gets no new link.
    testOutbox.clear();
    await requestLink(email);
    expect(testOutbox.last(email)).toBeUndefined();
  });

  it('an expired, wrong or missing token deletes nothing', async () => {
    const s = await newSeller();
    const email = await emailOf(s);
    await requestLink(email);
    const token = tokenFrom(email);
    for (const bad of ['', 'x'.repeat(43), `${token}x`]) {
      expect((await check(bad)).json).toEqual({ status: 'invalid' });
      expect((await confirm(bad)).status).toBe(bad ? 409 : 409);
    }
    await db()
      .update(t.deletionRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await linkStatus(db(), token)).toEqual({ status: 'invalid' });
    await expect(confirmDeletion(db(), token)).rejects.toMatchObject({ code: 'link_invalid' });
    expect((await publicRepo(db()).findShop(s.slug)).kind).toBe('shop');
  });

  it('two taps at once delete once', async () => {
    const s = await newSeller();
    const email = await emailOf(s);
    await requestLink(email);
    const token = tokenFrom(email);
    const results = await Promise.all([confirm(token), confirm(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await db().select().from(t.opsEvents).where(eq(t.opsEvents.action, 'account_deleted')),
    ).toHaveLength(1);
  });

  it('limits: 3 emails an hour per address (silently), 10 requests per IP, other sites refused', async () => {
    const s = await newSeller();
    const email = await emailOf(s);
    for (let i = 0; i < 4; i++) expect((await requestLink(email)).status).toBe(200);
    expect(testOutbox.all().filter((m) => m.to === email)).toHaveLength(3);
    for (let i = 0; i < 6; i++) await requestLink(`n${i}@example.test`);
    expect((await requestLink('late@example.test')).status).toBe(429);
    const cross = await requestLink(email, { origin: 'https://evil.example' });
    expect(cross.status).toBe(403);
  });
});
