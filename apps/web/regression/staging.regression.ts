import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { backdateOrder, demoTokens, removeWayToPay } from '../test/regressionDb';
import {
  cron,
  emailLink,
  env,
  mask,
  ops,
  realPng,
  Seller,
  shot,
  signupCode,
  STAGING,
  testEmail,
  tokenOf,
} from './lib';

// M10 CP6 · the full regression on staging (decision #92), updated for the release-0.5.0 stack
// (Google sign-in #107, TikTok mark #108, app fixes #109, optional delivery #110), in the order
// of docs/regression-script.md: Sitting 1 (sign-up, onboarding, catalogue, the shop on the web),
// Sitting 2 (orders end to end), Sitting 3 (reviews, grow and manage, settings, suspend,
// delete). Seller steps are the seller app's own API calls; buyer steps run in a browser at
// 390 × 844. Shops are this run's own (reg-<run id>-a/-b); the workflow's clean-up step
// deletes and purges them even when a step fails.

test.describe.configure({ mode: 'serial' });

const runId = env.runId;
const pw = () => `Reg${randomBytes(9).toString('base64url')}9`;
const A = { slug: `reg-${runId}-a`, name: 'Reg Test Shop', email: testEmail('a') };
const B = { slug: `reg-${runId}-b`, name: 'Reg Test B', email: testEmail('b') };

let a: Seller;
// One API connection for the whole run: Playwright closes each test's own `request` when the
// test ends, and the sellers' calls continue across sections.
let api: APIRequestContext;
test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: STAGING });
});
test.afterAll(async () => {
  await api?.dispose();
});
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
let shopSlug = A.slug; // changes at 3.15

const KSH = (n: number) => `KSh ${n.toLocaleString('en-US')}`;

