import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@oda/db';
import { truncateAll } from '@oda/db/testing';
import { anonCall, newSeller, type Seller } from '@/test/sellerApi';
import { storeJpeg } from '@/test/storage';
import { handleAuthRequest } from './authRoute';
import { getDb } from './db';
import { testOutbox } from './email/transport';
import { publicRepo } from './repos/public';
import type { Handler } from './routeHandler';
import {
  deleteAccount,
  getDetails,
  getFeedback,
  getPayments,
  getShopProfile,
  patchAccount,
  patchDetails,
  patchPause,
  patchPayments,
  patchShopProfile,
  postAccount,
  postActivateAccount,
  postFeedback,
} from './settingsRoutes';

// M8a CP1: the settings endpoints (your details, shop profile, payments, pause, feedback) and
// change password, each one scoped to the signed-in seller's own profile and shop.

const db = () => getDb();
const t = schema;

beforeEach(async () => {
  await truncateAll(db());
  testOutbox.clear();
});
afterAll(async () => {
  await truncateAll(db());
});

const TILL = { type: 'till', number: '123456', accountName: 'AMANI STYLES' };
const POCHI = { type: 'pochi', number: '0711000001', accountName: 'AMANI W' };
const patch = (s: Seller, h: Handler, body: unknown, id?: string) =>
  s.call(h, { method: 'PATCH', body, id });

describe('every settings endpoint', () => {
  it('needs a session (401) and never reaches another shop (404)', async () => {
    for (const handler of [getDetails, getShopProfile, getPayments, getFeedback]) {
      expect(await anonCall(handler)).toBe(401);
    }
    for (const handler of [patchDetails, patchShopProfile, patchPayments, patchPause]) {
      expect(await anonCall(handler, { method: 'PATCH' })).toBe(401);
    }
    expect(await anonCall(postFeedback, { method: 'POST' })).toBe(401);

    const a = await newSeller();
    const b = await newSeller();
    const bAccount = (await b.call(postAccount, { body: TILL })).json.accounts[0].id;
    await b.call(postAccount, { body: POCHI });
    const bSaved = (await b.call(getPayments)).json.accounts[1].id;
    expect((await a.call(postActivateAccount, { id: bSaved, method: 'POST' })).status).toBe(404);
    expect((await patch(a, patchAccount, TILL, bAccount)).status).toBe(404);
    expect((await a.call(deleteAccount, { id: bSaved, method: 'DELETE' })).status).toBe(404);
    expect((await b.call(getPayments)).json.accounts).toHaveLength(2);
  });
});

describe('your details', () => {
  it('shows the email read-only and saves names and the recovery phone', async () => {
    const s = await newSeller();
    const before = (await s.call(getDetails)).json;
    expect(before).toMatchObject({
      firstName: null,
      lastName: null,
      recoveryPhone: null,
      shopName: 'Amani Styles',
    });
    expect(before.email).toMatch(/@example\.test$/);

    const saved = await patch(s, patchDetails, {
      firstName: ' Amani ',
      lastName: 'Wairimu',
      recoveryPhone: '0712 345 678',
    });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({
      firstName: 'Amani',
      lastName: 'Wairimu',
      recoveryPhone: '+254712345678',
    });
    // An empty field removes the number.
    expect((await patch(s, patchDetails, { recoveryPhone: '' })).json.recoveryPhone).toBeNull();
  });

  it('refuses the email, server-owned fields and a bad phone (422)', async () => {
    const s = await newSeller();
    for (const body of [
      { email: 'other@example.test' },
      { isAdmin: true },
      { deletedAt: null },
      { recoveryPhone: '12345' },
    ]) {
      expect((await patch(s, patchDetails, body)).status, JSON.stringify(body)).toBe(422);
    }
    const profile = await db().query.profiles.findFirst({ where: eq(t.profiles.id, s.userId) });
    expect(profile?.isAdmin).toBe(false);
  });
});

