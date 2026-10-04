import { expect, test, type APIRequestContext } from '@playwright/test';
import { jpeg } from '../test/imageFixtures';
import { appHeaders, createVerifiedSeller, randomIp } from './outbox';

// The buyer storefront end to end (milestones M4): a seller sets up a shop through the real
// API (sign-up, onboarding, signed photo uploads, products), then a buyer browses → searches
// → opens a product → adds it to the cart, at 390 × 844.

const PASSWORD = 'kitenge2026';

async function sellerShop(request: APIRequestContext) {
  const ip = randomIp();
  const email = `shop-${Date.now()}@example.test`;
  await createVerifiedSeller(request, email, PASSWORD, ip);
  const signIn = await request.post('/api/auth/sign-in/email', {
    data: { email, password: PASSWORD },
    headers: appHeaders(ip),
  });
  expect(signIn.status()).toBe(200);
  const { token } = (await signIn.json()) as { token: string };
  const headers = { ...appHeaders(ip), authorization: `Bearer ${token}` };
  const post = async (path: string, data: unknown, status = 200) => {
    const res = await request.post(path, { data, headers });
    expect(res.status(), path).toBe(status);
    return res.json();
  };
  const photo = async () => {
    const file = jpeg();
    const pair = [];
    for (let i = 0; i < 2; i++) {
      const up = await post('/api/uploads', {
        kind: 'product',
        contentType: 'image/jpeg',
        size: file.length,
      });
      const put = await request.fetch(up.url, { method: 'PUT', headers: up.headers, data: file });
      expect(put.status()).toBeLessThan(300);
      pair.push(up.key as string);
    }
    return { objectKey: pair[0], thumbKey: pair[1], width: 1200, height: 1200 };
  };

  const slug = `e2e-${Date.now().toString(36)}`;
  await post('/api/onboarding/answers', { step: 1, businessType: 'fashion' });
  await post('/api/onboarding/answers', { step: 2, skip: true });
  await post('/api/onboarding/shop', { name: 'E2E Boutique', slug, whatsappPhone: '0712345678' });
  await post('/api/onboarding/product', {
    name: 'Kitenge wrap dress',
    price: 2500,
    sizes: ['M', 'L'],
    photos: [await photo()],
  });
  await post('/api/onboarding/payment', { skip: true }); // pay on delivery: taking orders
  await post(
    '/api/products',
    { name: 'Woven kiondo bag', price: 1800, photos: [await photo()] },
    201,
  );
  return slug;
}

test('browse → search → product → cart', async ({ page, request }) => {
  const slug = await sellerShop(request);

  // Shop home (01)
  await page.goto(`/${slug}`);
  await expect(page.getByRole('heading', { name: 'E2E Boutique' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Kitenge wrap dress KES/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Woven kiondo bag KES/ })).toBeVisible();

  // Quick add (no sizes or colours): green tick and the cart bar.
  await page.getByRole('button', { name: 'Add Woven kiondo bag to cart' }).click();
  await expect(page.getByLabel('In your cart')).toBeVisible();
  await expect(page.getByRole('link', { name: /View cart/ })).toBeVisible();

  // Search (07)
  await page.getByLabel('Search this shop').fill('wrap');
  await page.getByLabel('Search this shop').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${slug}/search\\?q=wrap`));
  await expect(page.getByText('1 product')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('07-search-390x844.png'), fullPage: true });

  // Product (02): choosing a size is required, then add two.
  await page.getByRole('link', { name: /Kitenge wrap dress KES/ }).click();
  await expect(page.getByRole('heading', { name: 'Kitenge wrap dress' })).toBeVisible();
  await page.getByRole('button', { name: /Add to cart/ }).click();
  await expect(page.getByText('Choose a size.')).toBeVisible();
  await page.getByRole('button', { name: 'L', exact: true }).click();
  await page.getByRole('button', { name: 'One more' }).click();
  await expect(page.getByRole('button', { name: 'Add to cart · KES 5,000' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('02-product-390x844.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add to cart · KES 5,000' }).click();
  await page.getByRole('link', { name: 'View cart →' }).click();

  // Cart (03): both lines, checked with the server, subtotal KES 6,800.
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await expect(page.getByText('Size L')).toBeVisible();
  await expect(page.getByText('Woven kiondo bag')).toBeVisible();
  await expect(page.getByText('KES 6,800').first()).toBeVisible();
  // Nothing changed since adding (Next's route announcer is also role=alert, outside main).
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('03-cart-390x844.png'), fullPage: true });

  // Changing a quantity updates the total.
  // The bag (added first) is line 1; the dress (2 × KES 2,500) is line 2.
  await page.getByRole('button', { name: 'One less' }).nth(1).click();
  await expect(page.getByText('KES 4,300').first()).toBeVisible();
});

test('an unknown shop is the branded 404', async ({ page }) => {
  const res = await page.goto('/no-such-shop-e2e');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /This page isn.t here/ })).toBeVisible();
});
