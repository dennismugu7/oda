import { expect, test } from './test';
import { sellerHeaders, sellerShop } from './shop';

// M8a settings as buyers see them: no "M-Pesa till checked" anywhere (decision #72 a), and a
// paused shop can be browsed but takes no orders until the seller resumes.

test('no page shows the till badge, even with a Till', async ({ page, request }) => {
  const slug = await sellerShop(request, { till: true });
  await page.goto(`/${slug}`);
  await expect(page.getByRole('heading', { name: 'E2E Boutique' })).toBeVisible();
  await expect(page.getByText(/till checked/i)).toHaveCount(0);

  await page.getByRole('link', { name: /Woven kiondo bag KES/ }).click();
  await expect(page.getByRole('heading', { name: 'Woven kiondo bag' })).toBeVisible();
  await expect(page.getByText(/till checked/i)).toHaveCount(0);
  await page.getByRole('button', { name: /Add to cart/ }).click();

  await page.goto(`/${slug}/checkout`);
  await expect(page.getByText(/Pay now with M-Pesa/)).toBeVisible();
  await expect(page.getByText(/till checked/i)).toHaveCount(0);
});

test('pause → browse only, no orders; resume → orders again', async ({ page, request }) => {
  const slug = await sellerShop(request);
  const pause = async (paused: boolean) => {
    const res = await request.patch('/api/shop/pause', {
      data: { paused },
      headers: sellerHeaders.get(slug)!,
    });
    expect(res.status()).toBe(200);
  };

  await pause(true);
  await page.goto(`/${slug}`);
  await expect(page.getByText('E2E Boutique is taking a break.')).toBeVisible();
  await page.getByRole('link', { name: /Woven kiondo bag KES/ }).click();
  await expect(page.getByRole('heading', { name: 'Woven kiondo bag' })).toBeVisible();
  await expect(page.getByText('E2E Boutique is taking a break')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add to cart/ })).toHaveCount(0);

  await pause(false);
  await page.reload();
  await expect(page.getByText('E2E Boutique is taking a break')).toHaveCount(0);
  await page.getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`/${slug}/checkout`);
  await expect(page.getByRole('button', { name: /Place order/ })).toBeVisible();
});