describe('shop profile', () => {
  it('saves what buyers see, and the web shop shows it', async () => {
    const s = await newSeller();
    const res = await patch(s, patchShopProfile, {
      name: 'Amani Styles KE',
      about: 'Ankara and kitenge pieces made in Nairobi.',
      locationLabel: 'Kilimani, Nairobi',
      whatsappPhone: '0722 000 111',
      callsEnabled: true,
      tiktokHandle: '@amani.styles',
      instagramHandle: '',
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      name: 'Amani Styles KE',
      slug: s.slug,
      linkPrefix: 'localhost:3000/',
      locationLabel: 'Kilimani, Nairobi',
      whatsappPhone: '+254722000111',
      callsEnabled: true,
      tiktokHandle: 'amani.styles',
      instagramHandle: null,
    });
    const found = await publicRepo(db()).findShop(s.slug);
    expect(found.kind === 'shop' && found.shop).toMatchObject({
      name: 'Amani Styles KE',
      locationLabel: 'Kilimani, Nairobi',
    });
  });

  it('a new link keeps the old one working (redirect), and nobody else can take it', async () => {
    const s = await newSeller();
    const old = s.slug;
    const next = `${old}-ke`;
    const res = await patch(s, patchShopProfile, { slug: next });
    expect(res.json).toMatchObject({ slug: next, url: `http://localhost:3000/${next}` });
    expect(await publicRepo(db()).findShop(old)).toEqual({ kind: 'redirect', slug: next });

    const other = await newSeller();
    const taken = await patch(other, patchShopProfile, { slug: old });
    expect(taken.status).toBe(409);
    expect((await patch(other, patchShopProfile, { slug: next })).status).toBe(409);
    expect((await patch(other, patchShopProfile, { slug: 'admin' })).status).toBe(422);
  });

  it('limits link changes to 5 a day', async () => {
    const s = await newSeller();
    for (let i = 1; i <= 5; i++) {
      expect((await patch(s, patchShopProfile, { slug: `${s.slug}-${i}` })).status).toBe(200);
    }
    expect((await patch(s, patchShopProfile, { slug: `${s.slug}-6` })).status).toBe(429);
    // Saving the same link again isn't a change.
    expect((await patch(s, patchShopProfile, { slug: `${s.slug}-5`, about: 'x' })).status).toBe(
      200,
    );
  });

  it('a new logo is checked, the old one deleted; another shop’s key is refused', async () => {
    const s = await newSeller();
    const first = await storeJpeg(`logos/${s.shopId}/one.jpg`);
    const second = await storeJpeg(`logos/${s.shopId}/two.jpg`);
    expect((await patch(s, patchShopProfile, { logoPath: first })).json.logoUrl).toContain(first);
    expect((await patch(s, patchShopProfile, { logoPath: second })).status).toBe(200);
    const { localObjectExists } = await import('./storage');
    expect(await localObjectExists(first)).toBe(false);
    expect(await localObjectExists(second)).toBe(true);

    expect((await patch(s, patchShopProfile, { logoPath: `logos/${s.shopId}/x.jpg` })).status).toBe(
      422,
    );
    const other = await newSeller();
    expect((await patch(other, patchShopProfile, { logoPath: second })).status).toBe(403);
    expect((await patch(s, patchShopProfile, { logoPath: null })).json.logoUrl).toBeNull();
  });

  it('never takes server-owned or unknown fields', async () => {
    const s = await newSeller();
    for (const body of [
      { isPaused: true },
      { suspendedAt: null },
      { ownerId: randomUUID() },
      { acceptsPayBefore: false },
      { ratingAvg: 5 },
    ]) {
      expect((await patch(s, patchShopProfile, body)).status, JSON.stringify(body)).toBe(422);
    }
  });
});

