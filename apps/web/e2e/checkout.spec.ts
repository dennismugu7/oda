import { expect, test } from '@playwright/test';
import { setProductPrice } from '../test/e2eShop';
import { addDressAndBag, fillDetails, sellerShop } from './shop';

// Checkout (M5 CP2, web 4-checkout): cart → checkout → order page at 390 × 844, for pay on
// delivery and pay now; a price changed after add-to-cart is caught; a double tap places one
// order; the order link carries only the random token.

test('pay on delivery: cart → checkout → order placed', async ({ page, request }) => {
  const slug = await sellerShop(request, {
    areas: [
      { name: 'CBD', fee: 200, etaLabel: 'Same day' },
      { name: 'Upcountry', fee: 450, freeDeliveryEligible: false },
    ],
    pickup: true,
  });
  await addDressAndBag(page, slug);
  await page.getByRole('link', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(page.getByText('2 items ·')).toBeVisible();

  // Nothing chosen yet: the button asks for everything, without placing anything.
  await expect(page.getByRole('button', { name: 'Place order' })).toBeEnabled();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText('Enter your name.')).toBeVisible();
  await expect(page.getByText('Choose delivery or pickup.')).toBeVisible();

  await fillDetails(page);
  await page.getByRole('radio', { name: /Upcountry/ }).check();
  await expect(page.getByRole('button', { name: 'Place order · KES 4,750' })).toBeVisible();
  await page.getByRole('radio', { name: /CBD/ }).check();
  await page.getByLabel('Area, street or building').fill('Moi Avenue, Bazaar Plaza');
  // Fixed fields lose their messages.
  await expect(page.getByText('Enter your name.')).toHaveCount(0);
  await expect(page.getByText('Choose delivery or pickup.')).toHaveCount(0);
  // Only pay on delivery: preselected.
  await expect(page.getByRole('radio', { name: /Pay on delivery/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Pay now/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('4-checkout-390x844.png'), fullPage: true });
  await page.getByRole('button', { name: 'Place order · KES 4,500' }).click();

  await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
  await expect(page.getByText('You pay KES 4,500 on delivery')).toBeVisible();
  await expect(page.getByText('Waiting for E2E Boutique to accept')).toBeVisible();
  // The cart is empty afterwards.
  await page.goto(`/${slug}/cart`);
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('pay now: till instructions, and a double tap places one order', async ({ page, request }) => {
  const slug = await sellerShop(request, { till: true, pickup: true });
  await addDressAndBag(page, slug);
  await page.goto(`/${slug}/checkout`);
  await fillDetails(page);
  await page.getByRole('radio', { name: /Pickup/ }).check();
  await expect(page.getByLabel('Area, street or building')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Pay now with M-Pesa/ })).toBeChecked();

  const orders: number[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('/orders') && r.request().method() === 'POST') orders.push(r.status());
  });
  await page.getByRole('button', { name: 'Place order · KES 4,300' }).dblclick();
  await expect(page).toHaveURL(/\/o\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByRole('heading', { name: 'Pay KES 4,300 to E2E Boutique' })).toBeVisible();
  await expect(page.getByText('5123456')).toBeVisible();
  await expect(page.getByText('E2E BOUTIQUE', { exact: true })).toBeVisible();
  expect(orders.filter((s) => s === 201)).toHaveLength(1);
  // The order page never shows the order's id in the URL.
  expect(page.url()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
});

test('a price changed after add-to-cart is caught before ordering', async ({ page, request }) => {
  const slug = await sellerShop(request);
  await addDressAndBag(page, slug);
  await setProductPrice(slug, 'Kitenge wrap dress', 2800);
  await page.goto(`/${slug}/checkout`);
  await fillDetails(page);
  await page.getByLabel('Area, street or building').fill('Moi Avenue');
  await expect(page.getByText('Some prices changed since you added them')).toBeVisible();
  await expect(page.getByText(/Kitenge wrap dress: now KES 2,800/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check the new prices first' })).toBeDisabled();
  await page.getByRole('button', { name: 'OK, use the new prices' }).click();
  await page.getByRole('button', { name: 'Place order · KES 4,800' }).click();
  await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
  await expect(page.getByText('KES 4,800').first()).toBeVisible();
});
