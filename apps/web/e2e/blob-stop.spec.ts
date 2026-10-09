import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { addDressAndBag, fillDetails, sellerShop } from './shop';

// Storage stops answering (Vercel Blob at a Hobby limit, decision #93 D1): every photo fails
// to load, yet the shop, product, cart, checkout and order pages work and a full order goes
// through. A photo that doesn't load shows the placeholder tile, never a broken image.

/** Every stored photo fails (in these tests storage is the local driver's /api/dev-uploads). */
async function failEveryPhoto(page: Page) {
  const failed: string[] = [];
  await page.route(/\/api\/dev-uploads\//, (route) => {
    failed.push(route.request().url());
    return route.abort('failed');
  });
  return failed;
}

/** No <img> on the page is broken: failed photos were removed, leaving their tile. */
async function expectNoBrokenImages(page: Page) {
  await expect
    .poll(() =>
      page.$$eval('img', (imgs) =>
        imgs.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src),
      ),
    )
    .toEqual([]);
}

test('buyer pages and a full checkout work while every photo fails', async ({ page, request }) => {
  const slug = await sellerShop(request, {
    areas: [{ name: 'CBD', fee: 200, etaLabel: 'Same day' }],
    pickup: true,
  });
  const failed = await failEveryPhoto(page);

  await page.goto(`/${slug}`);
  await expect(page.getByRole('link', { name: /Kitenge wrap dress KES/ })).toBeVisible();
  await expectNoBrokenImages(page);
  expect(failed.length).toBeGreaterThan(0);

  await addDressAndBag(page, slug);
  await expectNoBrokenImages(page);

  await page.getByRole('link', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expectNoBrokenImages(page);
  await fillDetails(page);
  await page.getByRole('radio', { name: /CBD/ }).check();
  await page.getByLabel('Area, street or building').fill('Moi Avenue, Bazaar Plaza');
  await page.getByRole('button', { name: 'Place order · KES 4,500' }).click();

  await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
  await expectNoBrokenImages(page);
});