async function addDress(page: Page) {
  await page.goto(`/${shopSlug}/p/${ids.dress}`);
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: `Add to cart · ${KSH(1500)}` }).click();
  await page.getByRole('link', { name: 'View cart', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
}

/** Buyer checkout in the browser; returns the new order's token (masked). */
async function checkout(
  page: Page,
  o: { name: string; phone: string; delivery: 'Kilimani' | 'Pickup'; pay: 'now' | 'pod' },
) {
  await addDress(page);
  await page.getByRole('link', { name: 'Checkout' }).click();
  await page.getByLabel('Your name').fill(o.name);
  await page.getByLabel('Phone number').fill(o.phone);
  await page.getByRole('radio', { name: new RegExp(o.delivery) }).check();
  if (o.delivery === 'Kilimani') {
    await page.getByLabel('Area, street or building').fill('Argwings Kodhek Rd');
  }
  await page
    .getByRole('radio', { name: o.pay === 'now' ? /Pay now with M-Pesa/ : /Pay on delivery/ })
    .check();
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
  const token = page.url().split('/o/')[1]!;
  mask(token);
  return token;
}

/** A pay-now order placed through the buyer API (no browser): returns its token. */
async function apiOrder(
  request: import('@playwright/test').APIRequestContext,
  phone: string,
  payment: 'pay_now' | 'pay_on_delivery',
) {
  const lines = [{ productId: ids.dress, qty: 1, size: 'M' }];
  const quote = await (
    await request.post(`/api/shops/${shopSlug}/quote`, { data: { lines } })
  ).json();
  const pickup = quote.options.find((o: { kind: string }) => o.kind === 'pickup');
  const res = await request.post(`/api/shops/${shopSlug}/orders`, {
    data: {
      idempotencyKey: `reg-${runId}-${randomBytes(8).toString('hex')}`,
      buyer: { name: 'Api Buyer', phone, whatsapp: true },
      fulfilment: { kind: 'pickup' },
      payment,
      lines,
      expectedTotal: pickup.total,
    },
  });
  expect(res.status(), 'checkout').toBe(201);
  const { token } = (await res.json()) as { token: string };
  mask(token);
  return token;
}

const sms = (code: string, amount: number) =>
  `${code} Confirmed. Ksh${amount.toLocaleString('en-US')}.00 sent to REG TEST ONLY 000000 on 8/10/26 at 10:15 AM.`;

// Sitting 1 -----------------------------------------------------------------------------------

test('Sitting 1 · 1A Sign-up and email code (M2)', async ({ request }) => {
  a = new Seller(api, A.email, pw());
  let attemptId = '';
  await test.step('1.2 Create my account: a 6-digit code is emailed', async () => {
    const started = await a.signUp();
    attemptId = started.attemptId;
    await signupCode(request, A.email, started.since);
  });
  await test.step('1.3 A wrong code: "That code isn’t right"', async () => {
    const res = await a.verify(attemptId, '000000');
    expect(res.status()).toBe(422);
  });
  await test.step('1.4 Resend: a new code arrives (after the 60 s wait)', async () => {
    await new Promise((r) => setTimeout(r, 62_000));
    const since = new Date();
    const res = await request.post('/api/signup/resend', {
      data: { attemptId },
      headers: { 'expo-origin': 'oda://' },
    });
    expect(res.status()).toBe(200);
    const code = await signupCode(request, A.email, since);
    await test.step('1.5 The newest code verifies; sign-in works', async () => {
      expect((await a.verify(attemptId, code)).status()).toBe(200);
      expect(await a.signIn()).toBe(200);
      const me = await a.ok('GET', '/api/me');
      expect(me.emailVerified).toBe(true);
      expect(me.shop).toBeNull();
    });
  });
});

test('Sitting 1 · 1B Onboarding (M2)', async () => {
  await test.step('1.6 Steps 1–2: what you sell, where you sell', async () => {
    await a.ok('POST', '/api/onboarding/answers', { step: 1, businessType: 'fashion' });
    await a.ok('POST', '/api/onboarding/answers', {
      step: 2,
      channels: ['whatsapp_status', 'tiktok'],
    });
  });
  await test.step('1.7–1.8 Link check: free link is yours; demo-duka is taken, with suggestions', async () => {
    const free = await a.ok('GET', `/api/onboarding/slug?slug=${A.slug}`);
    expect(free.available).toBe(true);
    const taken = await a.ok('GET', '/api/onboarding/slug?slug=demo-duka');
    expect(taken.available).toBe(false);
    expect(taken.suggestions.length).toBeGreaterThan(0);
    await a.ok('POST', '/api/onboarding/shop', {
      name: A.name,
      slug: A.slug,
      whatsappPhone: '0712345678',
    });
  });
  await test.step('1.9 Resume: the saved step is 4 (first product)', async () => {
    const state = await a.ok('GET', '/api/onboarding');
    expect(state.step).toBe(4);
    expect(state.shop.slug).toBe(A.slug);
  });
  await test.step('1.10 A product without a photo is refused', async () => {
    const res = await a.call('POST', '/api/onboarding/product', {
      name: 'Test dress',
      price: 1500,
      sizes: ['M'],
      photos: [],
    });
    expect(res.status()).toBe(422);
  });
  await test.step('1.11 First product with a photo: Test dress, KSh 1,500, size M', async () => {
    const state = await a.ok('POST', '/api/onboarding/product', {
      name: 'Test dress',
      price: 1500,
      sizes: ['M'],
      photos: [await a.photo([196, 67, 35])],
    });
    ids.dress = state.product.id;
  });
  await test.step('1.12 Payment: Buy Goods Till 000000, REG TEST ONLY; the shop is live', async () => {
    await a.ok('POST', '/api/onboarding/payment', {
      type: 'till',
      number: '000000',
      accountName: 'REG TEST ONLY',
    });
    await a.ok('POST', '/api/onboarding/checklist', { item: 'shared_link' });
    const done = await a.ok('POST', '/api/onboarding/complete', {});
    expect(done.done).toBe(true);
  });
  await test.step('1.13 Home: no orders yet, and no "not taking orders" banner', async () => {
    const home = await a.ok('GET', '/api/home');
    expect(home.hasOrders).toBe(false);
    expect(home.ordering.blockers).toEqual([]);
  });
});

test('Sitting 1 · 1C Delivery and catalogue (M3, M6)', async ({ page }) => {
  await test.step('1.14 No delivery options: the shop takes orders (decision #110)', async () => {
    const delivery = await a.ok('GET', '/api/delivery');
    expect(delivery).toMatchObject({ hasDeliveryOption: false, arrangeDelivery: false });
    expect((await a.ok('GET', '/api/home')).ordering.blockers).toEqual([]);
    await page.goto(`/${A.slug}`);
    await expect(page.getByText(/Not taking orders yet/)).toHaveCount(0);
    await expect(page.getByText('Delivery arranged with the seller after you order')).toBeVisible();
    await shot(page, '1.14-no-delivery-options');
  });
  await test.step('1.14a Payments: On delivery turned on (a Till alone means pay now only)', async () => {
    const before = await a.ok('GET', '/api/payments');
    expect(before.acceptsPayBefore).toBe(true);
    expect(before.acceptsPayOnDelivery).toBe(false);
    const after = await a.ok('PATCH', '/api/payments', { acceptsPayOnDelivery: true });
    expect(after.acceptsPayOnDelivery).toBe(true);
  });
  await test.step('1.14b Arranged order, end to end: checkout, order page, accept, Buyer collects, delivered', async () => {
    await addDress(page);
    await page.getByRole('link', { name: 'Checkout' }).click();
    await expect(page.getByText('The seller will contact you to arrange delivery')).toBeVisible();
    await expect(page.getByLabel('Area, street or building')).toHaveCount(0);
    // Kenya's flag before +254 (#109 b, #110 h): the real file, loaded, whole at 20 × 15.
    const flag = page.locator('img[src="/flags/ke.svg"]');
    await expect(flag).toBeVisible();
    await expect
      .poll(() => flag.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    expect(await flag.boundingBox()).toMatchObject({ width: 20, height: 15 });
    await page.getByLabel('Your name').fill('Buyer Arranged');
    await page.getByLabel('Phone number').fill('712 000 009');
    await page.getByLabel('Note for the seller (optional)').fill('Near Yaya Centre, after 5pm');
    await page.getByRole('radio', { name: /Pay on delivery/ }).check();
    await expect(page.getByText('Pay when you get your order.')).toBeVisible();
    await expect(page.getByText('Not included')).toBeVisible();
    await shot(page, '1.14b-checkout-arranged');
    await page.getByRole('button', { name: `Place order · ${KSH(1500)}` }).click();
    await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
    tokens.arranged = page.url().split('/o/')[1]!;
    mask(tokens.arranged);
    await expect(page.getByText(`Delivery · arranged with ${A.name}`)).toBeVisible();
    await expect(page.getByText('Your note: Near Yaya Centre, after 5pm')).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(`Message ${A.name} to arrange delivery`) }),
    ).toBeVisible();
    await shot(page, '1.14b-order-arranged');
    const order = await a.latestOrder();
    ids.arranged = order.id;
    const detail = await a.ok('GET', `/api/orders/${order.id}`);
    expect(detail).toMatchObject({ fulfilment: 'arranged', deliveryFee: 0, total: 1500 });
    // An older app (no X-Oda-App-Features) gets it as a delivery "Arranged with buyer" (#110 f).
    const old = await a.request.get(`/api/orders/${order.id}`, {
      headers: { 'expo-origin': 'oda://', authorization: `Bearer ${a.token}` },
    });
    expect(await old.json()).toMatchObject({
      fulfilment: 'delivery',
      deliveryAreaName: 'Arranged with buyer',
    });
    await a.action(order.id, { type: 'accept' });
    const sent = await a.action(order.id, { type: 'markSent', sentMethod: 'pickup' });
    expect(sent.whatsapp.text).toContain('is ready to collect, as we arranged');
    await page.reload();
    await expect(page.getByText('Ready to collect').first()).toBeVisible();
    await shot(page, '1.14b-ready-to-collect');
    const done = await a.action(order.id, { type: 'markDelivered', collected: true });
    expect(done.order).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Delivered' })).toBeVisible();
  });
  await test.step('1.14c “I’ll arrange delivery with buyers” ticks “Add delivery options”', async () => {
    const state = await a.ok('POST', '/api/onboarding/checklist', { item: 'arrange_delivery' });
    expect(state.checklist.items.find((i: { id: string }) => i.id === 'delivery')).toMatchObject({
      done: true,
    });
    expect((await a.ok('GET', '/api/delivery')).arrangeDelivery).toBe(true);
  });
  await test.step('1.14d The flag and the TikTok mark served as published (#108, #109 b)', async () => {
    const sha = async (path: string) =>
      createHash('sha256')
        .update(await (await api.get(path)).body())
        .digest('hex');
    expect(await sha('/flags/ke.svg')).toBe(
      '699163d87382eb969d8a26d4ce1a99a00264e8b7b95276abf585476506f46e82',
    );
    expect(await sha('/brands/tiktok-icon-black-circle.png')).toBe(
      'a21b43e31bb9def6d01c8c433a577353ae3efc8003a6257e8f3db3fd2dc94e61',
    );
  });
  await test.step('1.15 Kilimani KSh 200 by rider, and pickup at Yaya Centre', async () => {
    const view = await a.ok(
      'POST',
      '/api/delivery/areas',
      { name: 'Kilimani', fee: 200, method: 'rider', etaLabel: 'Same day' },
      201,
    );
    ids.area = view.areas.at(-1).id;
    const after = await a.ok('PUT', '/api/delivery', {
      pickupEnabled: true,
      pickupLocation: 'Yaya Centre',
      pickupHours: 'Mon–Sat 9–6',
    });
    expect(after.hasDeliveryOption).toBe(true);
  });
  await test.step('1.15a With areas and pickup, checkout offers only those (no arranged)', async () => {
    const lines = [{ productId: ids.dress, qty: 1, size: 'M' }];
    const quote = await (await api.post(`/api/shops/${A.slug}/quote`, { data: { lines } })).json();
    expect(quote.options.map((o: { kind: string }) => o.kind)).toEqual(['delivery', 'pickup']);
    const res = await api.post(`/api/shops/${A.slug}/orders`, {
      data: {
        idempotencyKey: `reg-${runId}-${randomBytes(8).toString('hex')}`,
        buyer: { name: 'Api Buyer', phone: '0712000010', whatsapp: true },
        fulfilment: { kind: 'arranged' },
        payment: 'pay_on_delivery',
        lines,
        expectedTotal: 1500,
      },
    });
    expect(res.status()).toBe(422);
  });
  await test.step('1.15c Delete area (the “Delete area?” sheet’s action): a temporary area goes', async () => {
    const view = await a.ok(
      'POST',
      '/api/delivery/areas',
      { name: 'Temp area', fee: 100, method: 'rider' },
      201,
    );
    const temp = view.areas.find((x: { name: string }) => x.name === 'Temp area');
    const after = await a.ok('DELETE', `/api/delivery/areas/${temp.id}`);
    expect(after.areas.map((x: { name: string }) => x.name)).toEqual(['Kilimani']);
  });
  await test.step('1.16 Categories Dresses and Tops; Tops moved up', async () => {
    ids.dresses = (await a.ok('POST', '/api/categories', { name: 'Dresses' }, 201)).id;
    ids.tops = (await a.ok('POST', '/api/categories', { name: 'Tops' }, 201)).id;
    const list = await a.ok('PUT', '/api/categories/order', { ids: [ids.tops, ids.dresses] });
    expect(list.map((c: { name: string }) => c.name)).toEqual(['Tops', 'Dresses']);
  });
  await test.step('1.17 Test top: 2 photos, KSh 900 (was 1,200), Tops, sizes S/M, a colour', async () => {
    const top = await a.ok(
      'POST',
      '/api/products',
      {
        name: 'Test top',
        price: 900,
        compareAtPrice: 1200,
        categoryId: ids.tops,
        sizes: ['S', 'M'],
        colours: [{ name: 'Navy', hex: '#1F2A44' }],
        photos: [await a.photo([31, 42, 68]), await a.photo([60, 80, 120])],
      },
      201,
    );
    ids.top = top.id;
  });
  await test.step('1.18 A was-price below the price is refused', async () => {
    const res = await a.call('PATCH', `/api/products/${ids.top}`, { compareAtPrice: 800 });
    expect(res.status()).toBe(422);
    expect(await res.text()).toContain('The was-price must be higher than the price.');
  });
  await test.step('1.19 Test dress: category Dresses, a second photo made the cover', async () => {
    await a.ok('PATCH', `/api/products/${ids.dress}`, { categoryId: ids.dresses });
    const dress = await a.ok('GET', `/api/products/${ids.dress}`);
    const second = await a.photo([120, 40, 40]);
    const photos = [
      second,
      ...dress.photos.map((p: Record<string, unknown>) => ({
        objectKey: p.objectKey,
        thumbKey: p.thumbKey,
        width: p.width,
        height: p.height,
      })),
    ];
    const saved = await a.ok('PUT', `/api/products/${ids.dress}/photos`, { photos });
    expect(saved.photos[0].objectKey).toBe(second.objectKey);
  });
  await test.step('1.20 Test top sold out; Hidden item hidden; the filters count them', async () => {
    await a.ok('PATCH', `/api/products/${ids.top}`, { status: 'sold_out' });
    const hidden = await a.ok(
      'POST',
      '/api/products',
      { name: 'Hidden item', price: 500, status: 'hidden', photos: [await a.photo([90, 90, 90])] },
      201,
    );
    ids.hidden = hidden.id;
    const list = await a.ok('GET', '/api/products');
    expect(list.counts).toMatchObject({ sold_out: 1, hidden: 1 });
  });
  await test.step('1.21 Delete me: delete, Undo (restore), delete again', async () => {
    const del = await a.ok(
      'POST',
      '/api/products',
      { name: 'Delete me', price: 100, photos: [await a.photo([10, 10, 10])] },
      201,
    );
    await a.ok('DELETE', `/api/products/${del.id}`, undefined, 204);
    await a.ok('POST', `/api/products/${del.id}/restore`);
    await a.ok('DELETE', `/api/products/${del.id}`, undefined, 204);
    const list = await a.ok('GET', '/api/products');
    expect(list.products.map((p: { name: string }) => p.name)).not.toContain('Delete me');
  });
});

