import { expect, test } from './test';
import { sellerShop } from './shop';

// The buyer storefront end to end (milestones M4): a seller sets up a shop through the real
// API (sign-up, onboarding, signed photo uploads, products), then a buyer browses → searches
// → opens a product → adds it to the cart, at 390 × 844.

test('browse → search → product → cart', async ({ page, request }) => {
  const slug = await sellerShop(request);

  // Shop home (01)
  await page.goto(`/${slug}`);
  await expect(page.getByRole('heading', { name: 'E2E Boutique' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Kitenge wrap dress KSh/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Woven kiondo bag KSh/ })).toBeVisible();

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
  await page.getByRole('link', { name: /Kitenge wrap dress KSh/ }).click();
  await expect(page.getByRole('heading', { name: 'Kitenge wrap dress' })).toBeVisible();
  await page.getByRole('button', { name: /Add to cart/ }).click();
  await expect(page.getByText('Choose a size.')).toBeVisible();
  await page.getByRole('button', { name: 'L', exact: true }).click();
  await page.getByRole('button', { name: 'One more' }).click();
  await expect(page.getByRole('button', { name: 'Add to cart · KSh 5,000' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('02-product-390x844.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add to cart · KSh 5,000' }).click();
  await page.getByRole('link', { name: 'View cart', exact: true }).click();

  // Cart (03): both lines, checked with the server, subtotal KSh 6,800.
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await expect(page.getByText('Size L')).toBeVisible();
  await expect(page.getByText('Woven kiondo bag')).toBeVisible();
  await expect(page.getByText('KSh 6,800').first()).toBeVisible();
  // Nothing changed since adding (Next's route announcer is also role=alert, outside main).
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('03-cart-390x844.png'), fullPage: true });

  // Changing a quantity updates the total.
  // The bag (added first) is line 1; the dress (2 × KSh 2,500) is line 2.
  await page.getByRole('button', { name: 'One less' }).nth(1).click();
  await expect(page.getByText('KSh 4,300').first()).toBeVisible();
});

test('an old shop link redirects permanently to the current one', async ({ page, request }) => {
  const slug = await sellerShop(request);
  // The page, the search and the ?s= source tag survive the redirect.
  for (const rest of ['?s=wa', '/search?q=wrap&size=M', '/cart']) {
    const res = await request.get(`/${slug}-old${rest}`, { maxRedirects: 0 });
    expect(res.status(), rest).toBe(308);
    expect(res.headers()['location'], rest).toBe(`/${slug}${rest}`);
  }

  await page.goto(`/${slug}-old`);
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));
  await expect(page.getByRole('heading', { name: 'E2E Boutique' })).toBeVisible();
});

test('an unknown shop is the branded 404', async ({ page }) => {
  const res = await page.goto('/no-such-shop-e2e');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /This page isn.t here/ })).toBeVisible();
});