describe('payments', () => {
  it('adds accounts (the first is active), switches the active one, removes a saved one', async () => {
    const s = await newSeller();
    expect((await s.call(getPayments)).json).toEqual({
      accounts: [],
      acceptsPayBefore: true,
      acceptsPayOnDelivery: false,
    });
    const first = await s.call(postAccount, { body: TILL });
    expect(first.status).toBe(201);
    expect(first.json.accounts).toEqual([
      expect.objectContaining({ type: 'till', number: '123456', isActive: true }),
    ]);
    expect(first.json.accounts[0]).not.toHaveProperty('verificationStatus');
    const second = (await s.call(postAccount, { body: POCHI })).json.accounts;
    expect(second.map((a: { isActive: boolean }) => a.isActive)).toEqual([true, false]);
    const pochi = second[1].id;

    const switched = await s.call(postActivateAccount, { id: pochi, method: 'POST' });
    expect(switched.json.accounts[0]).toMatchObject({ id: pochi, isActive: true });
    const found = await publicRepo(db()).findShop(s.slug);
    expect(found.kind === 'shop' && found.shop.payNowAvailable).toBe(true);

    const removeActive = await s.call(deleteAccount, { id: pochi, method: 'DELETE' });
    expect(removeActive.status).toBe(409);
    const till = switched.json.accounts[1].id;
    expect((await s.call(deleteAccount, { id: till, method: 'DELETE' })).json.accounts).toEqual([
      expect.objectContaining({ id: pochi }),
    ]);

    const edited = await patch(s, patchAccount, { ...POCHI, accountName: 'AMANI WAIRIMU' }, pochi);
    expect(edited.json.accounts[0]).toMatchObject({ accountName: 'AMANI WAIRIMU', isActive: true });
    expect((await s.call(postAccount, { body: { ...TILL, isActive: true } })).status).toBe(422);
  });

  it('"When buyers pay": at least one on, and pay before needs an account', async () => {
    const s = await newSeller();
    // A shop that entered a Till can turn pay on delivery on (carried forward from M6).
    await s.call(postAccount, { body: TILL });
    const both = await patch(s, patchPayments, { acceptsPayOnDelivery: true });
    expect(both.json).toMatchObject({ acceptsPayBefore: true, acceptsPayOnDelivery: true });
    const podOnly = await patch(s, patchPayments, { acceptsPayBefore: false });
    expect(podOnly.json).toMatchObject({ acceptsPayBefore: false, acceptsPayOnDelivery: true });

    const off = await patch(s, patchPayments, { acceptsPayOnDelivery: false });
    expect(off.status).toBe(409);
    expect(off.json.error.message).toMatch(/at least one way/);
    expect(
      (await patch(s, patchPayments, { acceptsPayBefore: false, acceptsPayOnDelivery: false }))
        .status,
    ).toBe(422);

    const noAccount = await newSeller();
    await patch(noAccount, patchPayments, { acceptsPayOnDelivery: true });
    const refused = await patch(noAccount, patchPayments, { acceptsPayOnDelivery: false });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe('no_payment_account');
  });
});

describe('pause', () => {
  it('pauses and resumes; a paused shop takes no orders', async () => {
    const s = await newSeller();
    expect((await patch(s, patchPause, { paused: true })).json).toEqual({ paused: true });
    const shop = await db().query.shops.findFirst({ where: eq(t.shops.id, s.shopId) });
    expect(shop?.isPaused).toBe(true);
    // The checkout refuses paused shops (checkout.test.ts, 'shop_paused').
    expect((await patch(s, patchPause, { paused: false })).json).toEqual({ paused: false });
    expect((await patch(s, patchPause, { paused: 'yes' })).status).toBe(422);
  });
});

describe('feedback', () => {
  const idea = { kind: 'idea', message: 'One payment reminder to all buyers who have not paid' };

  it('saves feedback with an optional screenshot, 5 a day per shop', async () => {
    const s = await newSeller();
    expect((await s.call(getFeedback)).json).toEqual({
      screenshots: true,
      whatsappPhone: '+254712345678',
    });
    const shot = await storeJpeg(`feedback/${s.shopId}/shot.jpg`);
    const sent = await s.call(postFeedback, {
      body: { ...idea, screenshotPath: shot, replyOnWhatsapp: true },
    });
    expect(sent.status).toBe(201);
    const [row] = await db().select().from(t.feedback).where(eq(t.feedback.shopId, s.shopId));
    expect(row).toMatchObject({
      kind: 'idea',
      screenshotPath: shot,
      replyOnWhatsapp: true,
      status: 'new',
      notifiedAt: null,
    });
    for (let i = 0; i < 4; i++)
      expect((await s.call(postFeedback, { body: idea })).status).toBe(201);
    expect((await s.call(postFeedback, { body: idea })).status).toBe(429);
  });

  it('refuses an empty message, a long one, another shop’s screenshot and extra fields', async () => {
    const s = await newSeller();
    const other = await newSeller();
    const theirs = await storeJpeg(`feedback/${other.shopId}/shot.jpg`);
    const product = await storeJpeg(`products/${s.shopId}/p.jpg`);
    expect((await s.call(postFeedback, { body: { ...idea, message: '  ' } })).status).toBe(422);
    expect(
      (await s.call(postFeedback, { body: { ...idea, message: 'x'.repeat(501) } })).status,
    ).toBe(422);
    expect((await s.call(postFeedback, { body: { ...idea, kind: 'rant' } })).status).toBe(422);
    expect((await s.call(postFeedback, { body: { ...idea, screenshotPath: theirs } })).status).toBe(
      403,
    );
    expect(
      (await s.call(postFeedback, { body: { ...idea, screenshotPath: product } })).status,
    ).toBe(403);
    for (const extra of [{ status: 'closed' }, { notifiedAt: null }, { shopId: other.shopId }]) {
      expect((await s.call(postFeedback, { body: { ...idea, ...extra } })).status).toBe(422);
    }
    expect(await db().select().from(t.feedback)).toEqual([]);
  });
});