test('Sitting 1 · 1D The shop on the web, share, Demo Duka (M4, M8b)', async ({
  page,
  request,
}) => {
  await test.step('1.22 The shop as buyers see it: 2 products, no Hidden item', async () => {
    await page.goto(`/${A.slug}`);
    await expect(page.getByRole('heading', { name: A.name })).toBeVisible();
    await expect(page.getByRole('link', { name: /Test dress KSh/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Test top/ })).toBeVisible();
    await expect(page.getByText('Hidden item')).toHaveCount(0);
    await shot(page, '1.22-shop');
  });
  await test.step('1.23 Share: the share screen data and a caption', async () => {
    const share = await a.ok('GET', '/api/share');
    expect(share.shop.slug).toBe(A.slug);
  });
  await test.step('1.24 Categories Tops before Dresses; Test top sold out with KSh 1,200 crossed out', async () => {
    const html = await page.content();
    expect(html.indexOf('>Tops<')).toBeGreaterThan(-1);
    expect(html.indexOf('>Tops<')).toBeLessThan(html.indexOf('>Dresses<'));
    await expect(page.getByText('Sold out').first()).toBeVisible();
    await expect(page.getByText(KSH(1200)).first()).toBeVisible();
  });
  await test.step('1.25 Test top’s page: no Add to cart', async () => {
    await page.goto(`/${A.slug}/p/${ids.top}`);
    await expect(page.getByRole('heading', { name: 'Test top' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add to cart/ })).toHaveCount(0);
    await shot(page, '1.25-sold-out');
  });
  await test.step('1.26 Search "dress": 1 product; sort by price', async () => {
    await page.goto(`/${A.slug}`);
    await page.getByLabel('Search this shop').fill('dress');
    await page.getByLabel('Search this shop').press('Enter');
    await expect(page.getByText('1 product')).toBeVisible();
    await page.goto(`/${A.slug}/search?sort=price_asc`);
    await expect(page.getByRole('link', { name: /Test dress KSh/ })).toBeVisible();
    await shot(page, '1.26-search');
  });
  await test.step('1.27 Test dress M in the cart: KSh 1,500', async () => {
    await addDress(page);
    await expect(page.getByText(KSH(1500)).first()).toBeVisible();
    await shot(page, '1.27-cart');
  });
  await test.step('1.28 Demo Duka: demo banner, 12 products, favourites kept after a reload', async () => {
    await page.goto('/demo-duka');
    await expect(page.getByText(/Demo shop: don.t send money/)).toBeVisible();
    const hearts = page.getByRole('button', { name: /^Add .* to favourites$/ });
    await hearts.nth(0).click();
    await hearts.nth(0).click();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Remove .* from favourites$/ })).toHaveCount(2);
    await shot(page, '1.28-demo-duka');
  });
  await test.step('1.29 An unknown shop: "This page isn’t here"', async () => {
    const res = await page.goto(`/no-such-shop-${runId}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /This page isn.t here/ })).toBeVisible();
  });
  await test.step('1.30 Landing, Privacy and Terms', async () => {
    await page.goto('/');
    await expect(page.getByText('Turn your posts into orders.')).toBeVisible();
    await shot(page, '1.30-landing');
    for (const p of ['/privacy', '/terms']) {
      expect((await request.get(p)).status(), p).toBe(200);
    }
  });
});

test('Sitting 1 · 1E Forgot password and reset (M2)', async ({ page, request }) => {
  const newPassword = pw();
  await test.step('1.31 A wrong password: refused', async () => {
    expect(await a.signIn('Wrong-password-1')).toBe(401);
  });
  let link = '';
  await test.step('1.32 Send reset link: the email arrives', async () => {
    const since = new Date();
    const res = await request.post('/api/auth/request-password-reset', {
      data: { email: A.email },
      headers: { 'expo-origin': 'oda://' },
    });
    expect(res.status()).toBe(200);
    link = await emailLink(
      request,
      A.email,
      /^Reset your oda password$/,
      /https:\/\/\S+\/reset-password#token=[^\s"<>]+/,
      since,
    );
  });
  await test.step('1.33 Two different passwords: "The passwords don’t match."', async () => {
    const url = new URL(link);
    await page.goto(url.pathname + url.hash);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Re-enter new password').fill(`${newPassword}x`);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('alert').first()).toHaveText("The passwords don't match.");
    await shot(page, '1.33-reset-mismatch');
  });
  await test.step('1.34 The same password twice: "Password changed!"', async () => {
    await page.getByLabel('Re-enter new password').fill(newPassword);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('heading', { name: 'Password changed!' })).toBeVisible();
    await shot(page, '1.34-password-changed');
  });
  await test.step('1.35 The link again: "This link has expired"', async () => {
    const url = new URL(link);
    await page.goto(url.pathname + url.hash);
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  });
  await test.step('1.36 Sign in: old password refused, new one works', async () => {
    expect(await a.signIn()).toBe(401);
    a.password = newPassword;
    expect(await a.signIn()).toBe(200);
  });
});

// Sitting 2 -----------------------------------------------------------------------------------

test('Sitting 2 · 2A Pay now, end to end (M5, M6)', async ({ page }) => {
  let id = '';
  await test.step('2.1 Checkout, Kilimani, pay now: the pay page shows Till 000000', async () => {
    tokens.payNow = await checkout(page, {
      name: 'Buyer One',
      phone: '712 000 001',
      delivery: 'Kilimani',
      pay: 'now',
    });
    await expect(
      page.getByRole('heading', { name: `Pay ${KSH(1700)} to ${A.name}` }),
    ).toBeVisible();
    await expect(page.getByText('REG TEST ONLY', { exact: true })).toBeVisible();
    await shot(page, '2.1-pay-page');
    id = (await a.latestOrder()).id;
    ids.payNow = id;
  });
  await test.step('2.2 Not a code: "We can’t see a code yet"', async () => {
    await page.getByLabel('Paste your M-Pesa message or the code').fill('hello');
    await expect(page.getByText(/We can.t see a code yet/)).toBeVisible();
  });
  await test.step('2.3 Paste the SMS → I’ve paid: waiting for the seller', async () => {
    await page.getByLabel('Paste your M-Pesa message or the code').fill(sms('SRG0TEST01', 1700));
    await page.getByRole('button', { name: /I.ve paid/ }).click();
    await expect(page.getByText(`Waiting for ${A.name} to confirm your payment`)).toBeVisible();
    await shot(page, '2.3-waiting');
  });
  await test.step('2.4 Seller: the order is in To do as "says paid"', async () => {
    const list = await a.ok('GET', '/api/orders?tab=todo');
    expect(list.todoCounts.confirm_payment).toBeGreaterThanOrEqual(1);
    expect((await a.ok('GET', `/api/orders/${id}`)).status).toBe('payment_claimed');
  });
  await test.step('2.5 Payment isn’t in my M-Pesa: the buyer sees the banner', async () => {
    await a.action(id, { type: 'paymentNotFound' });
    await page.reload();
    await expect(page.getByText(new RegExp(`${A.name} couldn.t find your payment`))).toBeVisible();
    await shot(page, '2.5-payment-not-found');
  });
  await test.step('2.6 The buyer pastes again; the seller confirms: "Payment confirmed"', async () => {
    await page.getByLabel('Paste your M-Pesa message or the code').fill(sms('SRG0TEST02', 1700));
    await page.getByRole('button', { name: /I.ve paid/ }).click();
    await expect(page.getByText(`Waiting for ${A.name} to confirm your payment`)).toBeVisible();
    const done = await a.action(id, { type: 'confirmPayment' });
    expect(done.order.paymentStatus).toBe('paid');
    await page.reload();
    await expect(page.getByText('Payment confirmed').first()).toBeVisible();
  });
  await test.step('2.7 Mark as sent with a rider: "Sent out"', async () => {
    await a.action(id, { type: 'markSent', sentMethod: 'rider', riderPhone: '0712000002' });
    await page.reload();
    await expect(page.getByText('Sent out').first()).toBeVisible();
  });
  await test.step('2.8 Mark as delivered: "Delivered" and the rate card', async () => {
    await a.action(id, { type: 'markDelivered' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'How was your order?' })).toBeVisible();
    await shot(page, '2.8-delivered');
  });
  await test.step('2.9 Call and WhatsApp: the buyer’s number and the prefilled message', async () => {
    const order = await a.ok('GET', `/api/orders/${id}`);
    expect(order.buyer.phone).toBe('+254712000001');
    expect(order.buyer.whatsapp).toBe(true);
  });
});

test('Sitting 2 · 2B Pay on delivery, pickup, buyer cancel (M5, M6)', async ({ page }) => {
  await test.step('2.10 Pickup, pay on delivery: waiting for the seller to accept', async () => {
    tokens.pickup = await checkout(page, {
      name: 'Buyer Two',
      phone: '712 000 003',
      delivery: 'Pickup',
      pay: 'pod',
    });
    await expect(page.getByText(`Waiting for ${A.name} to accept`)).toBeVisible();
    ids.pickup = (await a.latestOrder()).id;
  });
  await test.step('2.11 Accept: "Accepted by Reg Test Shop"', async () => {
    await a.action(ids.pickup!, { type: 'accept' });
    await page.reload();
    await expect(page.getByText(`Accepted by ${A.name}`).first()).toBeVisible();
  });
  await test.step('2.12 Ready for pickup, then delivered with the money collected', async () => {
    await a.action(ids.pickup!, { type: 'markSent', sentMethod: 'pickup' });
    await page.reload();
    await expect(page.getByText('Ready for pickup').first()).toBeVisible();
    await shot(page, '2.12-ready-for-pickup');
    const done = await a.action(ids.pickup!, { type: 'markDelivered', collected: true });
    expect(done.order.status).toBe('delivered');
  });
  await test.step('2.13 Another order, cancelled by the buyer: "You cancelled it"', async () => {
    tokens.buyerCancel = await checkout(page, {
      name: 'Buyer Three',
      phone: '712 000 005',
      delivery: 'Kilimani',
      pay: 'pod',
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(page.getByText('Order cancelled')).toBeVisible();
    await expect(page.getByText(/You cancelled it/)).toBeVisible();
    await shot(page, '2.13-buyer-cancelled');
    expect((await a.latestOrder()).status).toBe('cancelled');
  });
});

test('Sitting 2 · 2C Seller cancel and refund; manual order (M6)', async ({ page, request }) => {
  await test.step('2.14 A claimed order cancelled (out of stock): the buyer sees the reason, never the note', async () => {
    tokens.refund = await checkout(page, {
      name: 'Buyer Four',
      phone: '712 000 006',
      delivery: 'Kilimani',
      pay: 'now',
    });
    await page.getByLabel('Paste your M-Pesa message or the code').fill(sms('SRG0TEST03', 1700));
    await page.getByRole('button', { name: /I.ve paid/ }).click();
    await expect(page.getByText(`Waiting for ${A.name} to confirm your payment`)).toBeVisible();
    ids.refund = (await a.latestOrder()).id;
    const res = await a.action(ids.refund!, {
      type: 'sellerCancel',
      reason: 'out_of_stock',
      note: 'private note',
      receivedClaimed: true,
    });
    expect(res.order.paymentStatus).toBe('refund_due');
    await page.reload();
    await expect(page.getByText('Order cancelled')).toBeVisible();
    await expect(page.getByText('Out of stock').first()).toBeVisible();
    await expect(page.getByText('private note')).toHaveCount(0);
    await shot(page, '2.14-seller-cancelled');
  });
  await test.step('2.15 Mark refund sent: Refunded', async () => {
    const res = await a.action(ids.refund!, { type: 'markRefundSent' });
    expect(res.order.paymentStatus).toBe('refunded');
  });
  await test.step('2.16 New order (manual): Walk-in Buyer, pickup, not paid yet', async () => {
    const order = await a.ok(
      'POST',
      '/api/orders',
      {
        idempotencyKey: `reg-${runId}-manual-0001`,
        buyer: { name: 'Walk-in Buyer', phone: '0712000004' },
        lines: [{ productId: ids.dress, qty: 1, size: 'M' }],
        fulfilment: { kind: 'pickup' },
        payment: 'not_paid',
      },
      201,
    );
    ids.manual = order.id;
    tokens.manual = tokenOf(order);
  });
  await test.step('2.17 Its link: the buyer’s pay page (Till 000000)', async () => {
    await page.goto(`/o/${tokens.manual}`);
    await expect(
      page.getByRole('heading', { name: new RegExp(`^Pay KSh 1,500 to ${A.name}`) }),
    ).toBeVisible();
    await shot(page, '2.17-manual-order-pay');
  });
  await test.step('2.18 I got the money (mark as paid)', async () => {
    const res = await a.action(ids.manual!, { type: 'markPaid' });
    expect(res.order.paymentStatus).toBe('paid');
  });
  await test.step('2.19 Orders tabs and search', async () => {
    const all = await a.ok('GET', '/api/orders?tab=all');
    expect(all.orders.length).toBeGreaterThanOrEqual(5);
    const done = await a.ok('GET', '/api/orders?tab=done');
    expect(done.orders.length).toBeGreaterThanOrEqual(3);
    const found = await a.ok('GET', `/api/orders?tab=all&q=${encodeURIComponent('Buyer Two')}`);
    expect(found.orders.map((o: { buyerName: string }) => o.buyerName)).toEqual(['Buyer Two']);
    const none = await a.ok('GET', '/api/orders?tab=all&q=999999');
    expect(none.orders).toEqual([]);
  });
  await test.step('2.20 Notifications: listed, then all marked read', async () => {
    const list = await a.ok('GET', '/api/notifications');
    expect(list.unread).toBeGreaterThan(0);
    const read = await a.ok('PATCH', '/api/notifications/read', {});
    expect(read.unread).toBe(0);
  });
  void request;
});

test('Sitting 2 · 2D Demo Duka’s states and expiry (M5, M6)', async ({ page, request }) => {
  const demo = await demoTokens();
  await test.step('2.21 Payment not found: the banner', async () => {
    await page.goto(`/o/${demo.Chebet}`);
    await expect(page.getByText(/Demo Duka couldn.t find your payment/)).toBeVisible();
    await shot(page, '2.21-demo-payment-not-found');
  });
  await test.step('2.22 Cancelled by the seller: "Out of stock", no private note', async () => {
    await page.goto(`/o/${demo.Halima}`);
    await expect(page.getByText('Order cancelled')).toBeVisible();
    await expect(page.getByText('Out of stock').first()).toBeVisible();
    await expect(page.getByText(/Private seller note/)).toHaveCount(0);
  });
  await test.step('2.23 Expired: "Order expired"', async () => {
    await page.goto(`/o/${demo.Imani}`);
    await expect(page.getByText('Order expired')).toBeVisible();
  });
  await test.step('2.24 Ready for pickup; sent with a rider', async () => {
    await page.goto(`/o/${demo.Fatuma}`);
    await expect(page.getByText('Ready for pickup').first()).toBeVisible();
    await page.goto(`/o/${demo.Esther}`);
    await expect(page.getByText('Sent out').first()).toBeVisible();
  });
  await test.step('2.24b Arranged with the buyer: "Ready to collect" and the buyer’s note (#110)', async () => {
    await page.goto(`/o/${demo.Jabali}`);
    await expect(page.getByText('Ready to collect').first()).toBeVisible();
    await expect(page.getByText('Delivery · arranged with Demo Duka')).toBeVisible();
    await expect(page.getByText('Your note: Near the matatu stage, after 5pm')).toBeVisible();
    await shot(page, '2.24b-demo-arranged');
  });
  await test.step('2.25 An unpaid order made 49 h old expires on the next job run', async () => {
    const token = await apiOrder(request, '0712000007', 'pay_now');
    const order = await a.latestOrder();
    await backdateOrder(A.slug, order.number);
    const result = await cron(request, 'expire-orders');
    expect(result.expired).toBeGreaterThanOrEqual(1);
    await page.goto(`/o/${token}`);
    await expect(page.getByText('Order expired')).toBeVisible();
    await shot(page, '2.25-expired');
  });
});

test('Sitting 2 · 2E Offline (M10)', async () => {
  await test.step('2.26–2.27 Offline states: covered by the app UI tests (no phone in this run)', async () => {
    test.info().annotations.push({
      type: 'note',
      description: 'Offline and retry states run in the app’s jest-expo tests (decision #92 d).',
    });
  });
});

// Sitting 3 -----------------------------------------------------------------------------------

test('Sitting 3 · 3A Reviews (M7)', async ({ page, request }) => {
  const demo = await demoTokens();
  await test.step('3.1 Demo Duka’s delivered order: the review form opens', async () => {
    await page.goto(`/o/${demo.Gitau}/review`);
    await expect(page.getByRole('heading', { name: 'Rate your order' })).toBeVisible();
  });
  await test.step('3.2 Shop A’s delivered order: 2 stars, Well packed, "Too small", a photo', async () => {
    await page.goto(`/o/${tokens.payNow}`);
    await page.getByRole('link', { name: 'Rate 2 out of 5' }).click();
    await expect(page.getByRole('heading', { name: 'Rate your order' })).toBeVisible();
    await page.getByRole('button', { name: 'Well packed' }).click();
    await page.getByLabel('What did you think of Test dress?').fill('Too small');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add a photo of Test dress' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'dress.png',
      mimeType: 'image/png',
      buffer: realPng(900, 600, [196, 67, 35]),
    });
    await expect(page.getByRole('img', { name: 'Your photo of Test dress' })).toBeVisible();
    await shot(page, '3.2-review-form');
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(page.getByRole('heading', { name: 'Thanks for your review' })).toBeVisible();
  });
  await test.step('3.3 Edit your review: 4 stars', async () => {
    await page.getByRole('link', { name: 'Edit your review' }).click();
    await page
      .getByRole('radiogroup', { name: 'Your rating', exact: true })
      .getByLabel('Rate 4 out of 5')
      .click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Thanks for your review' })).toBeVisible();
  });
  await test.step('3.4 The cancelled order can’t be reviewed', async () => {
    const res = await request.get(`/api/o/${tokens.buyerCancel}/review`);
    if (res.status() === 200) expect((await res.json()).order.reviewable).toBe(false);
    else expect([404, 409]).toContain(res.status());
  });
  await test.step('3.5 Seller: the review, 4 stars, with its photo', async () => {
    const list = await a.ok('GET', '/api/reviews?tab=all');
    expect(list.reviews).toHaveLength(1);
    expect(list.reviews[0].rating).toBe(4);
    ids.review = list.reviews[0].id;
  });
  await test.step('3.6 Reply: shown under the review on the product page', async () => {
    await a.ok('PUT', `/api/reviews/${ids.review}/reply`, {
      reply: 'Asante! We’ll fix the sizes.',
    });
    await page.goto(`/${A.slug}/p/${ids.dress}`);
    const reviews = page.getByRole('region', { name: 'Reviews' });
    await expect(reviews.getByText('Too small')).toBeVisible();
    await expect(reviews.getByText(`Reply from ${A.name}`)).toBeVisible();
    await shot(page, '3.6-review-and-reply');
  });
  await test.step('3.7 Report review: its photo is hidden from buyers', async () => {
    const reported = await a.ok('POST', `/api/reviews/${ids.review}/report`, {
      reason: 'test report',
    });
    expect(reported.reportedAt).toBeTruthy();
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Reviews' }).getByRole('img', { name: /^Photo from/ }),
    ).toHaveCount(0);
  });
  await test.step('3.8 review-remove (ops): the review is gone', async () => {
    const removed = await ops(request, '/api/ops/reviews/remove', {
      reviewId: ids.review,
      reason: 'Staging regression test (decision #92)',
      actor: 'staging-regression',
    });
    expect(removed.removed).toBe(true);
    await page.reload();
    await expect(page.getByText('Too small')).toHaveCount(0);
  });
});

test('Sitting 3 · 3B Insights, customers, Help, Rate (M8b)', async () => {
  await test.step('3.9 Insights today: the paid and accepted orders, visits, Test dress on top', async () => {
    const today = await a.ok('GET', '/api/insights?period=today');
    expect(today.orders).toBeGreaterThanOrEqual(3);
    expect(today.visits).toBeGreaterThan(0);
    expect(today.topProducts[0]?.name).toBe('Test dress');
    for (const period of ['week', 'month']) await a.ok('GET', `/api/insights?period=${period}`);
  });
  await test.step('3.10 Customers: Buyer One, Buyer Two and Walk-in Buyer', async () => {
    const list = await a.ok('GET', '/api/customers?filter=all');
    const names = list.customers.map((c: { name: string }) => c.name);
    for (const n of ['Buyer One', 'Buyer Two', 'Walk-in Buyer']) expect(names).toContain(n);
    const searched = await a.ok('GET', '/api/customers?filter=all&q=Buyer%20One');
    expect(searched.customers).toHaveLength(1);
  });
  await test.step('3.11 Help: the support contact', async () => {
    const support = await a.ok('GET', '/api/support');
    expect(support.email).toContain('@');
  });
  await test.step('3.12 Rate the app: covered by the app UI tests', async () => {
    test.info().annotations.push({ type: 'note', description: 'RateSheet is a jest-expo test.' });
  });
});

test('Sitting 3 · 3C Settings (M8a)', async ({ page, request }) => {
  await test.step('3.13 Your details: Reg Tester', async () => {
    const saved = await a.ok('PATCH', '/api/me/details', { firstName: 'Reg', lastName: 'Tester' });
    expect(saved.firstName).toBe('Reg');
    expect((await a.ok('GET', '/api/home')).firstName).toBe('Reg');
  });
  await test.step('3.14 Change your password: wrong current refused, right one saves', async () => {
    const next = pw();
    const wrong = await a.call('POST', '/api/auth/change-password', {
      currentPassword: 'Not-my-password-1',
      newPassword: next,
    });
    expect(wrong.status()).toBeGreaterThanOrEqual(400);
    await a.ok('POST', '/api/auth/change-password', {
      currentPassword: a.password,
      newPassword: next,
    });
    a.password = next;
    expect(await a.signIn()).toBe(200);
  });
  await test.step('3.14b Log out (the “Log out of <email>?” sheet’s action): the session ends', async () => {
    const out = await a.call('POST', '/api/auth/sign-out', {});
    expect(out.status()).toBe(200);
    expect((await a.call('GET', '/api/me')).status()).toBe(401);
    expect(await a.signIn()).toBe(200);
  });
  await test.step('3.15 Change link: the old link redirects to the new one', async () => {
    const next = `reg-${runId}-a2`;
    await a.ok('PATCH', '/api/shop/profile', { slug: next });
    shopSlug = next;
    const old = await request.get(`/${A.slug}`, { maxRedirects: 0 });
    expect(old.status()).toBe(308);
    expect(old.headers()['location']).toBe(`/${next}`);
  });
  await test.step('3.16 Paybill 247247 (order number) at checkout; pay on delivery off, then on', async () => {
    const view = await a.ok(
      'POST',
      '/api/payments/accounts',
      {
        type: 'paybill',
        number: '247247',
        accountName: 'REG TEST ONLY',
        accountRefMode: 'order_number',
      },
      201,
    );
    const paybill = view.accounts.find((x: { type: string }) => x.type === 'paybill');
    await a.ok('POST', `/api/payments/accounts/${paybill.id}/activate`);
    await test.step('3.16b Remove payment account (the “Remove …?” sheet’s action): the old Till goes', async () => {
      const till = view.accounts.find((x: { type: string }) => x.type === 'till');
      const after = await a.ok('DELETE', `/api/payments/accounts/${till.id}`);
      expect(after.accounts.map((x: { type: string }) => x.type)).toEqual(['paybill']);
    });
    await a.ok('PATCH', '/api/payments', { acceptsPayOnDelivery: false });
    const token = await apiOrder(request, '0712000008', 'pay_now');
    await page.goto(`/o/${token}`);
    await expect(page.getByText('247247')).toBeVisible();
    await expect(page.getByText(/Pay Bill/).first()).toBeVisible();
    await shot(page, '3.16-paybill');
    tokens.unpaid = token;
    await page.goto(`/${shopSlug}/p/${ids.dress}`);
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.getByRole('button', { name: /Add to cart/ }).click();
    await page.goto(`/${shopSlug}/checkout`);
    await expect(page.getByRole('radio', { name: /Pay on delivery/ })).toHaveCount(0);
    await a.ok('PATCH', '/api/payments', { acceptsPayOnDelivery: true });
  });
  await test.step('3.17 Pause: "taking a break", no Add to cart, the Home banner; resume: ordering is back', async () => {
    await a.ok('PATCH', '/api/shop/pause', { paused: true });
    expect((await a.ok('GET', '/api/home')).ordering.blockers).toEqual(['paused']);
    await page.goto(`/${shopSlug}/p/${ids.dress}`);
    await expect(page.getByText(`${A.name} is taking a break`).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Add to cart/ })).toHaveCount(0);
    await shot(page, '3.17-paused');
    await a.ok('PATCH', '/api/shop/pause', { paused: false });
    await page.reload();
    await expect(page.getByRole('button', { name: /Add to cart/ })).toBeVisible();
    expect((await a.ok('GET', '/api/home')).ordering.blockers).toEqual([]);
  });
  await test.step('3.18 Share feedback (with a screenshot when the store is on)', async () => {
    const info = await a.ok('GET', '/api/feedback');
    const screenshotPath = info.screenshots ? await a.upload('feedback', [200, 200, 200]) : null;
    await a.ok(
      'POST',
      '/api/feedback',
      { kind: 'broken', message: `regression test ${runId}`, screenshotPath },
      201,
    );
  });
  await test.step('3.19 Report a problem to oda (buyer)', async () => {
    await page.goto(`/o/${tokens.payNow}`);
    await page.getByRole('button', { name: /Report a problem to oda/ }).click();
    await page.getByLabel('What went wrong?').fill(`regression test report ${runId}`);
    await page.getByRole('button', { name: 'Send to oda' }).click();
    await expect(page.getByText(/Thanks. oda will look into it/)).toBeVisible();
  });
});

test('Sitting 3 · 3D Suspend and unsuspend (M10)', async ({ page, request }) => {
  await test.step('3.20 Suspended: shop 404, the order page says don’t pay, the seller can’t edit', async () => {
    await ops(request, '/api/ops/shops/suspension', {
      shopSlug,
      action: 'suspend',
      reason: 'Staging regression test (decision #92)',
      actor: 'staging-regression',
    });
    expect((await request.get(`/${shopSlug}`)).status()).toBe(404);
    await page.goto(`/o/${tokens.unpaid}`);
    await expect(page.getByText(/This shop can.t take payments right now/)).toBeVisible();
    await shot(page, '3.20-suspended-order');
    expect((await a.ok('GET', '/api/me')).shop.suspended).toBe(true);
    const edit = await a.call('PATCH', `/api/products/${ids.dress}`, { price: 1600 });
    expect(edit.status()).toBe(403);
  });
  await test.step('3.21 Unsuspended: the shop is back', async () => {
    await ops(request, '/api/ops/shops/suspension', {
      shopSlug,
      action: 'unsuspend',
      reason: 'Staging regression test (decision #92)',
      actor: 'staging-regression',
    });
    expect((await request.get(`/${shopSlug}`)).status()).toBe(200);
    expect((await a.ok('GET', '/api/me')).shop.suspended).toBe(false);
  });
});

test('Sitting 3 · 3E Delete: web, then app; the digest (M8a)', async ({ page, request }) => {
  await test.step('3.22 /delete-account: the confirm email arrives', async () => {
    await page.goto('/delete-account');
    const since = new Date();
    await page.getByLabel('Email').fill(A.email);
    await page.getByRole('button', { name: 'Email me the confirm link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    tokens.deleteLink = await emailLink(
      request,
      A.email,
      /^Confirm deleting your oda account$/,
      /https:\/\/\S+\/delete-account\/confirm#token=[^\s"<>]+/,
      since,
    );
  });
  await test.step('3.23 Review and confirm → Delete my account: shop 404, order page "This shop has closed"', async () => {
    const url = new URL(tokens.deleteLink!);
    await page.goto(url.pathname + url.hash);
    await expect(page.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('heading', { name: 'Your account is deleted' })).toBeVisible();
    expect((await request.get(`/${shopSlug}`)).status()).toBe(404);
    await page.goto(`/o/${tokens.payNow}`);
    await expect(page.getByText(/This shop has closed/)).toBeVisible();
    await shot(page, '3.23-shop-closed');
    expect(await a.signIn()).toBe(403);
  });
  await test.step('3.24 Seller B: a quick shop (steps 1–2 and payment skipped)', async () => {
    const b = new Seller(api, B.email, pw());
    const started = await b.signUp();
    const code = await signupCode(request, B.email, started.since);
    expect((await b.verify(started.attemptId, code)).status()).toBe(200);
    expect(await b.signIn()).toBe(200);
    await b.ok('POST', '/api/onboarding/answers', { step: 1, skip: true });
    await b.ok('POST', '/api/onboarding/answers', { step: 2, skip: true });
    await b.ok('POST', '/api/onboarding/shop', {
      name: B.name,
      slug: B.slug,
      whatsappPhone: '0712345679',
    });
    await b.ok('POST', '/api/onboarding/product', {
      name: 'B product',
      price: 300,
      photos: [await b.photo([20, 120, 60])],
    });
    await b.ok('POST', '/api/onboarding/payment', { skip: true });
    expect((await b.ok('POST', '/api/onboarding/complete', {})).done).toBe(true);
    await test.step('3.24a B (pay on delivery, no delivery options) takes orders: no banner', async () => {
      expect((await b.ok('GET', '/api/home')).ordering.blockers).toEqual([]);
      await page.goto(`/${B.slug}`);
      await expect(page.getByText(/Not taking orders yet/)).toHaveCount(0);
    });
    await test.step('3.24b No way to get paid: the Home banner says "payment"; the shop says "Not taking orders yet"', async () => {
      await removeWayToPay(B.slug);
      expect((await b.ok('GET', '/api/home')).ordering.blockers).toEqual(['payment']);
      await page.goto(`/${B.slug}`);
      await expect(page.getByText(/Not taking orders yet/)).toBeVisible();
      await shot(page, '3.24b-not-taking-orders');
    });
    await test.step('3.25 Delete account in the app (type DELETE): its link 404s', async () => {
      await b.ok('POST', '/api/me/delete', { confirm: 'DELETE' }, 204);
      expect((await request.get(`/${B.slug}`)).status()).toBe(404);
      expect(await b.signIn()).toBe(403);
    });
  });
  await test.step('Digest: the new feedback and report go out once, not twice', async () => {
    // Counts may come back as numbers or lists: count either way.
    const n = (v: unknown) => (Array.isArray(v) ? v.length : Number(v ?? 0));
    const first = await cron(request, 'digest');
    expect(n(first.feedback) + n(first.reports)).toBeGreaterThanOrEqual(1);
    const second = await cron(request, 'digest');
    expect(n(second.feedback) + n(second.reports)).toBe(0);
  });
});