describe('change password (Better Auth /change-password)', () => {
  async function change(token: string, body: Record<string, unknown>) {
    const res = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          origin: 'oda://',
          'x-real-ip': '10.0.0.9',
        },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const signIn = async (email: string, password: string) =>
    (
      await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'oda://',
            'x-real-ip': '10.0.0.9',
          },
          body: JSON.stringify({ email, password }),
        }),
      )
    ).status;

  async function seller() {
    const s = await newSeller();
    const email = (await s.call(getDetails)).json.email as string;
    const token = (await db().query.authSession.findFirst({
      where: eq(t.authSession.userId, s.userId),
    }))!.token;
    return { ...s, email, token };
  }

  it('refuses a wrong current password, a weak one and the same one', async () => {
    const s = await seller();
    const wrong = await change(s.token, {
      currentPassword: 'nope12345',
      newPassword: 'shanga2027',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.json.code).toBe('INVALID_PASSWORD');
    expect(
      (await change(s.token, { currentPassword: 'kitenge2026', newPassword: 'short' })).json.code,
    ).toBe('WEAK_PASSWORD');
    expect(
      (await change(s.token, { currentPassword: 'kitenge2026', newPassword: 'kitenge2026' })).json
        .code,
    ).toBe('SAME_PASSWORD');
    expect(await signIn(s.email, 'kitenge2026')).toBe(200);
    expect(testOutbox.last(s.email)).toBeUndefined();
  });

  it('changes it, signs other phones out when asked, and emails the seller', async () => {
    const s = await seller();
    expect(await signIn(s.email, 'kitenge2026')).toBe(200); // a second phone
    const res = await change(s.token, {
      currentPassword: 'kitenge2026',
      newPassword: 'shanga2027',
      revokeOtherSessions: true,
    });
    expect(res.status).toBe(200);
    expect(res.json.token).toEqual(expect.any(String));
    const sessions = await db()
      .select()
      .from(t.authSession)
      .where(eq(t.authSession.userId, s.userId));
    expect(sessions.map((x) => x.token)).toEqual([res.json.token]);
    expect(await signIn(s.email, 'kitenge2026')).toBe(401);
    expect(await signIn(s.email, 'shanga2027')).toBe(200);
    expect(testOutbox.last(s.email)).toMatchObject({
      kind: 'password-changed',
      subject: 'Your oda password was changed',
    });
  });

  it('limits tries per account: 10 an hour, wrong passwords included', async () => {
    const s = await seller();
    // Clock-aligned hourly window: stay clear of its edge.
    const left = 3600 - ((Date.now() / 1000) % 3600);
    if (left < 15) await new Promise((r) => setTimeout(r, (left + 1) * 1000));
    for (let i = 0; i < 10; i++) {
      const res = await change(s.token, {
        currentPassword: 'wrong-123',
        newPassword: 'shanga2027',
      });
      expect(res.status).toBe(400);
    }
    const blocked = await change(s.token, {
      currentPassword: 'kitenge2026',
      newPassword: 'shanga2027',
    });
    expect(blocked.status).toBe(429);
    expect(await signIn(s.email, 'kitenge2026')).toBe(200);
  });

  it('without a session: 401', async () => {
    const res = await change('not-a-token', { currentPassword: 'a', newPassword: 'shanga2027' });
    expect(res.status).toBe(401);
  });
});
